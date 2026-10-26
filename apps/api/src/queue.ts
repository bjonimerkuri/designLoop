import PgBoss from 'pg-boss';

const QUEUE_NAME = 'designloop-runs';

export interface RunQueue {
  start(handler: (runId: string) => Promise<void>, work: boolean): Promise<void>;
  enqueue(runId: string): Promise<void>;
  stop(): Promise<void>;
}

export class MemoryQueue implements RunQueue {
  private chain: Promise<void> = Promise.resolve();
  private handler: ((runId: string) => Promise<void>) | null = null;

  async start(handler: (runId: string) => Promise<void>, work: boolean) {
    this.handler = work ? handler : null;
  }

  async enqueue(runId: string) {
    const handler = this.handler;
    if (!handler) return;
    this.chain = this.chain.then(() => handler(runId)).catch(() => undefined);
  }

  async stop() {
    await this.chain;
  }
}

export class PgBossQueue implements RunQueue {
  private boss: PgBoss | null = null;

  constructor(private readonly connectionString: string) {}

  async start(handler: (runId: string) => Promise<void>, work: boolean) {
    const boss = new PgBoss(this.connectionString);
    boss.on('error', (error) => console.error(JSON.stringify({ event: 'queue_error', message: error.message })));
    await boss.start();
    await boss.createQueue(QUEUE_NAME).catch(() => undefined);
    this.boss = boss;
    if (work) {
      await boss.work<{ runId: string }>(QUEUE_NAME, { pollingIntervalSeconds: 2 }, async (jobs) => {
        for (const job of jobs) await handler(job.data.runId);
      });
    }
  }

  async enqueue(runId: string) {
    if (!this.boss) throw new Error('The queue has not started');
    await this.boss.send(QUEUE_NAME, { runId }, { retryLimit: 1, expireInSeconds: 1800 });
  }

  async stop() {
    await this.boss?.stop({ graceful: true });
  }
}

export function createQueue(env: NodeJS.ProcessEnv = process.env): RunQueue {
  return env.QUEUE === 'pgboss' ? new PgBossQueue(env.DATABASE_URL ?? '') : new MemoryQueue();
}
