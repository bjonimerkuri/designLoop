import type { EvalMeta, EvalReportFile, EvalResultRecord, EvalSummary, Framework } from '@designloop/shared';

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function categorize(
  record: Omit<EvalResultRecord, 'category'>,
  similarityThreshold: number
): string | null {
  if (record.passed) return null;
  if (record.status === 'error') return 'agent_error';
  if (!record.compiled) return 'compile_error';
  if (record.consoleErrors > 0) return 'runtime_error';
  if (record.typeErrors > 0) return 'type_error';
  if (record.stopReason === 'budget_cost' || record.stopReason === 'budget_time') return 'budget';
  if (record.similarity >= similarityThreshold && record.a11yBlocking > 0) return 'accessibility';
  if (record.similarity < similarityThreshold) return 'visual_mismatch';
  return 'other';
}

export function summarize(results: EvalResultRecord[], framework: Framework): EvalSummary | null {
  const rows = results.filter((row) => row.framework === framework);
  if (!rows.length) return null;
  const passed = rows.filter((row) => row.passed);
  const failures: Record<string, number> = {};
  for (const row of rows) {
    if (row.category) failures[row.category] = (failures[row.category] ?? 0) + 1;
  }
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  return {
    framework,
    designs: new Set(rows.map((row) => row.fixtureId)).size,
    runs: rows.length,
    passRate: passed.length / rows.length,
    meanSimilarity: mean(rows.map((row) => row.similarity)),
    medianSimilarity: median(rows.map((row) => row.similarity)),
    meanIterations: mean(rows.map((row) => row.iterations)),
    meanIterationsToPass: passed.length ? mean(passed.map((row) => row.iterations)) : null,
    meanCost: totalCost / rows.length,
    costPerPass: passed.length ? totalCost / passed.length : null,
    p50DurationMs: percentile(rows.map((row) => row.durationMs), 50),
    p95DurationMs: percentile(rows.map((row) => row.durationMs), 95),
    failures
  };
}

export function buildSummaries(results: EvalResultRecord[]): EvalSummary[] {
  return (['react', 'react-tailwind', 'angular'] as Framework[])
    .map((framework) => summarize(results, framework))
    .filter((summary): summary is EvalSummary => summary !== null);
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const usd = (value: number | null) => (value === null ? '–' : `$${value.toFixed(3)}`);
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function renderMarkdown(meta: EvalMeta, results: EvalResultRecord[], summaries: EvalSummary[]): string {
  const lines: string[] = [];
  lines.push('# Eval report', '');
  lines.push(
    `Run on ${meta.date} with \`${meta.model}\`, prompt ${meta.promptVersion}, commit \`${meta.commit}\`.`,
    `Pass means: it builds, has no runtime errors, visual similarity is at least ${pct(meta.similarityThreshold)} and there are at most ${meta.a11yMaxBlocking} serious or critical accessibility issues. Up to ${meta.maxIterations} passes per design, ${meta.repeats} run(s) per design.`,
    ''
  );
  lines.push('## Summary', '');
  lines.push(
    '| Framework | Designs | Runs | Pass rate | Mean similarity | Mean passes | Passes to succeed | Cost per run | Cost per success | p50 time | p95 time |',
    '|---|---|---|---|---|---|---|---|---|---|---|'
  );
  for (const s of summaries) {
    lines.push(
      `| ${s.framework} | ${s.designs} | ${s.runs} | ${pct(s.passRate)} | ${pct(s.meanSimilarity)} | ${s.meanIterations.toFixed(1)} | ${s.meanIterationsToPass === null ? '–' : s.meanIterationsToPass.toFixed(1)} | ${usd(s.meanCost)} | ${usd(s.costPerPass)} | ${sec(s.p50DurationMs)} | ${sec(s.p95DurationMs)} |`
    );
  }
  lines.push('', '## Failures by category', '');
  const categories = new Set(summaries.flatMap((s) => Object.keys(s.failures)));
  if (categories.size === 0) {
    lines.push('No failures in this run.');
  } else {
    lines.push('| Category | ' + summaries.map((s) => s.framework).join(' | ') + ' |', '|---|' + summaries.map(() => '---|').join(''));
    for (const category of [...categories].sort()) {
      lines.push(`| ${category} | ` + summaries.map((s) => String(s.failures[category] ?? 0)).join(' | ') + ' |');
    }
  }
  lines.push('', '## Per design', '');
  lines.push('| Design | Framework | Passed | Mean similarity | Mean passes | Cost | Failure |', '|---|---|---|---|---|---|---|');
  const keys = [...new Set(results.map((r) => `${r.fixtureId}|${r.framework}`))].sort();
  for (const key of keys) {
    const [fixtureId, framework] = key.split('|');
    const rows = results.filter((r) => r.fixtureId === fixtureId && r.framework === framework);
    const passes = rows.filter((r) => r.passed).length;
    const failure = rows.find((r) => r.category)?.category ?? '';
    lines.push(
      `| ${fixtureId} | ${framework} | ${passes}/${rows.length} | ${pct(mean(rows.map((r) => r.similarity)))} | ${mean(rows.map((r) => r.iterations)).toFixed(1)} | ${usd(rows.reduce((sum, r) => sum + r.cost, 0))} | ${failure} |`
    );
  }
  lines.push('', 'Failures are kept in this report on purpose.', '');
  return lines.join('\n');
}

const signed = (value: number, digits: number, unit: string) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}${unit}`;

export function renderComparison(a: EvalReportFile, b: EvalReportFile): string {
  const lines: string[] = ['# Model comparison', ''];
  lines.push(
    `A: \`${a.meta.model}\` (${a.meta.date}, prompt ${a.meta.promptVersion}, commit \`${a.meta.commit}\`)`,
    '',
    `B: \`${b.meta.model}\` (${b.meta.date}, prompt ${b.meta.promptVersion}, commit \`${b.meta.commit}\`)`,
    ''
  );
  if (a.meta.similarityThreshold !== b.meta.similarityThreshold || a.meta.maxIterations !== b.meta.maxIterations) {
    lines.push('The two reports used different thresholds or iteration limits, so compare them with care.', '');
  }
  for (const framework of ['react', 'react-tailwind', 'angular'] as Framework[]) {
    const left = a.summaries.find((summary) => summary.framework === framework);
    const right = b.summaries.find((summary) => summary.framework === framework);
    if (!left || !right) continue;
    lines.push(`## ${framework}`, '', '| Metric | A | B | Change |', '|---|---|---|---|');
    lines.push(`| Pass rate | ${pct(left.passRate)} | ${pct(right.passRate)} | ${signed((right.passRate - left.passRate) * 100, 1, ' pts')} |`);
    lines.push(`| Mean similarity | ${pct(left.meanSimilarity)} | ${pct(right.meanSimilarity)} | ${signed((right.meanSimilarity - left.meanSimilarity) * 100, 1, ' pts')} |`);
    lines.push(`| Mean passes | ${left.meanIterations.toFixed(1)} | ${right.meanIterations.toFixed(1)} | ${signed(right.meanIterations - left.meanIterations, 1, '')} |`);
    lines.push(`| Cost per run | ${usd(left.meanCost)} | ${usd(right.meanCost)} | ${signed(right.meanCost - left.meanCost, 3, ' USD')} |`);
    lines.push(`| Cost per success | ${usd(left.costPerPass)} | ${usd(right.costPerPass)} | ${left.costPerPass !== null && right.costPerPass !== null ? signed(right.costPerPass - left.costPerPass, 3, ' USD') : '–'} |`);
    lines.push(`| p50 time | ${sec(left.p50DurationMs)} | ${sec(right.p50DurationMs)} | ${signed((right.p50DurationMs - left.p50DurationMs) / 1000, 1, 's')} |`, '');
  }
  if (lines.length <= 7) lines.push('The reports have no framework in common.', '');
  return lines.join('\n');
}

export function findRegressions(baseline: EvalSummary[], current: EvalSummary[], maxDrop: number): string[] {
  const problems: string[] = [];
  for (const now of current) {
    const before = baseline.find((summary) => summary.framework === now.framework);
    if (!before) continue;
    if (before.passRate - now.passRate > maxDrop) {
      problems.push(`${now.framework} pass rate fell from ${pct(before.passRate)} to ${pct(now.passRate)}`);
    }
  }
  return problems;
}
