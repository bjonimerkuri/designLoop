import type { EvalReportFile, EvalSummary } from '@designloop/shared';
import { compareReports } from '@/lib/compare';

const summary = (framework: EvalSummary['framework'], passRate: number, meanCost: number): EvalSummary => ({
  framework,
  designs: 10,
  runs: 10,
  passRate,
  meanSimilarity: 0.9,
  medianSimilarity: 0.92,
  meanIterations: 2,
  meanIterationsToPass: 2,
  meanCost,
  costPerPass: passRate ? meanCost / passRate : null,
  p50DurationMs: 20000,
  p95DurationMs: 40000,
  failures: {}
});

const report = (summaries: EvalSummary[]): EvalReportFile => ({
  meta: {
    date: '2026-10-24',
    model: 'm',
    promptVersion: 'v3',
    commit: 'abc',
    similarityThreshold: 0.9,
    a11yMaxBlocking: 0,
    maxIterations: 5,
    repeats: 1
  },
  results: [],
  summaries
});

describe('compareReports', () => {
  it('shows both values and the change for each output they share', () => {
    const tables = compareReports(
      report([summary('react', 0.5, 0.1), summary('angular', 0.4, 0.2)]),
      report([summary('react', 0.7, 0.15)])
    );
    expect(tables).toHaveLength(1);
    expect(tables[0].framework).toBe('react');
    const passRate = tables[0].rows.find((row) => row.metric === 'Pass rate');
    expect(passRate).toEqual({ metric: 'Pass rate', a: '50.0%', b: '70.0%', change: '+20.0 pts' });
    expect(tables[0].rows.find((row) => row.metric === 'Cost per run')?.change).toBe('+0.050 USD');
  });

  it('returns nothing when no output is shared', () => {
    expect(compareReports(report([summary('react', 0.5, 0.1)]), report([summary('angular', 0.5, 0.1)]))).toEqual([]);
  });

  it('handles a missing cost per success', () => {
    const [table] = compareReports(report([summary('react', 0, 0.1)]), report([summary('react', 0.5, 0.1)]));
    expect(table.rows.find((row) => row.metric === 'Cost per success')?.change).toBe('–');
  });
});
