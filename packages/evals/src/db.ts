import { Prisma, PrismaClient } from '@prisma/client';
import type { EvalReportFile } from '@designloop/shared';

export async function saveReport(report: EvalReportFile): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.evalRun.create({
      data: {
        date: report.meta.date,
        model: report.meta.model,
        promptVersion: report.meta.promptVersion,
        commit: report.meta.commit,
        meta: report.meta as unknown as Prisma.InputJsonValue,
        summaries: report.summaries as unknown as Prisma.InputJsonValue,
        results: {
          create: report.results.map((result) => ({
            fixtureId: result.fixtureId,
            framework: result.framework,
            repeat: result.repeat,
            status: result.status,
            stopReason: result.stopReason,
            passed: result.passed,
            similarity: result.similarity,
            a11yBlocking: result.a11yBlocking,
            compiled: result.compiled,
            consoleErrors: result.consoleErrors,
            typeErrors: result.typeErrors,
            iterations: result.iterations,
            cost: result.cost,
            durationMs: result.durationMs,
            category: result.category,
            error: result.error ?? null
          }))
        }
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}
