'use client';

import { useState } from 'react';
import type { Framework } from '@designloop/shared';

export function CodePanel({ tsx, css, framework }: { tsx: string; css: string; framework: Framework }) {
  const [tab, setTab] = useState<'main' | 'css'>('main');
  const [copied, setCopied] = useState(false);
  const active = tab === 'css' && css ? 'css' : 'main';
  const code = active === 'css' ? css : tsx;
  const mainName = framework === 'angular' ? 'app.component.ts' : 'Component.tsx';

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section aria-labelledby="code-heading">
      <h2 id="code-heading">Component code</h2>
      <div className="code-bar">
        <div role="group" aria-label="File">
          <button type="button" className="tab" aria-pressed={active === 'main'} onClick={() => setTab('main')}>
            {mainName}
          </button>
          {css ? (
            <button type="button" className="tab" aria-pressed={active === 'css'} onClick={() => setTab('css')}>
              styles.css
            </button>
          ) : null}
        </div>
        <button type="button" className="button ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre className="code">
        <code>{code}</code>
      </pre>
    </section>
  );
}
