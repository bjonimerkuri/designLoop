'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { LLM_PROVIDERS } from '@designloop/shared';
import type { AppConfig, LlmProviderId } from '@designloop/shared';
import { getConfig, testKey } from '@/lib/api';
import { clearKey, loadKey, maskKey, saveKey, validateKeyForm } from '@/lib/keystore';
import type { StoredKey } from '@/lib/keystore';

export function KeySettings() {
  const [provider, setProvider] = useState<LlmProviderId>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(LLM_PROVIDERS[0].defaultModel);
  const [priceIn, setPriceIn] = useState('');
  const [priceOut, setPriceOut] = useState('');
  const [remember, setRemember] = useState(false);
  const [saved, setSaved] = useState<StoredKey | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = loadKey();
    setSaved(stored);
    if (stored) {
      setProvider(stored.provider);
      setModel(stored.model);
      setPriceIn(stored.priceIn);
      setPriceOut(stored.priceOut);
      setRemember(stored.remember);
    }
    getConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const info = LLM_PROVIDERS.find((item) => item.id === provider) ?? LLM_PROVIDERS[0];

  const current = (): StoredKey => ({
    provider,
    apiKey: apiKey || saved?.apiKey || '',
    model: model.trim(),
    priceIn: priceIn.trim(),
    priceOut: priceOut.trim(),
    remember
  });

  const choose = (next: LlmProviderId) => {
    setProvider(next);
    setModel(LLM_PROVIDERS.find((item) => item.id === next)?.defaultModel ?? '');
    setMessage(null);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const key = current();
    const problem = validateKeyForm(key);
    if (problem) {
      setMessage({ kind: 'error', text: problem });
      return;
    }
    saveKey(key);
    setSaved(key);
    setApiKey('');
    setMessage({
      kind: 'ok',
      text: key.remember
        ? 'Saved on this device. It stays until you remove it.'
        : 'Saved for this browser session. It is removed when you close the tab.'
    });
  };

  const check = async () => {
    const key = current();
    const problem = validateKeyForm(key);
    if (problem) {
      setMessage({ kind: 'error', text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await testKey(key);
      setMessage(
        result.ok
          ? { kind: 'ok', text: `The key works with ${result.model}.` }
          : { kind: 'error', text: result.message ?? 'The provider rejected the key.' }
      );
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'The check failed.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    clearKey();
    setSaved(null);
    setApiKey('');
    setMessage({ kind: 'ok', text: 'Your key was removed from this browser.' });
  };

  return (
    <div className="panel key-settings">
      <h1>Your API key</h1>
      <p className="muted">
        Runs use your own provider account, so nobody else pays for them.{' '}
        {config && !config.serverKeyAvailable ? 'This server has no key of its own, so you need to add one.' : null}
      </p>

      <form onSubmit={save}>
        <label className="field">
          <span>Provider</span>
          <select value={provider} onChange={(event) => choose(event.target.value as LlmProviderId)}>
            {LLM_PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            placeholder={saved ? `Saved key ${maskKey(saved.apiKey)}. Paste a new one to replace it.` : info.keyHint}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Model</span>
          <input list="models" value={model} onChange={(event) => setModel(event.target.value)} />
          <datalist id="models">
            {info.models.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>

        <div className="filters">
          <label className="field">
            <span>Input price per million tokens (optional)</span>
            <input inputMode="decimal" value={priceIn} onChange={(event) => setPriceIn(event.target.value)} />
          </label>
          <label className="field">
            <span>Output price per million tokens (optional)</span>
            <input inputMode="decimal" value={priceOut} onChange={(event) => setPriceOut(event.target.value)} />
          </label>
        </div>
        <p className="muted small">
          Without prices the cost shows as $0. Every run is still stopped by a token limit and a time limit.
        </p>

        <label className="remember">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          Remember on this device (leave off on a shared computer)
        </label>

        <p
          className={message?.kind === 'error' ? 'error' : 'success'}
          role={message?.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {message?.text}
        </p>

        <div className="review-actions">
          <button className="button" type="submit">
            Save key
          </button>
          <button className="button ghost" type="button" onClick={check} disabled={busy}>
            {busy ? 'Checking' : 'Check key'}
          </button>
          {saved ? (
            <button className="button ghost" type="button" onClick={remove}>
              Remove key
            </button>
          ) : null}
        </div>
      </form>

      <h2>How your key is handled</h2>
      <ul className="plain-list">
        <li>It is kept in this browser only: in the session by default, on this device if you choose to remember it.</li>
        <li>It is sent with each request over the connection you use to reach this app. Use https when the app is online.</li>
        <li>The server keeps it in memory while your run is processed, then discards it. It is never written to a database, a file or a log.</li>
        <li>Only the three providers listed above can receive it. The server does not accept custom addresses.</li>
        <li>Check key sends one tiny request to your provider, which can use a few tokens.</li>
      </ul>
    </div>
  );
}
