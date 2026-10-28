import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hooks = path.join(root, '.git', 'hooks');

if (!existsSync(path.join(root, '.git'))) {
  console.error('This folder is not a git repository. Run git init first.');
  process.exit(1);
}

mkdirSync(hooks, { recursive: true });
const file = path.join(hooks, 'pre-commit');
writeFileSync(file, '#!/bin/sh\nnode scripts/check-secrets.mjs\n');
chmodSync(file, 0o755);
console.log('Installed the pre-commit hook. It blocks commits that contain keys or a tracked .env file.');
