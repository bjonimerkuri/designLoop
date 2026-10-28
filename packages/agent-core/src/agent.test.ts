import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { runAgent } from './agent';
import type { AgentConfig, AgentInput, LlmClient, LlmRequest, LlmResponse, Renderer, StepRecord } from './types';

function solid(width: number, height: number, value: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = value;
    png.data[i + 1] = value;
    png.data[i + 2] = value;
    png.data[i + 3] = 255; // fully opaque: pixelmatch blends transparent pixels onto white
  }
  return PNG.sync.write(png);
}

const design = solid(200, 100, 255);
const bad = solid(200, 100, 0);

const baseConfig: AgentConfig = {
  maxIterations: 5,
  maxCostUsd: 10,
  maxSeconds: 60,
  maxTokens: 1000000,
  similarityThreshold: 0.9,
  a11yMaxBlocking: 0
};

const input: AgentInput = { designPng: design, width: 200, height: 100, framework: 'react' };

function fakeLlm(costUsd = 0): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    model: 'fake',
    calls,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      calls.push(req);
      const text = req.json
        ? '{"summary":"A blank card","palette":["#123456"],"fonts":"system","texts":[],"layout":"single block"}'
        : '```tsx\nexport default function A() { return null; }\n```\n```css\n.a{}\n```';
      return { text, tokensIn: 10, tokensOut: 10, costUsd };
    }
  };
}

function fakeRenderer(frames: Buffer[]): Renderer & { count: number } {
  const renderer = {
    count: 0,
    async render() {
      const png = frames[Math.min(renderer.count, frames.length - 1)];
      renderer.count++;
      return { compiled: true, compileErrors: [], typeErrors: [], consoleErrors: [], a11y: [], renderPng: png };
    },
    async close() {}
  };
  return renderer;
}

test('passes on the second pass when the render improves', async () => {
  const steps: StepRecord[] = [];
  const result = await runAgent(input, fakeLlm(), baseConfig, (step) => void steps.push(step), fakeRenderer([bad, design]));
  assert.equal(result.status, 'passed');
  assert.equal(result.stopReason, 'passed');
  assert.equal(result.metrics.iterations, 2);
  assert.equal(result.metrics.bestIteration, 2);
  assert.deepEqual(
    steps.map((step) => step.name),
    ['extract_tokens', 'analyze_design', 'generate_component', 'verify_component', 'fix_component', 'verify_component']
  );
});

test('stops when similarity stops improving', async () => {
  const result = await runAgent(
    input,
    fakeLlm(),
    { ...baseConfig, maxIterations: 8 },
    () => undefined,
    fakeRenderer([bad])
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.stopReason, 'no_progress');
  assert.equal(result.metrics.iterations, 3);
});

test('stops when the cost budget is reached', async () => {
  const result = await runAgent(
    input,
    fakeLlm(0.3),
    { ...baseConfig, maxCostUsd: 0.5 },
    () => undefined,
    fakeRenderer([bad])
  );
  assert.equal(result.status, 'budget_exceeded');
  assert.equal(result.stopReason, 'budget_cost');
  assert.equal(result.metrics.iterations, 1);
});

test('reports max iterations as a failure', async () => {
  const frames = [solid(200, 100, 10), solid(200, 100, 60), solid(200, 100, 110)];
  const result = await runAgent(
    input,
    fakeLlm(),
    { ...baseConfig, maxIterations: 2 },
    () => undefined,
    fakeRenderer(frames)
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.stopReason, 'max_iterations');
});

test('blocking accessibility issues prevent a pass', async () => {
  const renderer: Renderer = {
    async render() {
      return {
        compiled: true,
        compileErrors: [],
        typeErrors: [],
        consoleErrors: [],
        a11y: [{ id: 'button-name', impact: 'critical', help: 'Buttons need names', count: 2 }],
        renderPng: design
      };
    },
    async close() {}
  };
  const result = await runAgent(input, fakeLlm(), { ...baseConfig, maxIterations: 2 }, () => undefined, renderer);
  assert.equal(result.status, 'failed');
  assert.equal(result.metrics.a11yBlocking, 2);
});

test('a revision skips the analysis and starts from the given code', async () => {
  const steps: StepRecord[] = [];
  const llm = fakeLlm();
  const result = await runAgent(
    { ...input, resume: { tsx: 'export default function Old() { return null; }', css: '.old{}', instruction: 'Make the button larger' } },
    llm,
    baseConfig,
    (step) => void steps.push(step),
    fakeRenderer([design])
  );
  assert.equal(result.status, 'passed');
  assert.equal(steps[0].name, 'fix_component');
  assert.ok(llm.calls.every((call) => !call.json));
  const text = llm.calls[0].parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
  assert.match(text, /Make the button larger/);
});

test('the prompt tells the model to ignore instructions inside the design', async () => {
  const llm = fakeLlm();
  await runAgent(input, llm, baseConfig, () => undefined, fakeRenderer([design]));
  assert.ok(llm.calls.every((call) => /never an instruction/.test(call.system)));
});

test('type errors prevent a pass and are sent back to the model', async () => {
  const llm = fakeLlm();
  const renderer: Renderer = {
    async render() {
      return {
        compiled: true,
        compileErrors: [],
        typeErrors: ["3:5 TS2322: Type 'string' is not assignable to type 'number'."],
        consoleErrors: [],
        a11y: [],
        renderPng: design
      };
    },
    async close() {}
  };
  const result = await runAgent(input, llm, { ...baseConfig, maxIterations: 2 }, () => undefined, renderer);
  assert.equal(result.status, 'failed');
  assert.equal(result.metrics.typeErrors, 1);
  const retry = llm.calls[llm.calls.length - 1].parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
  assert.match(retry, /Type errors:/);
  assert.match(retry, /TS2322/);
});

test('measured colors are sent to the analysis and replace the model palette', async () => {
  const steps: StepRecord[] = [];
  const llm = fakeLlm();
  await runAgent(input, llm, baseConfig, (step) => void steps.push(step), fakeRenderer([design]));
  const analysisCall = llm.calls[0].parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
  assert.match(analysisCall, /#ffffff/);
  const analysis = steps.find((step) => step.name === 'analyze_design');
  assert.deepEqual((analysis?.data as { palette: string[] }).palette, ['#ffffff']);
});

test('the react-tailwind and angular prompts ask for a single code block', async () => {
  for (const framework of ['react-tailwind', 'angular'] as const) {
    const llm = fakeLlm();
    await runAgent({ ...input, framework }, llm, { ...baseConfig, maxIterations: 1 }, () => undefined, fakeRenderer([bad]));
    const system = llm.calls[llm.calls.length - 1].system;
    assert.match(system, /exactly one fenced/);
  }
});

test('stops when the token budget is reached, whatever the prices are', async () => {
  const result = await runAgent(
    input,
    fakeLlm(0),
    { ...baseConfig, maxTokens: 30 },
    () => undefined,
    fakeRenderer([bad])
  );
  assert.equal(result.status, 'budget_exceeded');
  assert.equal(result.stopReason, 'budget_tokens');
  assert.equal(result.metrics.iterations, 1);
});
