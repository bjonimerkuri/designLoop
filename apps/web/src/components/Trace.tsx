import type { StepView } from '@designloop/shared';
import { seconds, usd } from '@/lib/format';

const labels: Record<string, string> = {
  extract_tokens: 'Measured the colors',
  analyze_design: 'Read the design',
  generate_component: 'Wrote the component',
  fix_component: 'Revised the component',
  verify_component: 'Checked the result'
};

export function Trace({ steps, running }: { steps: StepView[]; running: boolean }) {
  return (
    <section aria-labelledby="trace-heading">
      <h2 id="trace-heading">What the agent did</h2>
      <ol className="trace">
        {steps.map((step) => (
          <li key={step.index} data-type={step.type}>
            <div className="trace-head">
              <strong>{labels[step.name] ?? step.name}</strong>
              {step.iteration !== null ? <span className="muted small">Pass {step.iteration}</span> : null}
            </div>
            <p>{step.summary}</p>
            <p className="muted small">
              {step.tokensIn + step.tokensOut > 0
                ? `${step.tokensIn.toLocaleString()} tokens in, ${step.tokensOut.toLocaleString()} out, ${usd(step.cost)}, `
                : ''}
              {seconds(step.durationMs)}
            </p>
          </li>
        ))}
        {running ? (
          <li className="working" aria-live="polite">
            <p>Working on the next step.</p>
          </li>
        ) : null}
      </ol>
    </section>
  );
}
