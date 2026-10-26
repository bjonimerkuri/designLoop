import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { EvalHistoryPoint, EvalMeta, EvalReportFile, EvalSummary } from '@designloop/shared';
import { EVALS_DIR } from './config';
import { PrismaService } from './prisma.service';

const NAME_PATTERN = /^[\w.-]+\.json$/;

@Controller('evals')
export class EvalsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<Pick<EvalReportFile, 'name' | 'meta' | 'summaries'>[]> {
    const names = (await readdir(EVALS_DIR).catch(() => [] as string[]))
      .filter((name) => NAME_PATTERN.test(name))
      .sort()
      .reverse()
      .slice(0, 20);
    const reports: Pick<EvalReportFile, 'name' | 'meta' | 'summaries'>[] = [];
    for (const name of names) {
      const file = JSON.parse(await readFile(join(EVALS_DIR, name), 'utf8')) as EvalReportFile;
      reports.push({ name, meta: file.meta, summaries: file.summaries });
    }
    return reports;
  }

  @Get('history')
  async history(): Promise<EvalHistoryPoint[]> {
    const rows = await this.prisma.evalRun.findMany({ orderBy: { createdAt: 'asc' }, take: 100 });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      meta: row.meta as unknown as EvalMeta,
      summaries: row.summaries as unknown as EvalSummary[]
    }));
  }

  @Get(':name')
  async get(@Param('name') name: string): Promise<EvalReportFile> {
    if (!NAME_PATTERN.test(name)) throw new NotFoundException();
    try {
      const file = JSON.parse(await readFile(join(EVALS_DIR, name), 'utf8')) as EvalReportFile;
      return { ...file, name };
    } catch {
      throw new NotFoundException();
    }
  }
}
