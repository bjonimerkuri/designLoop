import type { EvalReportFile, EvalSummary, Framework } from '@designloop/shared';

export interface ComparisonRow {
  metric: string;
  a: string;
  b: string;
  change: string;
}

export interface ComparisonTable {
  framework: Framework;
  rows: ComparisonRow[];
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const usd = (value: number | null) => (value === null ? '–' : `$${value.toFixed(3)}`);
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const signed = (value: number, digits: number, unit: string) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}${unit}`;

function rowsFor(a: EvalSummary, b: EvalSummary): ComparisonRow[] {
  return [
    {
      metric: 'Pass rate',
      a: pct(a.passRate),
      b: pct(b.passRate),
      change: signed((b.passRate - a.passRate) * 100, 1, ' pts')
    },
    {
      metric: 'Mean similarity',
      a: pct(a.meanSimilarity),
      b: pct(b.meanSimilarity),
      change: signed((b.meanSimilarity - a.meanSimilarity) * 100, 1, ' pts')
    },
    {
      metric: 'Mean passes',
      a: a.meanIterations.toFixed(1),
      b: b.meanIterations.toFixed(1),
      change: signed(b.meanIterations - a.meanIterations, 1, '')
    },
    {
      metric: 'Cost per run',
      a: usd(a.meanCost),
      b: usd(b.meanCost),
      change: signed(b.meanCost - a.meanCost, 3, ' USD')
    },
    {
      metric: 'Cost per success',
      a: usd(a.costPerPass),
      b: usd(b.costPerPass),
      change: a.costPerPass !== null && b.costPerPass !== null ? signed(b.costPerPass - a.costPerPass, 3, ' USD') : '–'
    },
    {
      metric: 'Median time',
      a: sec(a.p50DurationMs),
      b: sec(b.p50DurationMs),
      change: signed((b.p50DurationMs - a.p50DurationMs) / 1000, 1, 's')
    }
  ];
}

export function compareReports(a: EvalReportFile, b: EvalReportFile): ComparisonTable[] {
  const tables: ComparisonTable[] = [];
  for (const framework of ['react', 'react-tailwind', 'angular'] as Framework[]) {
    const left = a.summaries.find((summary) => summary.framework === framework);
    const right = b.summaries.find((summary) => summary.framework === framework);
    if (left && right) tables.push({ framework, rows: rowsFor(left, right) });
  }
  return tables;
}
