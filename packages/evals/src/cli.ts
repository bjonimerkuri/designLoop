import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PROMPT_VERSION, createLlmClient, loadAgentConfig, readImageSize, runAgent } from '@designloop/agent-core';
import { FRAMEWORKS } from '@designloop/shared';
import type { EvalMeta, EvalReportFile, EvalResultRecord, Framework } from '@designloop/shared';
import { config as loadEnv } from 'dotenv';
import { saveReport } from './db';
import { buildSummaries, categorize, findRegressions, renderMarkdown } from './report';

const root = path.resolve(__dirname, '../../..');
loadEnv({ path: path.join(root, '.env') });

interface Fixture {
  id: string;
  width: number;
  height: number;
}

const { values } = parseArgs({
  options: {
    framework: { type: 'string', default: 'react' },
    limit: { type: 'string' },
    only: { type: 'string' },
    repeats: { type: 'string', default: '1' },
    model: { type: 'string' },
    'save-db': { type: 'boolean', default: false },
    'save-artifacts': { type: 'boolean', default: false },
    publish: { type: 'boolean', default: false },
    baseline: { type: 'string' },
    'max-regression': { type: 'string', default: '0.1' },
    'min-pass-rate': { type: 'string' }
  }
});

function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

async function main() {
  const choice = values.framework ?? 'react';
  const frameworks: Framework[] =
    choice === 'all'
      ? ['react', 'react-tailwind', 'angular']
      : choice === 'both'
        ? ['react', 'angular']
        : FRAMEWORKS.filter((framework) => framework === choice);
  if (!frameworks.length) throw new Error(`Unknown framework "${choice}". Use react, react-tailwind, angular, both or all.`);
  const repeats = Math.max(1, Number(values.repeats) || 1);

  let fixtures = JSON.parse(await readFile(path.join(root, 'fixtures', 'manifest.json'), 'utf8')) as Fixture[];
  if (values.only) {
    const wanted = new Set(values.only.split(','));
    fixtures = fixtures.filter((fixture) => wanted.has(fixture.id));
  }
  if (values.limit) fixtures = fixtures.slice(0, Number(values.limit));
  if (!fixtures.length) throw new Error('No fixtures selected');

  if (values.model) {
    process.env.ANTHROPIC_MODEL = values.model;
    process.env.OPENAI_MODEL = values.model;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const llm = createLlmClient();
  const agentConfig = loadAgentConfig();
  const results: EvalResultRecord[] = [];

  for (const framework of frameworks) {
    for (const fixture of fixtures) {
      const designPng = await readFile(path.join(root, 'fixtures', 'designs', `${fixture.id}.png`)).catch(() => {
        throw new Error(`Missing fixtures/designs/${fixture.id}.png. Run npm run eval:fixtures first.`);
      });
      const size = readImageSize(designPng);
      if (!size) throw new Error(`${fixture.id}.png is not a valid PNG`);

      for (let repeat = 1; repeat <= repeats; repeat++) {
        const started = Date.now();
        let record: Omit<EvalResultRecord, 'category'>;
        const renders = new Map<number, { render?: Buffer; diff?: Buffer }>();
        try {
          const result = await runAgent(
            { designPng, width: size.width, height: size.height, framework },
            llm,
            agentConfig,
            (step) => {
              if (step.iteration !== undefined && step.artifacts) {
                renders.set(step.iteration, { render: step.artifacts.renderPng, diff: step.artifacts.diffPng });
              }
            }
          );
          if (values['save-artifacts']) {
            const dir = path.join(root, 'evals', 'artifacts', stamp, `${framework}-${fixture.id}-${repeat}`);
            await mkdir(dir, { recursive: true });
            await writeFile(path.join(dir, framework === 'angular' ? 'app.component.ts' : 'Component.tsx'), result.tsx);
            if (result.css) await writeFile(path.join(dir, 'styles.css'), result.css);
            await writeFile(path.join(dir, 'design.png'), designPng);
            const best = renders.get(result.metrics.bestIteration);
            if (best?.render) await writeFile(path.join(dir, 'render.png'), best.render);
            if (best?.diff) await writeFile(path.join(dir, 'diff.png'), best.diff);
          }
          record = {
            fixtureId: fixture.id,
            framework,
            repeat,
            status: result.status,
            stopReason: result.stopReason,
            passed: result.status === 'passed',
            similarity: result.metrics.similarity,
            a11yBlocking: result.metrics.a11yBlocking,
            compiled: result.metrics.compiled,
            consoleErrors: result.metrics.consoleErrors,
            typeErrors: result.metrics.typeErrors,
            iterations: result.metrics.iterations,
            cost: result.metrics.totalCost,
            durationMs: result.metrics.totalDurationMs
          };
        } catch (error) {
          record = {
            fixtureId: fixture.id,
            framework,
            repeat,
            status: 'error',
            stopReason: null,
            passed: false,
            similarity: 0,
            a11yBlocking: 0,
            compiled: false,
            consoleErrors: 0,
            typeErrors: 0,
            iterations: 0,
            cost: 0,
            durationMs: Date.now() - started,
            error: error instanceof Error ? error.message : String(error)
          };
        }
        const full: EvalResultRecord = { ...record, category: categorize(record, agentConfig.similarityThreshold) };
        results.push(full);
        console.log(
          `${framework} ${fixture.id} #${repeat}: ${full.passed ? 'pass' : `fail (${full.category})`}, ${(full.similarity * 100).toFixed(1)}%, ${full.iterations} passes, $${full.cost.toFixed(3)}`
        );
      }
    }
  }

  const meta: EvalMeta = {
    date: new Date().toISOString().slice(0, 10),
    model: llm.model,
    promptVersion: PROMPT_VERSION,
    commit: commit(),
    similarityThreshold: agentConfig.similarityThreshold,
    a11yMaxBlocking: agentConfig.a11yMaxBlocking,
    maxIterations: agentConfig.maxIterations,
    repeats
  };
  const summaries = buildSummaries(results);
  const report: EvalReportFile = { meta, results, summaries };

  const file = `${stamp}-${llm.model.replace(/[^\w.-]/g, '_')}.json`;
  await mkdir(path.join(root, 'evals', 'results'), { recursive: true });
  await writeFile(path.join(root, 'evals', 'results', file), JSON.stringify(report, null, 2));
  const markdown = renderMarkdown(meta, results, summaries);
  const designCount = new Set(results.map((result) => result.fixtureId)).size;
  if (designCount >= 10 || values.publish) {
    await writeFile(path.join(root, 'docs', 'evals.md'), markdown);
    console.log(`Saved evals/results/${file} and docs/evals.md`);
  } else {
    await writeFile(path.join(root, 'evals', 'results', file.replace(/\.json$/, '.md')), markdown);
    console.log(
      `Saved evals/results/${file}. docs/evals.md was not changed because ${designCount} design(s) is too few to publish, use --publish to override`
    );
  }

  if (values['save-db']) {
    await saveReport(report);
    console.log('Saved the report to the database');
  }

  if (values.baseline) {
    const baselineFile = path.resolve(root, values.baseline);
    const baseline = await readFile(baselineFile, 'utf8')
      .then((text) => JSON.parse(text) as EvalReportFile)
      .catch(() => null);
    if (!baseline) {
      console.warn(`No baseline at ${values.baseline}, skipping the regression check`);
    } else {
      const problems = findRegressions(baseline.summaries, summaries, Number(values['max-regression']) || 0.1);
      if (problems.length) {
        problems.forEach((problem) => console.error(problem));
        process.exit(1);
      }
      console.log('No regression against the baseline');
    }
  }

  const minimum = values['min-pass-rate'] === undefined ? null : Number(values['min-pass-rate']);
  if (minimum !== null) {
    const worst = Math.min(...summaries.map((summary) => summary.passRate));
    if (worst < minimum) {
      console.error(`Pass rate ${(worst * 100).toFixed(1)}% is below the required ${(minimum * 100).toFixed(1)}%`);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
