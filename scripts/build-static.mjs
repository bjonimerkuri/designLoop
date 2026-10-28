import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');

const result = spawnSync('npx', ['next', 'build'], {
  cwd: web,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NEXT_PUBLIC_STATIC_DEMO: 'true' }
});

if (result.status !== 0) process.exit(result.status ?? 1);
console.log('\nThe static site is in apps/web/out. Upload that folder to Cloudflare Pages.');
