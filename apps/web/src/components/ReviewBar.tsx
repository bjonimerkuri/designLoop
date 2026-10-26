'use client';

import { useState } from 'react';
import type { ReviewDecision, RunView } from '@designloop/shared';
import { reviewRun } from '@/lib/api';

export function ReviewBar({ run, onChange }: { run: RunView; onChange: (run: RunView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: ReviewDecision) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await reviewRun(run.id, decision));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The review could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="review" aria-labelledby="review-heading">
      <h2 id="review-heading">Your verdict</h2>
      <div className="review-actions">
        <button
          type="button"
          className="button"
          aria-pressed={run.review === 'accepted'}
          disabled={busy}
          onClick={() => decide(run.review === 'accepted' ? 'none' : 'accepted')}
        >
          {run.review === 'accepted' ? 'Accepted' : 'Accept'}
        </button>
        <button
          type="button"
          className="button ghost"
          aria-pressed={run.review === 'rejected'}
          disabled={busy}
          onClick={() => decide(run.review === 'rejected' ? 'none' : 'rejected')}
        >
          {run.review === 'rejected' ? 'Rejected' : 'Reject'}
        </button>
      </div>
      <p className="error" role="alert" aria-live="polite">
        {error}
      </p>
    </section>
  );
}
