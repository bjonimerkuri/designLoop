'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FRAMEWORKS } from '@designloop/shared';
import type { Framework } from '@designloop/shared';
import { frameworkLabel } from '@/lib/format';
import Link from 'next/link';
import type { AppConfig } from '@designloop/shared';
import { createRun, getConfig } from '@/lib/api';
import { loadKey, maskKey } from '@/lib/keystore';
import type { StoredKey } from '@/lib/keystore';

export function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [framework, setFramework] = useState<Framework>('react');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [key, setKey] = useState<StoredKey | null>(null);

  useEffect(() => {
    setKey(loadKey());
    getConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const needsKey = config !== null && !config.serverKeyAvailable && key === null;

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (picked: File | undefined) => {
    setError(null);
    if (!picked) return;
    if (picked.type !== 'image/png' && picked.type !== 'image/jpeg') {
      setError('Export the design as a PNG or JPEG and try again.');
      return;
    }
    setFile(picked);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Choose a design to start.');
      return;
    }
    if (needsKey) {
      setError('Add your API key in Settings first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const run = await createRun(file, hint.trim(), framework);
      router.push(`/run?id=${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The upload failed.');
      setBusy(false);
    }
  };

  return (
    <form className="panel upload" onSubmit={submit}>
      <h2>New run</h2>
      <div
        className="drop"
        data-dragging={dragging}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files[0]);
        }}
      >
        {preview ? (
          <div className="frame">
            <img src={preview} alt="Selected design" />
          </div>
        ) : (
          <p>Drop a PNG or JPEG of your design here, 200 to 1600 px wide.</p>
        )}
        <button type="button" className="button ghost" onClick={() => input.current?.click()}>
          {file ? 'Choose another file' : 'Choose a file'}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          className="visually-hidden"
          aria-label="Design image"
          onChange={(event) => pick(event.target.files?.[0])}
        />
      </div>
      <fieldset className="choice">
        <legend>Output</legend>
        {FRAMEWORKS.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="framework"
              value={option}
              checked={framework === option}
              onChange={() => setFramework(option)}
            />
            {frameworkLabel(option)}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Context for the agent (optional)</span>
        <textarea
          value={hint}
          maxLength={500}
          rows={3}
          placeholder="For example: pricing card, the button should look pressed on hover"
          onChange={(event) => setHint(event.target.value)}
        />
      </label>
      <p className="muted small" aria-live="polite">
        {key ? (
          <>
            Using your {key.provider} key ({maskKey(key.apiKey)}) with {key.model}. <Link href="/settings">Change</Link>
          </>
        ) : needsKey ? (
          <>
            This server has no API key. <Link href="/settings">Add your own key</Link> to run the agent.
          </>
        ) : (
          <>
            Using the server's key. <Link href="/settings">Use your own key instead</Link>
          </>
        )}
      </p>
      <p className="error" role="alert" aria-live="polite">
        {error}
      </p>
      <button className="button" type="submit" disabled={busy || needsKey}>
        {busy ? 'Starting run' : 'Build component'}
      </button>
    </form>
  );
}
