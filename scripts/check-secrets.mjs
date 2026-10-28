import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SECRETS_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PATTERNS = [
  ['an Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['an OpenAI key', /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['a Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['a private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/]
];

const SKIP = /\.(png|jpe?g|gif|webp|ico|zip|tar|gz|woff2?|ttf|otf|pdf)$|(^|\/)package-lock\.json$/i;

let tracked;
try {
  tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .split('\0')
    .filter(Boolean);
} catch {
  console.log('This folder is not a git repository, so there is nothing to scan yet.');
  process.exit(0);
}

const problems = [];

for (const file of tracked) {
  const base = path.basename(file);
  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
    problems.push(`${file} is tracked by git. Run: git rm --cached ${file}`);
    continue;
  }
  if (SKIP.test(file)) continue;
  const full = path.join(root, file);
  let content;
  try {
    if (statSync(full).size > 1_000_000) continue;
    content = readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  for (const [label, pattern] of PATTERNS) {
    if (pattern.test(content)) problems.push(`${file} contains what looks like ${label}`);
  }
}

if (problems.length) {
  console.error('Possible secrets in the repository:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nRemove them, rotate any real key, and rewrite history if it was already committed.');
  process.exit(1);
}
console.log(`No secrets found in ${tracked.length} tracked files.`);
