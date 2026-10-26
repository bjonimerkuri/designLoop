import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalReportFile } from '@designloop/shared';
import { renderComparison } from './report';

const root = path.resolve(__dirname, '../../..');

async function load(name: string): Promise<EvalReportFile> {
  const file = path.basename(name);
  return JSON.parse(await readFile(path.join(root, 'evals', 'results', file), 'utf8')) as EvalReportFile;
}

async function main() {
  const [first, second] = process.argv.slice(2);
  if (!first || !second) {
    throw new Error('Usage: npm run eval:compare -- <report-a.json> <report-b.json> (files from evals/results)');
  }
  const markdown = renderComparison(await load(first), await load(second));
  await writeFile(path.join(root, 'docs', 'model-comparison.md'), markdown);
  console.log(markdown);
  console.log('Saved docs/model-comparison.md');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
