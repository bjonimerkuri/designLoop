import Link from 'next/link';

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? 'https://github.com/bjonimerkuri/designloop';

const STEPS = [
  ['Measure', 'The dominant colors are read from the pixels of the design.'],
  ['Generate', 'A model writes the component for React, React with Tailwind, or Angular.'],
  ['Verify', 'The code is type-checked, built, rendered in a browser, compared with the design pixel by pixel and scanned for accessibility problems.'],
  ['Repair', 'The results, the render and the differences go back to the model until the component passes or a budget runs out.']
];

export function StaticHome() {
  return (
    <div className="static-home">
      <section className="panel">
        <h1>An agent that turns a design into a checked component</h1>
        <p>
          DesignLoop reads a design image, writes a React or Angular component, and verifies its own work before it
          stops. This page is a static copy that replays real runs. It needs no server and no API key.
        </p>
        <div className="review-actions">
          <Link className="button" href="/demo">
            Watch saved runs
          </Link>
          <Link className="button ghost" href="/evals">
            See the evals
          </Link>
          <a className="button ghost" href={REPO_URL}>
            Source on GitHub
          </a>
        </div>
      </section>

      <section aria-labelledby="loop-heading">
        <h2 id="loop-heading">How a run works</h2>
        <ol className="trace">
          {STEPS.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel" aria-labelledby="own-heading">
        <h2 id="own-heading">Run it yourself</h2>
        <p className="muted">
          Live runs need the full app. Clone the repository, add your own provider key on the API key page, and upload
          a design.
        </p>
        <pre className="code">
          <code>{'npm install\nnpm run build:packages\nnpm run dev:api\nnpm run dev:web'}</code>
        </pre>
      </section>
    </div>
  );
}
