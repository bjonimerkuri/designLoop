'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { frameworkLabel, pct } from '@/lib/format';

interface DemoEntry {
  slug: string;
  title: string;
  framework: string;
  similarity: number | null;
  status: string;
}

export default function DemoIndex() {
  const [demos, setDemos] = useState<DemoEntry[] | null>(null);

  useEffect(() => {
    fetch('/demo/index.json')
      .then((res) => (res.ok ? res.json() : []))
      .then(setDemos)
      .catch(() => setDemos([]));
  }, []);

  return (
    <div className="panel">
      <h1>Saved runs</h1>
      <p className="muted">Replays of real runs. They cost nothing to open and show every step the agent took.</p>
      {demos && demos.length === 0 ? (
        <p className="muted">No saved runs yet. Export one with the demo:export script.</p>
      ) : null}
      <ul className="demo-list">
        {demos?.map((demo) => (
          <li key={demo.slug}>
            <Link href={`/demo/view?slug=${demo.slug}`}>{demo.title}</Link>
            <span className="muted small">
              {frameworkLabel(demo.framework)}, {pct(demo.similarity)} similar
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
