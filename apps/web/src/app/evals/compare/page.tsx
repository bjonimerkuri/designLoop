'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { EvalReportFile } from '@designloop/shared';
import { getEval, listEvals } from '@/lib/api';
import { compareReports } from '@/lib/compare';
import { frameworkLabel } from '@/lib/format';

type Listing = { name?: string; meta: EvalReportFile['meta'] };

export default function ComparePage() {
  const [reports, setReports] = useState<Listing[] | null>(null);
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  const [a, setA] = useState<EvalReportFile | null>(null);
  const [b, setB] = useState<EvalReportFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvals()
      .then((list) => {
        setReports(list);
        if (list[1]?.name) setNameA(list[1].name);
        if (list[0]?.name) setNameB(list[0].name);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the reports.'));
  }, []);

  useEffect(() => {
    if (!nameA || !nameB) return;
    Promise.all([getEval(nameA), getEval(nameB)])
      .then(([left, right]) => {
        setA(left);
        setB(right);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the reports.'));
  }, [nameA, nameB]);

  if (error) return <p className="error">{error}</p>;
  if (!reports) return <p className="muted">Loading reports.</p>;
  if (reports.length < 2) {
    return (
      <div className="panel">
        <h1>Compare reports</h1>
        <p className="muted">
          Two eval reports are needed. Run the suite with two models, for example <code>npm run eval -- --model NAME</code>.
        </p>
        <Link href="/evals">Back to evals</Link>
      </div>
    );
  }

  const tables = a && b ? compareReports(a, b) : [];
  const option = (report: Listing) => (
    <option key={report.name} value={report.name}>
      {report.meta.date}, {report.meta.model}, prompt {report.meta.promptVersion}
    </option>
  );

  return (
    <div className="evals">
      <Link href="/evals" className="back">
        All reports
      </Link>
      <h1>Compare reports</h1>
      <div className="filters">
        <label>
          <span className="muted small">A, the baseline</span>
          <select value={nameA} onChange={(event) => setNameA(event.target.value)}>
            {reports.map(option)}
          </select>
        </label>
        <label>
          <span className="muted small">B, the candidate</span>
          <select value={nameB} onChange={(event) => setNameB(event.target.value)}>
            {reports.map(option)}
          </select>
        </label>
      </div>
      {a && b && (a.meta.similarityThreshold !== b.meta.similarityThreshold || a.meta.maxIterations !== b.meta.maxIterations) ? (
        <p className="note">These reports used different thresholds or iteration limits, so compare them with care.</p>
      ) : null}
      {tables.length === 0 && a && b ? <p className="muted">The two reports have no output target in common.</p> : null}
      {tables.map((table) => (
        <section key={table.framework} className="panel" aria-label={`${frameworkLabel(table.framework)} comparison`}>
          <h2>{frameworkLabel(table.framework)}</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col" className="num">
                  A
                </th>
                <th scope="col" className="num">
                  B
                </th>
                <th scope="col" className="num">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  <td className="num">{row.a}</td>
                  <td className="num">{row.b}</td>
                  <td className="num">{row.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
