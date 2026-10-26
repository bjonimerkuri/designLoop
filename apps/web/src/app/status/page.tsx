'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { MetricsView } from '@designloop/shared';
import { getMetrics } from '@/lib/api';
import { pct, seconds, usd } from '@/lib/format';

export default function StatusPage() {
  const [token, setToken] = useState('');
  const [metrics, setMetrics] = useState<MetricsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (value: string) => {
    try {
      setMetrics(await getMetrics(value));
      setError(null);
    } catch (err) {
      setMetrics(null);
      setError(err instanceof Error ? err.message : 'Could not load the metrics.');
    }
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('adminToken') ?? '';
    setToken(saved);
    load(saved);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sessionStorage.setItem('adminToken', token);
    load(token);
  };

  return (
    <div className="panel">
      <h1>Status</h1>
      <p className="muted">Runs in the last 24 hours.</p>
      <form onSubmit={submit} className="field">
        <label htmlFor="token">
          <span>Admin token (only needed if the API sets one)</span>
        </label>
        <input id="token" type="password" value={token} onChange={(event) => setToken(event.target.value)} />
        <button className="button ghost" type="submit">
          Load
        </button>
      </form>
      <p className="error" role="alert" aria-live="polite">
        {error}
      </p>
      {metrics ? (
        <>
          <div className="status-grid">
            <div className="panel">
              <span className="muted small">Pass rate</span>
              <strong>{pct(metrics.passRate)}</strong>
            </div>
            <div className="panel">
              <span className="muted small">Mean similarity</span>
              <strong>{pct(metrics.meanSimilarity)}</strong>
            </div>
            <div className="panel">
              <span className="muted small">Mean cost per run</span>
              <strong>{usd(metrics.meanCostUsd)}</strong>
            </div>
            <div className="panel">
              <span className="muted small">Mean time</span>
              <strong>{seconds(metrics.meanDurationMs)}</strong>
            </div>
            <div className="panel">
              <span className="muted small">Spend</span>
              <strong>{usd(metrics.totalCostUsd)}</strong>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Runs
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics.byStatus).map(([status, count]) => (
                <tr key={status}>
                  <td>{status.replace(/_/g, ' ')}</td>
                  <td className="num">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
