'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { RunView, StepView, StreamEvent } from '@designloop/shared';
import { TERMINAL_STATUSES } from '@designloop/shared';
import { ReviewBar } from '@/components/ReviewBar';
import { RevisionForm } from '@/components/RevisionForm';
import { RunDetail } from '@/components/RunDetail';
import { API_URL, fileUrl, getRun } from '@/lib/api';

const mergeStep = (steps: StepView[], step: StepView) =>
  [...steps.filter((existing) => existing.index !== step.index), step].sort((a, b) => a.index - b.index);

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunView | null>(null);
  const [steps, setSteps] = useState<StepView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;

    const load = async () => {
      const data = await getRun(id);
      if (cancelled) return null;
      setRun(data);
      setSteps(data.steps ?? []);
      return data;
    };

    load()
      .then((data) => {
        if (!data || TERMINAL_STATUSES.includes(data.status)) return;
        source = new EventSource(`${API_URL}/runs/${id}/events`);
        source.onmessage = (message) => {
          const event = JSON.parse(message.data) as StreamEvent;
          if (event.type === 'step') {
            setSteps((current) => mergeStep(current, event.step));
          } else {
            source?.close();
            load().catch(() => undefined);
          }
        };
        source.onerror = () => {
          source?.close();
          poll = setInterval(async () => {
            const latest = await load().catch(() => null);
            if (latest && TERMINAL_STATUSES.includes(latest.status)) clearInterval(poll);
          }, 2000);
        };
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this run.'));

    return () => {
      cancelled = true;
      source?.close();
      if (poll) clearInterval(poll);
    };
  }, [id]);

  if (error) {
    return (
      <div className="panel">
        <p className="error">{error}</p>
        <Link href="/">Back to runs</Link>
      </div>
    );
  }

  if (!run) return <p className="muted">Loading run.</p>;

  const finished = TERMINAL_STATUSES.includes(run.status) && run.tsx !== null;

  return (
    <RunDetail
      run={run}
      steps={steps}
      imageUrl={(name) => fileUrl(run.id, name)}
      backHref="/"
      backLabel="All runs"
    >
      {finished ? (
        <>
          <ReviewBar run={run} onChange={setRun} />
          <RevisionForm runId={run.id} />
        </>
      ) : null}
    </RunDetail>
  );
}
