import { Controller, Get, Header, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { MetricsView } from '@designloop/shared';
import { AdminGuard } from './admin.guard';
import { PrismaService } from './prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', database: 'down' });
    }
  }

  @Get('metrics')
  @UseGuards(AdminGuard)
  metrics(): Promise<MetricsView> {
    return this.collect();
  }

  @Get('metrics/prometheus')
  @UseGuards(AdminGuard)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async prometheus(): Promise<string> {
    const metrics = await this.collect();
    const lines = [
      '# HELP designloop_runs Runs created in the last 24 hours, by status',
      '# TYPE designloop_runs gauge',
      ...Object.entries(metrics.byStatus).map(([status, count]) => `designloop_runs{status="${status}"} ${count}`)
    ];
    const gauges: [string, string, number | null][] = [
      ['designloop_pass_rate', 'Share of finished runs that passed in the last 24 hours', metrics.passRate],
      ['designloop_mean_similarity', 'Mean visual similarity of finished runs', metrics.meanSimilarity],
      ['designloop_mean_cost_usd', 'Mean cost per finished run in USD', metrics.meanCostUsd],
      ['designloop_mean_duration_seconds', 'Mean duration of finished runs', metrics.meanDurationMs === null ? null : metrics.meanDurationMs / 1000],
      ['designloop_cost_usd', 'Total cost of runs in the last 24 hours in USD', metrics.totalCostUsd]
    ];
    for (const [name, help, value] of gauges) {
      if (value === null) continue;
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private async collect(): Promise<MetricsView> {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const grouped = await this.prisma.run.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true }
    });
    const totals = await this.prisma.run.aggregate({
      where: { createdAt: { gte: since }, finishedAt: { not: null } },
      _avg: { totalCost: true, totalDurationMs: true, similarity: true },
      _sum: { totalCost: true }
    });
    const byStatus: Record<string, number> = {};
    for (const row of grouped) byStatus[row.status] = row._count._all;
    const finished = (byStatus.passed ?? 0) + (byStatus.failed ?? 0) + (byStatus.budget_exceeded ?? 0);
    return {
      windowHours: 24,
      byStatus,
      passRate: finished ? (byStatus.passed ?? 0) / finished : null,
      meanCostUsd: totals._avg.totalCost ?? null,
      meanDurationMs: totals._avg.totalDurationMs ?? null,
      meanSimilarity: totals._avg.similarity ?? null,
      totalCostUsd: totals._sum.totalCost ?? 0
    };
  }
}
