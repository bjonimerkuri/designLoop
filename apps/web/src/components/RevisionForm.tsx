'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { reviseRun } from '@/lib/api';

export function RevisionForm({ runId }: { runId: string }) {
  const router = useRouter();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!instruction.trim()) {
      setError('Describe what should change.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const run = await reviseRun(runId, instruction.trim());
      router.push(`/run?id=${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request failed.');
      setBusy(false);
    }
  };

  return (
    <form className="panel revision" onSubmit={submit}>
      <h2>Ask for a change</h2>
      <p className="muted">The agent starts from this code, applies your note and checks the result again.</p>
      <label className="field">
        <span>What should change?</span>
        <textarea
          rows={3}
          maxLength={500}
          value={instruction}
          placeholder="For example: make the primary button taller and use a darker blue"
          onChange={(event) => setInstruction(event.target.value)}
        />
      </label>
      <p className="error" role="alert" aria-live="polite">
        {error}
      </p>
      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Starting' : 'Revise component'}
      </button>
    </form>
  );
}
