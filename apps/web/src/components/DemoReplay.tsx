'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { RunView } from '@designloop/shared';
import { RunDetail } from '@/components/RunDetail';

export function DemoReplay() {
  const slug = useSearchParams().get('slug');
  const [data, setData] = useState<RunView | null>(null);
  const [shown, setShown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      setError('This link does not point to a saved run.');
      return;
    }
    fetch(`/demo/${slug}/run.json`)
      .then((res) => {
        if (!res.ok) throw new Error('This saved run is not available.');
        return res.json() as Promise<RunView>;
      })
      .then((run) => {
        setData(run);
        setShown(0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the saved run.'));
  }, [slug]);

  const total = data?.steps?.length ?? 0;

  useEffect(() => {
    if (!data || shown >= total) return;
    const timer = setTimeout(() => setShown((count) => count + 1), 900);
    return () => clearTimeout(timer);
  }, [data, shown, total]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading saved run.</p>;

  const finished = shown >= total;
  const run: RunView = finished
    ? data
    : {
        ...data,
        status: 'running',
        similarity: null,
        iterations: null,
        a11yBlocking: null,
        totalCost: null,
        totalDurationMs: null,
        bestIteration: null,
        stopReason: null,
        tsx: null,
        css: null
      };

  return (
    <RunDetail
      run={run}
      steps={(data.steps ?? []).slice(0, shown)}
      imageUrl={(name) => `/demo/${slug}/${name}`}
      backHref="/demo"
      backLabel="All saved runs"
    >
      {finished ? (
        <button type="button" className="button ghost replay" onClick={() => setShown(0)}>
          Replay this run
        </button>
      ) : null}
    </RunDetail>
  );
}
