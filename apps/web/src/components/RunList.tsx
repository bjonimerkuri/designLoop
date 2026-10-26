'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunView } from '@designloop/shared';
import { FRAMEWORKS, TERMINAL_STATUSES } from '@designloop/shared';
import { listRuns } from '@/lib/api';
import { frameworkLabel, pct, usd } from '@/lib/format';
import { StatusPill } from './StatusPill';

const STATUS_OPTIONS = ['passed', 'failed', 'budget_exceeded', 'error', 'running', 'queued'];

export function RunList() {
  const [first, setFirst] = useState<RunView[] | null>(null);
  const [older, setOlder] = useState<RunView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [framework, setFramework] = useState('');
  const [status, setStatus] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const olderCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setFirst(null);
    setOlder([]);
    olderCount.current = 0;

    const load = async () => {
      try {
        const page = await listRuns({ framework, status });
        if (cancelled) return;
        setFirst(page.items);
        if (olderCount.current === 0) setCursor(page.nextCursor);
        setError(null);
        const active = page.items.some((run) => !TERMINAL_STATUSES.includes(run.status));
        timer = setTimeout(load, active ? 2000 : 8000);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not reach the API.');
        timer = setTimeout(load, 8000);
      }
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [framework, status]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await listRuns({ cursor, framework, status });
      olderCount.current += page.items.length;
      setOlder((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more runs.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, framework, status]);

  const firstIds = new Set((first ?? []).map((run) => run.id));
  const runs = first ? [...first, ...older.filter((run) => !firstIds.has(run.id))] : null;

  return (
    <section className="panel runs" aria-labelledby="runs-heading">
      <h2 id="runs-heading">Runs</h2>
      <div className="filters">
        <label>
          <span className="muted small">Output</span>
          <select value={framework} onChange={(event) => setFramework(event.target.value)}>
            <option value="">All</option>
            {FRAMEWORKS.map((option) => (
              <option key={option} value={option}>
                {frameworkLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p className="error">
          {error} Check that the API is running on port 4000.
        </p>
      ) : null}
      {runs && runs.length === 0 ? <p className="muted">No runs match. Upload a design to start one.</p> : null}
      {runs && runs.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Similarity
              </th>
              <th scope="col" className="num">
                Passes
              </th>
              <th scope="col" className="num">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>
                  <Link href={`/runs/${run.id}`}>{new Date(run.createdAt).toLocaleString()}</Link>
                  <span className="muted small">
                    {run.width}×{run.height}, {frameworkLabel(run.framework)}, {run.model}
                  </span>
                </td>
                <td>
                  <StatusPill status={run.status} />
                  {run.review ? <span className="muted small">{run.review === 'accepted' ? 'Accepted' : 'Rejected'}</span> : null}
                </td>
                <td className="num">{pct(run.similarity)}</td>
                <td className="num">{run.iterations ?? '–'}</td>
                <td className="num">{usd(run.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {cursor ? (
        <button type="button" className="button ghost more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
