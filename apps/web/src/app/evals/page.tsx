'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { EvalHistoryPoint, EvalReportFile } from '@designloop/shared';
import { getEval, getEvalHistory, listEvals } from '@/lib/api';
import { frameworkLabel, pct, seconds, usd } from '@/lib/format';

type Listing = Pick<EvalReportFile, 'name' | 'meta' | 'summaries'>;

export default function EvalsPage() {
  const [reports, setReports] = useState<Listing[] | null>(null);
  const [active, setActive] = useState<EvalReportFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<EvalHistoryPoint[]>([]);

  useEffect(() => {
    getEvalHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
    listEvals()
      .then(async (list) => {
        setReports(list);
        if (list[0]?.name) setActive(await getEval(list[0].name));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the eval reports.'));
  }, []);

  const open = async (name: string) => {
    try {
      setActive(await getEval(name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the report.');
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!reports) return <p className="muted">Loading reports.</p>;
  if (reports.length === 0) {
    return (
      <div className="panel">
        <h1>Evals</h1>
        <p className="muted">
          No eval has been run yet. Run <code>npm run eval:fixtures</code>, then <code>npm run eval -- --framework both</code>.
        </p>
      </div>
    );
  }

  const keys: string[] = active
    ? [...new Set<string>(active.results.map((r) => `${r.fixtureId}|${r.framework}`))].sort()
    : [];

  return (
    <div className="evals">
      <h1>Evals</h1>
      {reports.length > 1 ? <Link href="/evals/compare">Compare two reports</Link> : null}
      <div className="passes" role="group" aria-label="Choose a report">
        {reports.map((report) => (
          <button
            key={report.name}
            type="button"
            className="pass report-button"
            aria-pressed={active?.name === report.name}
            onClick={() => report.name && open(report.name)}
          >
            <span className="pass-label">{report.meta.date}</span>
            <span className="pass-value">{report.meta.model}</span>
          </button>
        ))}
      </div>

      {active ? (
        <>
          <p className="muted">
            Prompt {active.meta.promptVersion}, commit {active.meta.commit}, similarity target{' '}
            {pct(active.meta.similarityThreshold)}, up to {active.meta.maxIterations} passes, {active.meta.repeats} run(s) per
            design.
          </p>
          <div className="summary-grid">
            {active.summaries.map((s) => (
              <section key={s.framework} className="panel" aria-label={`${frameworkLabel(s.framework)} summary`}>
                <h2>{frameworkLabel(s.framework)}</h2>
                <dl className="stat-list">
                  <div><dt>Pass rate</dt><dd>{pct(s.passRate)}</dd></div>
                  <div><dt>Mean similarity</dt><dd>{pct(s.meanSimilarity)}</dd></div>
                  <div><dt>Mean passes</dt><dd>{s.meanIterations.toFixed(1)}</dd></div>
                  <div><dt>Cost per run</dt><dd>{usd(s.meanCost)}</dd></div>
                  <div><dt>Cost per success</dt><dd>{usd(s.costPerPass)}</dd></div>
                  <div><dt>Time p50 / p95</dt><dd>{seconds(s.p50DurationMs)} / {seconds(s.p95DurationMs)}</dd></div>
                </dl>
                <p className="small muted">
                  {Object.keys(s.failures).length
                    ? `Failures: ${Object.entries(s.failures).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')}`
                    : 'No failures.'}
                </p>
              </section>
            ))}
          </div>

          <section className="panel" aria-labelledby="per-design">
            <h2 id="per-design">Per design</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Design</th>
                  <th scope="col">Framework</th>
                  <th scope="col" className="num">Passed</th>
                  <th scope="col" className="num">Similarity</th>
                  <th scope="col" className="num">Passes</th>
                  <th scope="col">Failure</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const [fixtureId, framework] = key.split('|');
                  const rows = active.results.filter((r) => r.fixtureId === fixtureId && r.framework === framework);
                  const passed = rows.filter((r) => r.passed).length;
                  const mean = (pick: (r: (typeof rows)[number]) => number) =>
                    rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;
                  return (
                    <tr key={key}>
                      <td>{fixtureId}</td>
                      <td>{frameworkLabel(framework)}</td>
                      <td className="num">{passed}/{rows.length}</td>
                      <td className="num">{pct(mean((r) => r.similarity))}</td>
                      <td className="num">{mean((r) => r.iterations).toFixed(1)}</td>
                      <td>{rows.find((r) => r.category)?.category?.replace(/_/g, ' ') ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {history.length > 0 ? (
        <section className="panel" aria-labelledby="history-heading">
          <h2 id="history-heading">History</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Model</th>
                <th scope="col">Prompt</th>
                <th scope="col">Pass rate</th>
              </tr>
            </thead>
            <tbody>
              {history.map((point) => (
                <tr key={point.id}>
                  <td>{point.meta.date}</td>
                  <td>{point.meta.model}</td>
                  <td>{point.meta.promptVersion}</td>
                  <td>
                    {point.summaries.map((s) => (
                      <div key={s.framework}>
                        <span className="meter" aria-hidden="true">
                          <span style={{ width: `${Math.round(s.passRate * 100)}%` }} />
                        </span>
                        {frameworkLabel(s.framework)} {pct(s.passRate)}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
