import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  ServiceUnavailableException
} from '@nestjs/common';
import {
  PROMPT_VERSION,
  createLlmClient,
  createUserLlmClient,
  loadAgentConfig,
  readImageSize,
  runAgent,
  sanitizeImage
} from '@designloop/agent-core';
import type { UserLlmConfig } from '@designloop/agent-core';
import { FRAMEWORKS, TERMINAL_STATUSES } from '@designloop/shared';
import type { AppConfig, Framework, RunPage, RunStatus, RunView, StreamEvent } from '@designloop/shared';
import { Prisma } from '@prisma/client';
import { Observable, Subject, Subscription } from 'rxjs';
import { STORAGE_DIR } from './config';
import { reportError } from './error-reporting';
import { KeyVault } from './key-vault';
import { toRunView, toStepView } from './mappers';
import { PrismaService } from './prisma.service';
import { createQueue } from './queue';
import { redactSecrets } from './user-llm';

const ID_PATTERN = /^[a-z0-9]{10,40}$/;
const FILE_PATTERN = /^(design|render-\d{1,2}|diff-\d{1,2})\.png$/;

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback;
};

@Injectable()
export class RunsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RunsService.name);
  private readonly subjects = new Map<string, Subject<StreamEvent>>();
  private readonly hits = new Map<string, number[]>();
  private readonly workerEnabled = process.env.WORKER_ENABLED !== 'false';
  private readonly queue = createQueue();
  private readonly vault = new KeyVault();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.queue.start((id) => this.process(id), this.workerEnabled);
    if (!this.workerEnabled || process.env.QUEUE === 'pgboss') return;
    const stale = await this.prisma.run.findMany({
      where: { status: { in: ['queued', 'running'] } },
      orderBy: { createdAt: 'asc' }
    });
    for (const run of stale) {
      await this.prisma.step.deleteMany({ where: { runId: run.id } });
      if (!run.usesServerKey) {
        await this.prisma.run.update({
          where: { id: run.id },
          data: {
            status: 'error',
            error: 'The server restarted and your API key is not kept, so this run could not continue. Start it again.',
            finishedAt: new Date()
          }
        });
        continue;
      }
      await this.prisma.run.update({ where: { id: run.id }, data: { status: 'queued' } });
      this.enqueue(run.id);
    }
    if (stale.length) this.log('runs_recovered', { count: stale.length });
  }

  async onApplicationShutdown() {
    await this.queue.stop();
  }

  private log(event: string, fields: Record<string, unknown> = {}) {
    this.logger.log(JSON.stringify({ event, ...fields }));
  }

  private async guard(ip: string) {
    const demo = process.env.DEMO_MODE === 'true';
    if (demo) {
      const limit = num(process.env.RATE_LIMIT_PER_HOUR, 5);
      const now = Date.now();
      const recent = (this.hits.get(ip) ?? []).filter((time) => now - time < 3_600_000);
      if (recent.length >= limit) {
        throw new HttpException('The hourly run limit was reached. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
      }
      recent.push(now);
      this.hits.set(ip, recent);
    }
    const cap = num(process.env.DAILY_COST_CAP_USD, demo ? 5 : 0);
    if (cap > 0) {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const total = await this.prisma.run.aggregate({
        _sum: { totalCost: true },
        where: { createdAt: { gte: start }, usesServerKey: true }
      });
      if ((total._sum.totalCost ?? 0) >= cap) {
        throw new HttpException(
          'Today’s budget for live runs is used up. Browse the saved demo runs instead.',
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }
  }

  private serverKeyAvailable(): boolean {
    if (process.env.ALLOW_SERVER_KEY === 'false') return false;
    if (process.env.ALLOW_SERVER_KEY === undefined && process.env.DEMO_MODE === 'true') return false;
    try {
      createLlmClient();
      return true;
    } catch {
      return false;
    }
  }

  publicConfig(): AppConfig {
    return {
      serverKeyAvailable: this.serverKeyAvailable(),
      personalKeysEnabled: process.env.PERSONAL_KEYS !== 'false' && process.env.QUEUE !== 'pgboss',
      demoMode: process.env.DEMO_MODE === 'true'
    };
  }

  private resolveLlm(user: UserLlmConfig | null): { model: string; usesServerKey: boolean } {
    if (user) {
      if (process.env.PERSONAL_KEYS === 'false') {
        throw new BadRequestException('Personal API keys are turned off on this server.');
      }
      if (process.env.QUEUE === 'pgboss') {
        throw new BadRequestException('Personal API keys need the in-process queue (QUEUE=memory).');
      }
      return { model: user.model, usesServerKey: false };
    }
    if (!this.serverKeyAvailable()) {
      throw new BadRequestException('Add your API key in Settings to run the agent.');
    }
    try {
      return { model: createLlmClient().model, usesServerKey: true };
    } catch (error) {
      throw new ServiceUnavailableException(redactSecrets((error as Error).message));
    }
  }

  async create(
    design: Buffer,
    hint: string,
    framework: Framework,
    ip: string,
    user: UserLlmConfig | null = null
  ): Promise<RunView> {
    const header = readImageSize(design);
    if (!header) throw new BadRequestException('Only PNG or JPEG images are supported.');
    if (header.width < 200 || header.width > 1600 || header.height < 100 || header.height > 2000) {
      throw new BadRequestException('The design must be between 200x100 and 1600x2000 pixels.');
    }
    let clean: Buffer;
    try {
      clean = sanitizeImage(design);
    } catch {
      throw new BadRequestException('The image could not be decoded.');
    }
    const size = readImageSize(clean);
    if (!size || size.width !== header.width || size.height !== header.height) {
      throw new BadRequestException('The image header does not match its content.');
    }
    const llm = this.resolveLlm(user);
    if (llm.usesServerKey) await this.guard(ip);

    const run = await this.prisma.run.create({
      data: {
        status: 'queued',
        framework,
        usesServerKey: llm.usesServerKey,
        hint: hint || null,
        model: llm.model,
        width: size.width,
        height: size.height,
        promptVersion: PROMPT_VERSION
      }
    });
    await mkdir(join(STORAGE_DIR, run.id), { recursive: true });
    await writeFile(join(STORAGE_DIR, run.id, 'design.png'), clean);
    if (user) this.vault.put(run.id, user);
    this.log('run_created', {
      runId: run.id,
      framework,
      model: llm.model,
      personalKey: !llm.usesServerKey,
      width: size.width,
      height: size.height
    });
    this.enqueue(run.id);
    return toRunView(run);
  }

  async revise(
    parentId: string,
    instruction: string,
    ip: string,
    user: UserLlmConfig | null = null
  ): Promise<RunView> {
    if (!instruction) throw new BadRequestException('Describe what should change.');
    const parent = await this.prisma.run.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Run not found');
    if (!TERMINAL_STATUSES.includes(parent.status as RunStatus) || !parent.tsx) {
      throw new BadRequestException('Wait for the run to finish before asking for a change.');
    }
    const llm = this.resolveLlm(user);
    if (llm.usesServerKey) await this.guard(ip);

    const run = await this.prisma.run.create({
      data: {
        status: 'queued',
        framework: parent.framework,
        usesServerKey: llm.usesServerKey,
        parentId: parent.id,
        instruction,
        baseTsx: parent.tsx,
        baseCss: parent.css,
        hint: parent.hint,
        model: llm.model,
        width: parent.width,
        height: parent.height,
        promptVersion: PROMPT_VERSION
      }
    });
    await mkdir(join(STORAGE_DIR, run.id), { recursive: true });
    await copyFile(join(STORAGE_DIR, parent.id, 'design.png'), join(STORAGE_DIR, run.id, 'design.png'));
    if (user) this.vault.put(run.id, user);
    this.log('run_created', {
      runId: run.id,
      parentId: parent.id,
      framework: parent.framework,
      model: llm.model,
      personalKey: !llm.usesServerKey
    });
    this.enqueue(run.id);
    return toRunView(run);
  }

  async review(id: string, decision: 'accepted' | 'rejected' | 'none'): Promise<RunView> {
    const run = await this.prisma.run.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Run not found');
    if (!TERMINAL_STATUSES.includes(run.status as RunStatus) || !run.tsx) {
      throw new BadRequestException('Wait for the run to finish before reviewing it.');
    }
    const updated = await this.prisma.run.update({
      where: { id },
      data: { review: decision === 'none' ? null : decision }
    });
    return toRunView(updated);
  }

  async list(query: {
    limit?: number;
    cursor?: string;
    framework?: string;
    status?: string;
    review?: string;
  }): Promise<RunPage> {
    const take = Math.min(100, Math.max(1, Number.isFinite(query.limit) ? Math.floor(query.limit as number) : 20));
    const where: Prisma.RunWhereInput = {};
    if (query.framework && FRAMEWORKS.includes(query.framework as Framework)) where.framework = query.framework;
    if (query.status) where.status = query.status;
    if (query.review === 'accepted' || query.review === 'rejected') where.review = query.review;
    const cursor = query.cursor && ID_PATTERN.test(query.cursor) ? { id: query.cursor } : undefined;

    const rows = await this.prisma.run.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor } : {})
    });
    return {
      items: rows.slice(0, take).map((run) => toRunView(run)),
      nextCursor: rows.length > take ? rows[take].id : null
    };
  }

  async get(id: string): Promise<RunView> {
    const run = await this.prisma.run.findUnique({
      where: { id },
      include: { steps: { orderBy: { index: 'asc' } } }
    });
    if (!run) throw new NotFoundException('Run not found');
    return toRunView(run, run.steps);
  }

  filePath(id: string, name: string): string | null {
    if (!ID_PATTERN.test(id) || !FILE_PATTERN.test(name)) return null;
    const path = join(STORAGE_DIR, id, name);
    return existsSync(path) ? path : null;
  }

  stream(id: string): Observable<StreamEvent> {
    return new Observable<StreamEvent>((subscriber) => {
      let inner: Subscription | undefined;
      let closed = false;

      (async () => {
        const run = await this.prisma.run.findUnique({
          where: { id },
          include: { steps: { orderBy: { index: 'asc' } } }
        });
        if (!run) {
          subscriber.error(new NotFoundException('Run not found'));
          return;
        }
        for (const step of run.steps) subscriber.next({ type: 'step', step: toStepView(step) });
        if (TERMINAL_STATUSES.includes(run.status as RunStatus)) {
          subscriber.next({ type: 'done', status: run.status as RunStatus });
          subscriber.complete();
          return;
        }
        if (closed) return;
        inner = this.subject(id).subscribe({
          next: (event) => subscriber.next(event),
          complete: () => subscriber.complete()
        });
      })().catch((error) => subscriber.error(error));

      return () => {
        closed = true;
        inner?.unsubscribe();
      };
    });
  }

  private subject(id: string): Subject<StreamEvent> {
    let subject = this.subjects.get(id);
    if (!subject) {
      subject = new Subject<StreamEvent>();
      this.subjects.set(id, subject);
    }
    return subject;
  }

  private enqueue(id: string) {
    this.queue.enqueue(id).catch((error) => {
      this.logger.error(JSON.stringify({ event: 'enqueue_failed', runId: id, message: (error as Error).message }));
      reportError(error);
    });
  }

  private async process(id: string) {
    const subject = this.subject(id);
    let secret: string | undefined;
    try {
      const run = await this.prisma.run.findUniqueOrThrow({ where: { id } });
      await this.prisma.step.deleteMany({ where: { runId: id } });
      await this.prisma.run.update({ where: { id }, data: { status: 'running' } });
      this.log('run_started', { runId: id, framework: run.framework, model: run.model });

      const personal = run.usesServerKey ? null : this.vault.take(id);
      if (!run.usesServerKey && !personal) {
        throw new Error('Your API key is no longer available, so this run could not start. Start it again.');
      }
      secret = personal?.apiKey;
      const llm = personal ? createUserLlmClient(personal) : createLlmClient();
      const config = loadAgentConfig();
      const designPng = await readFile(join(STORAGE_DIR, id, 'design.png'));

      const result = await runAgent(
        {
          designPng,
          width: run.width,
          height: run.height,
          framework: run.framework as Framework,
          hint: run.hint ?? undefined,
          resume:
            run.baseTsx && run.instruction
              ? { tsx: run.baseTsx, css: run.baseCss ?? '', instruction: run.instruction }
              : undefined
        },
        llm,
        config,
        async (step) => {
          const saved = await this.prisma.step.create({
            data: {
              runId: id,
              index: step.index,
              type: step.type,
              name: step.name,
              summary: step.summary,
              iteration: step.iteration ?? null,
              data:
                step.data === undefined || step.data === null
                  ? Prisma.JsonNull
                  : (step.data as Prisma.InputJsonValue),
              tokensIn: step.tokensIn,
              tokensOut: step.tokensOut,
              cost: step.cost,
              durationMs: step.durationMs
            }
          });
          if (step.iteration !== undefined) {
            if (step.artifacts?.renderPng) {
              await writeFile(join(STORAGE_DIR, id, `render-${step.iteration}.png`), step.artifacts.renderPng);
            }
            if (step.artifacts?.diffPng) {
              await writeFile(join(STORAGE_DIR, id, `diff-${step.iteration}.png`), step.artifacts.diffPng);
            }
          }
          subject.next({ type: 'step', step: toStepView(saved) });
        }
      );

      await this.prisma.run.update({
        where: { id },
        data: {
          status: result.status,
          stopReason: result.stopReason,
          tsx: result.tsx,
          css: result.css,
          similarity: result.metrics.similarity,
          a11yBlocking: result.metrics.a11yBlocking,
          compiled: result.metrics.compiled,
          iterations: result.metrics.iterations,
          bestIteration: result.metrics.bestIteration,
          totalCost: result.metrics.totalCost,
          totalDurationMs: result.metrics.totalDurationMs,
          finishedAt: new Date()
        }
      });
      this.log('run_finished', {
        runId: id,
        status: result.status,
        stopReason: result.stopReason,
        iterations: result.metrics.iterations,
        similarity: Number(result.metrics.similarity.toFixed(4)),
        costUsd: Number(result.metrics.totalCost.toFixed(4)),
        durationMs: result.metrics.totalDurationMs
      });
      subject.next({ type: 'done', status: result.status });
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : 'Unknown error', secret);
      this.logger.error(JSON.stringify({ event: 'run_failed', runId: id, message }));
      reportError(new Error(message));
      await this.prisma.run
        .update({ where: { id }, data: { status: 'error', error: message, finishedAt: new Date() } })
        .catch(() => undefined);
      subject.next({ type: 'done', status: 'error' });
    } finally {
      this.vault.drop(id);
      subject.complete();
      this.subjects.delete(id);
    }
  }
}
