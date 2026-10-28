import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.EVALS_SRC ?? path.join(root, 'evals', 'results');
const target = process.env.EVALS_OUT ?? path.join(root, 'apps', 'web', 'public', 'data', 'evals');

if (!existsSync(source)) {
  console.error(`No eval results found at ${source}. Run npm run eval first.`);
  process.exit(1);
}

const files = readdirSync(source)
  .filter((name) => /^[\w.-]+\.json$/.test(name))
  .sort()
  .reverse()
  .slice(0, 20);

if (files.length === 0) {
  console.error('There are no eval result files to export.');
  process.exit(1);
}

mkdirSync(target, { recursive: true });

const index = [];
for (const name of files) {
  const report = JSON.parse(readFileSync(path.join(source, name), 'utf8'));
  copyFileSync(path.join(source, name), path.join(target, name));
  index.push({ name, meta: report.meta, summaries: report.summaries });
}
writeFileSync(path.join(target, 'index.json'), JSON.stringify(index, null, 2));
console.log(`Exported ${files.length} report(s) to ${path.relative(root, target)}`);
