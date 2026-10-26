'use client';

import { useState } from 'react';
import type { VerifyData } from '@designloop/shared';
import { pct } from '@/lib/format';

export interface IterationInfo {
  iteration: number;
  data: VerifyData;
}

function ProofImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="muted small">Nothing to show for this iteration.</p>;
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

export function CompareView({
  imageUrl,
  iterations,
  selected,
  onSelect
}: {
  imageUrl: (name: string) => string;
  iterations: IterationInfo[];
  selected: number | null;
  onSelect: (iteration: number) => void;
}) {
  return (
    <section className="compare" aria-labelledby="compare-heading">
      <h2 id="compare-heading">Design against render</h2>
      {iterations.length > 0 ? (
        <div className="passes" role="group" aria-label="Choose a pass">
          {iterations.map(({ iteration, data }) => (
            <button
              key={iteration}
              type="button"
              className="pass"
              aria-pressed={selected === iteration}
              data-passed={data.passed}
              onClick={() => onSelect(iteration)}
            >
              <span className="bar" aria-hidden="true">
                <span style={{ height: `${Math.round((data.similarity ?? 0) * 100)}%` }} />
              </span>
              <span className="pass-label">Pass {iteration}</span>
              <span className="pass-value">{data.compiled ? pct(data.similarity) : 'Build failed'}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">The first render appears once the agent has written a component.</p>
      )}
      {selected !== null ? (
        <div className="frames">
          <figure className="frame" key={`design-${selected}`}>
            <ProofImage src={imageUrl('design.png')} alt="Original design" />
            <figcaption>Design</figcaption>
          </figure>
          <figure className="frame" key={`render-${selected}`}>
            <ProofImage src={imageUrl(`render-${selected}.png`)} alt={`Render from pass ${selected}`} />
            <figcaption>Render, pass {selected}</figcaption>
          </figure>
          <figure className="frame" key={`diff-${selected}`}>
            <ProofImage src={imageUrl(`diff-${selected}.png`)} alt={`Differences in pass ${selected}`} />
            <figcaption>Differences, shown in red</figcaption>
          </figure>
        </div>
      ) : null}
    </section>
  );
}
