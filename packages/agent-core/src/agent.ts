import { z } from 'zod';
import { parseCode, validateCode } from './code';
import { ANALYSIS_SYSTEM, analysisParts, fixParts, generateParts, systemPrompt } from './prompts';
import { createRenderer } from './renderer';
import { extractTokens } from './tokens';
import { compareImages } from './tools';
import type {
  AgentConfig,
  AgentInput,
  AgentResult,
  Comparison,
  DesignTokens,
  FinalStatus,
  GeneratedCode,
  LlmClient,
  Renderer,
  StepRecord,
  StopReason,
  VerifyResult
} from './types';

const analysisSchema = z.object({
  summary: z.string(),
  palette: z.array(z.string()).default([]),
  fonts: z.string().default(''),
  texts: z.array(z.string()).default([]),
  layout: z.string().default('')
});

type Analysis = z.infer<typeof analysisSchema>;

interface Attempt {
  iteration: number;
  tsx: string;
  css: string;
  compiled: boolean;
  similarity: number;
  blocking: number;
  consoleErrors: number;
  typeErrors: number;
  passed: boolean;
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in reply');
  return JSON.parse(text.slice(start, end + 1));
}

function countBlocking(verify: VerifyResult): number {
  return verify.a11y
    .filter((issue) => issue.impact === 'serious' || issue.impact === 'critical')
    .reduce((total, issue) => total + issue.count, 0);
}

function buildFeedback(
  iteration: number,
  verify: VerifyResult,
  comparison: Comparison | null,
  config: AgentConfig
): string {
  const lines = [`Results of iteration ${iteration}:`];
  if (!verify.compiled) {
    lines.push('The build failed:');
    verify.compileErrors.forEach((error) => lines.push(`- ${error}`));
  }
  if (verify.typeErrors.length) {
    lines.push('Type errors:');
    verify.typeErrors.forEach((error) => lines.push(`- ${error}`));
  }
  if (verify.consoleErrors.length) {
    lines.push('Runtime errors:');
    verify.consoleErrors.forEach((error) => lines.push(`- ${error}`));
  }
  if (comparison) {
    lines.push(
      `Visual similarity is ${(comparison.similarity * 100).toFixed(1)}%, the target is ${(config.similarityThreshold * 100).toFixed(0)}%.`
    );
    if (comparison.regions.length) lines.push(`Largest mismatches: ${comparison.regions.join(', ')}.`);
  }
  const serious = verify.a11y.filter((issue) => issue.impact === 'serious' || issue.impact === 'critical');
  if (serious.length) {
    lines.push('Accessibility problems to fix:');
    serious.slice(0, 5).forEach((issue) => lines.push(`- ${issue.id}: ${issue.help} (${issue.count} elements)`));
  }
  return lines.join('\n');
}

export async function runAgent(
  input: AgentInput,
  llm: LlmClient,
  config: AgentConfig,
  onStep: (step: StepRecord) => Promise<void> | void,
  renderer?: Renderer
): Promise<AgentResult> {
  const started = Date.now();
  let stepIndex = 0;
  let totalCost = 0;

  const emit = async (step: Omit<StepRecord, 'index'>) => {
    await onStep({ ...step, index: stepIndex++ });
  };

  const budgetStop = (): StopReason | null => {
    if (totalCost >= config.maxCostUsd) return 'budget_cost';
    if (Date.now() - started >= config.maxSeconds * 1000) return 'budget_time';
    return null;
  };

  const ownRenderer = renderer === undefined;
  const active = renderer ?? (await createRenderer(input.framework));
  const system = systemPrompt(input.framework);
  try {
    let analysis: Analysis = { summary: '', palette: [], fonts: '', texts: [], layout: '' };

    if (!input.resume) {
      const tokensStart = Date.now();
      let tokens: DesignTokens | null = null;
      try {
        tokens = extractTokens(input.designPng);
      } catch {
        tokens = null;
      }
      await emit({
        type: 'tool',
        name: 'extract_tokens',
        summary: tokens
          ? `Measured ${tokens.palette.length} dominant colors, background ${tokens.background}`
          : 'Color measurement failed, continuing without it',
        data: tokens,
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        durationMs: Date.now() - tokensStart
      });

      let analysisOk = false;
      let analysisTokensIn = 0;
      let analysisTokensOut = 0;
      let analysisCost = 0;
      const analysisStart = Date.now();
      for (let attempt = 0; attempt < 2 && !analysisOk && !budgetStop(); attempt++) {
        const res = await llm.complete({
          system: ANALYSIS_SYSTEM,
          parts: analysisParts(input, tokens),
          json: true,
          maxTokens: 1500
        });
        totalCost += res.costUsd;
        analysisCost += res.costUsd;
        analysisTokensIn += res.tokensIn;
        analysisTokensOut += res.tokensOut;
        try {
          analysis = analysisSchema.parse(extractJson(res.text));
          analysisOk = true;
        } catch {
          analysisOk = false;
        }
      }
      if (analysisOk && tokens?.palette.length) analysis = { ...analysis, palette: tokens.palette };
      await emit({
        type: 'analysis',
        name: 'analyze_design',
        summary: analysisOk ? analysis.summary.slice(0, 200) : 'Analysis failed, continuing without it',
        data: analysisOk ? analysis : null,
        tokensIn: analysisTokensIn,
        tokensOut: analysisTokensOut,
        cost: analysisCost,
        durationMs: Date.now() - analysisStart
      });
    }

    const attempts: Attempt[] = [];
    let current: GeneratedCode | null = input.resume ? { tsx: input.resume.tsx, css: input.resume.css } : null;
    let feedback = input.resume
      ? `The user asked for this change: ${input.resume.instruction}\nApply it and keep everything else matching the design.`
      : '';
    let lastRender: Buffer | undefined;
    let lastDiff: Buffer | undefined;
    let previousSimilarity: number | null = null;
    let stagnant = 0;
    let stopReason: StopReason = 'max_iterations';

    for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
      const stop = budgetStop();
      if (stop) {
        stopReason = stop;
        break;
      }

      const generateStart = Date.now();
      const parts = current
        ? fixParts(input, current, feedback, lastRender, lastDiff)
        : generateParts(input, analysis, feedback);
      const res = await llm.complete({ system, parts, maxTokens: 6000 });
      totalCost += res.costUsd;
      const code = parseCode(res.text, input.framework);
      await emit({
        type: 'generate',
        name: current ? 'fix_component' : 'generate_component',
        iteration,
        summary: code
          ? `${code.tsx.split('\n').length} lines of code${code.css ? `, ${code.css.split('\n').length} lines of CSS` : ''}`
          : 'The reply did not contain the expected code blocks',
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        cost: res.costUsd,
        durationMs: Date.now() - generateStart
      });
      if (!code) {
        feedback = 'Your previous reply did not contain the expected fenced code blocks. Reply with those blocks only.';
        continue;
      }
      current = code;

      const verifyStart = Date.now();
      const guard = validateCode(code, input.framework);
      const verify: VerifyResult = guard
        ? { compiled: false, compileErrors: [guard], typeErrors: [], consoleErrors: [], a11y: [] }
        : await active.render(code, { width: input.width, height: input.height });
      const comparison = verify.renderPng ? compareImages(input.designPng, verify.renderPng) : null;
      const blocking = countBlocking(verify);
      const passed =
        verify.compiled &&
        verify.typeErrors.length === 0 &&
        verify.consoleErrors.length === 0 &&
        comparison !== null &&
        comparison.similarity >= config.similarityThreshold &&
        blocking <= config.a11yMaxBlocking;

      attempts.push({
        iteration,
        tsx: code.tsx,
        css: code.css,
        compiled: verify.compiled,
        similarity: comparison?.similarity ?? 0,
        blocking,
        consoleErrors: verify.consoleErrors.length,
        typeErrors: verify.typeErrors.length,
        passed
      });
      lastRender = verify.renderPng;
      lastDiff = comparison?.diffPng;

      const similarityText = comparison ? `${(comparison.similarity * 100).toFixed(1)}% similar` : 'no render';
      await emit({
        type: 'verify',
        name: 'verify_component',
        iteration,
        summary: verify.compiled
          ? `${similarityText}, ${verify.typeErrors.length} type errors, ${blocking} blocking accessibility issues, ${verify.consoleErrors.length} runtime errors`
          : `Build failed: ${verify.compileErrors[0] ?? 'unknown error'}`,
        data: {
          compiled: verify.compiled,
          compileErrors: verify.compileErrors,
          typeErrors: verify.typeErrors,
          consoleErrors: verify.consoleErrors,
          similarity: comparison?.similarity ?? null,
          regions: comparison?.regions ?? [],
          a11y: verify.a11y,
          blocking,
          passed
        },
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        durationMs: Date.now() - verifyStart,
        artifacts: { renderPng: verify.renderPng, diffPng: comparison?.diffPng }
      });

      if (passed) {
        stopReason = 'passed';
        break;
      }

      if (comparison) {
        if (previousSimilarity !== null && comparison.similarity - previousSimilarity < 0.005) stagnant++;
        else stagnant = 0;
        previousSimilarity = comparison.similarity;
        if (stagnant >= 2) {
          stopReason = 'no_progress';
          break;
        }
      }

      feedback = buildFeedback(iteration, verify, comparison, config);
    }

    if (attempts.length === 0) throw new Error('The model never produced a usable component');

    const passedAttempt = attempts.find((attempt) => attempt.passed);
    const bestCompiled = attempts.filter((attempt) => attempt.compiled).sort((x, y) => y.similarity - x.similarity)[0];
    const chosen = passedAttempt ?? bestCompiled ?? attempts[attempts.length - 1];

    const status: FinalStatus = passedAttempt
      ? 'passed'
      : stopReason === 'budget_cost' || stopReason === 'budget_time'
        ? 'budget_exceeded'
        : 'failed';

    return {
      status,
      stopReason,
      tsx: chosen.tsx,
      css: chosen.css,
      metrics: {
        similarity: chosen.similarity,
        a11yBlocking: chosen.blocking,
        compiled: chosen.compiled,
        consoleErrors: chosen.consoleErrors,
        typeErrors: chosen.typeErrors,
        iterations: attempts.length,
        bestIteration: chosen.iteration,
        totalCost,
        totalDurationMs: Date.now() - started
      }
    };
  } finally {
    if (ownRenderer) await active.close();
  }
}
