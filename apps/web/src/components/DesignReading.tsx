import type { StepView } from '@designloop/shared';

interface Reading {
  summary?: string;
  palette?: string[];
  fonts?: string;
  texts?: string[];
  layout?: string;
}

export function DesignReading({ steps }: { steps: StepView[] }) {
  const analysis = steps.find((step) => step.name === 'analyze_design')?.data as Reading | null | undefined;
  const tokens = steps.find((step) => step.name === 'extract_tokens')?.data as
    | { palette: string[]; background: string }
    | null
    | undefined;
  const palette = analysis?.palette?.length ? analysis.palette : (tokens?.palette ?? []);
  if (!analysis && palette.length === 0) return null;

  return (
    <section aria-labelledby="reading-heading">
      <h2 id="reading-heading">How the agent read the design</h2>
      {analysis?.summary ? <p>{analysis.summary}</p> : null}
      {palette.length > 0 ? (
        <ul className="swatches" aria-label="Measured colors">
          {palette.map((color) => (
            <li key={color}>
              <span className="swatch" style={{ background: color }} aria-hidden="true" />
              <code>{color}</code>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="reading">
        {analysis?.fonts ? (
          <div>
            <dt>Type</dt>
            <dd>{analysis.fonts}</dd>
          </div>
        ) : null}
        {analysis?.layout ? (
          <div>
            <dt>Layout</dt>
            <dd>{analysis.layout}</dd>
          </div>
        ) : null}
        {analysis?.texts?.length ? (
          <div>
            <dt>Text found</dt>
            <dd>{analysis.texts.slice(0, 12).join(' · ')}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
