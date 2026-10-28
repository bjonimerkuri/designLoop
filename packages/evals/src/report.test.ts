import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EvalMeta, EvalReportFile, EvalResultRecord } from '@designloop/shared';
import { buildSummaries, categorize, findRegressions, renderComparison, renderMarkdown, summarize } from './report';

const base: EvalResultRecord = {
  fixtureId: 'a',
  framework: 'react',
  repeat: 1,
  status: 'passed',
  stopReason: 'passed',
  passed: true,
  similarity: 0.95,
  a11yBlocking: 0,
  compiled: true,
  consoleErrors: 0,
  typeErrors: 0,
  iterations: 2,
  cost: 0.1,
  durationMs: 10000,
  category: null
};

const results: EvalResultRecord[] = [
  base,
  { ...base, fixtureId: 'b', iterations: 4, cost: 0.3, durationMs: 30000, similarity: 0.92 },
  { ...base, fixtureId: 'c', passed: false, status: 'failed', stopReason: 'no_progress', similarity: 0.6, iterations: 3, cost: 0.2, durationMs: 20000, category: 'visual_mismatch' },
  { ...base, fixtureId: 'd', framework: 'angular', passed: false, status: 'failed', compiled: false, similarity: 0, iterations: 5, cost: 0.4, durationMs: 40000, category: 'compile_error' }
];

test('summarize computes rates and costs per framework', () => {
  const summary = summarize(results, 'react');
  if (!summary) throw new Error('Expected a react summary');
  assert.equal(summary.designs, 3);
  assert.equal(summary.runs, 3);
  assert.ok(Math.abs(summary.passRate - 2 / 3) < 1e-9);
  assert.ok(Math.abs(summary.meanIterations - 3) < 1e-9);
  assert.equal(summary.meanIterationsToPass, 3);
  assert.ok(Math.abs((summary.costPerPass ?? 0) - 0.3) < 1e-9);
  assert.equal(summary.p50DurationMs, 20000);
  assert.equal(summary.p95DurationMs, 30000);
  assert.deepEqual(summary.failures, { visual_mismatch: 1 });
});

test('summarize returns null without rows and buildSummaries skips empty frameworks', () => {
  assert.equal(summarize([base], 'angular'), null);
  assert.equal(buildSummaries([base]).length, 1);
  assert.equal(buildSummaries(results).length, 2);
});

test('categorize assigns a failure category', () => {
  const { category: _category, ...rest } = base;
  assert.equal(categorize(rest, 0.9), null);
  assert.equal(categorize({ ...rest, passed: false, status: 'error' }, 0.9), 'agent_error');
  assert.equal(categorize({ ...rest, passed: false, compiled: false }, 0.9), 'compile_error');
  assert.equal(categorize({ ...rest, passed: false, consoleErrors: 1 }, 0.9), 'runtime_error');
  assert.equal(categorize({ ...rest, passed: false, typeErrors: 2 }, 0.9), 'type_error');
  assert.equal(categorize({ ...rest, passed: false, stopReason: 'budget_cost' }, 0.9), 'budget');
  assert.equal(categorize({ ...rest, passed: false, stopReason: 'budget_tokens' }, 0.9), 'budget');
  assert.equal(categorize({ ...rest, passed: false, a11yBlocking: 3 }, 0.9), 'accessibility');
  assert.equal(categorize({ ...rest, passed: false, similarity: 0.5 }, 0.9), 'visual_mismatch');
});

test('renderMarkdown includes the summary, failures and every design', () => {
  const meta: EvalMeta = {
    date: '2026-10-24',
    model: 'test-model',
    promptVersion: 'v2',
    commit: 'abc1234',
    similarityThreshold: 0.9,
    a11yMaxBlocking: 0,
    maxIterations: 5,
    repeats: 1
  };
  const markdown = renderMarkdown(meta, results, buildSummaries(results));
  assert.match(markdown, /test-model/);
  assert.match(markdown, /\| react \| 3 \| 3 \| 66\.7% /);
  assert.match(markdown, /compile_error/);
  for (const id of ['a', 'b', 'c', 'd']) assert.ok(markdown.includes(`| ${id} |`));
});

test('renderComparison shows both models and the change per metric', () => {
  const meta = (model: string): EvalMeta => ({
    date: '2026-10-24',
    model,
    promptVersion: 'v2',
    commit: 'abc1234',
    similarityThreshold: 0.9,
    a11yMaxBlocking: 0,
    maxIterations: 5,
    repeats: 1
  });
  const worse = results.map((row) => ({ ...row, passed: false, category: 'visual_mismatch' as string | null }));
  const a: EvalReportFile = { meta: meta('model-a'), results, summaries: buildSummaries(results) };
  const b: EvalReportFile = { meta: meta('model-b'), results: worse, summaries: buildSummaries(worse) };
  const markdown = renderComparison(a, b);
  assert.match(markdown, /model-a/);
  assert.match(markdown, /model-b/);
  assert.match(markdown, /\| Pass rate \| 66\.7% \| 0\.0% \| -66\.7 pts \|/);
  assert.match(markdown, /## angular/);
});

test('findRegressions flags a drop larger than the allowed margin', () => {
  const baseline = buildSummaries(results);
  const worse = buildSummaries(results.map((row) => ({ ...row, passed: false, category: 'visual_mismatch' })));
  const problems = findRegressions(baseline, worse, 0.1);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /react pass rate fell from 66\.7% to 0\.0%/);
  assert.deepEqual(findRegressions(baseline, baseline, 0.1), []);
  assert.deepEqual(findRegressions(baseline, worse, 1), []);
});
