import type { Run, Step } from '@prisma/client';
import type { Framework, RunStatus, RunView, StepView } from '@designloop/shared';

export function toStepView(step: Step): StepView {
  return {
    id: step.id,
    index: step.index,
    type: step.type,
    name: step.name,
    summary: step.summary,
    iteration: step.iteration,
    data: step.data,
    tokensIn: step.tokensIn,
    tokensOut: step.tokensOut,
    cost: step.cost,
    durationMs: step.durationMs
  };
}

export function toRunView(run: Run, steps?: Step[]): RunView {
  return {
    id: run.id,
    status: run.status as RunStatus,
    framework: run.framework as Framework,
    parentId: run.parentId,
    instruction: run.instruction,
    review: run.review === 'accepted' || run.review === 'rejected' ? run.review : null,
    hint: run.hint,
    model: run.model,
    width: run.width,
    height: run.height,
    promptVersion: run.promptVersion,
    tsx: run.tsx,
    css: run.css,
    error: run.error,
    stopReason: run.stopReason,
    similarity: run.similarity,
    a11yBlocking: run.a11yBlocking,
    compiled: run.compiled,
    iterations: run.iterations,
    bestIteration: run.bestIteration,
    totalCost: run.totalCost,
    totalDurationMs: run.totalDurationMs,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    steps: steps?.map(toStepView)
  };
}
