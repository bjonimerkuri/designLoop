'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { RunView, StepView, VerifyData } from '@designloop/shared';
import { TERMINAL_STATUSES } from '@designloop/shared';
import { frameworkLabel, pct, seconds, usd } from '@/lib/format';
import { CodePanel } from './CodePanel';
import { DesignReading } from './DesignReading';
import { CompareView } from './CompareView';
import type { IterationInfo } from './CompareView';
import { StatusPill } from './StatusPill';
import { Trace } from './Trace';

export function RunDetail({
  run,
  steps,
  imageUrl,
  backHref,
  backLabel,
  children
}: {
  run: RunView;
  steps: StepView[];
  imageUrl: (name: string) => string;
  backHref: string;
  backLabel: string;
  children?: ReactNode;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const iterations = useMemo<IterationInfo[]>(
    () =>
      steps
        .filter((step) => step.type === 'verify' && step.iteration !== null)
        .map((step) => ({ iteration: step.iteration as number, data: step.data as VerifyData })),
    [steps]
  );

  const active = selected ?? run.bestIteration ?? iterations[iterations.length - 1]?.iteration ?? null;
  const running = !TERMINAL_STATUSES.includes(run.status);

  return (
    <div className="run">
      <div className="run-head">
        <div>
          <Link href={backHref} className="back">
            {backLabel}
          </Link>
          <h1>{new Date(run.createdAt).toLocaleString()}</h1>
          <p className="muted">
            {run.width}×{run.height} px, {frameworkLabel(run.framework)}, {run.model}, prompt {run.promptVersion}
            {run.hint ? `, “${run.hint}”` : ''}
          </p>
          {run.instruction ? <p className="muted">Requested change: “{run.instruction}”</p> : null}
          {run.parentId ? (
            <p className="small">
              <Link href={`/runs/${run.parentId}`}>See the run this one revises</Link>
            </p>
          ) : null}
        </div>
        <StatusPill status={run.status} />
      </div>

      {run.status === 'error' ? (
        <p className="error">{run.error} Check the API logs and your .env file, then start a new run.</p>
      ) : null}

      <dl className="metrics">
        <div>
          <dt>Similarity</dt>
          <dd>{pct(run.similarity ?? iterations[iterations.length - 1]?.data.similarity)}</dd>
        </div>
        <div>
          <dt>Passes</dt>
          <dd>{run.iterations ?? iterations.length}</dd>
        </div>
        <div>
          <dt>Blocking accessibility issues</dt>
          <dd>{run.a11yBlocking ?? '–'}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>{usd(run.totalCost ?? steps.reduce((sum, step) => sum + step.cost, 0))}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{seconds(run.totalDurationMs)}</dd>
        </div>
      </dl>

      {run.stopReason && run.status !== 'passed' ? (
        <p className="note">
          Stopped because {run.stopReason.replace(/_/g, ' ')}. The best pass is shown. Raise the limits in .env or add
          context to the next run.
        </p>
      ) : null}

      <DesignReading steps={steps} />
      <CompareView imageUrl={imageUrl} iterations={iterations} selected={active} onSelect={setSelected} />
      <Trace steps={steps} running={running} />
      {run.tsx ? <CodePanel tsx={run.tsx} css={run.css ?? ''} framework={run.framework} /> : null}
      {children}
    </div>
  );
}
