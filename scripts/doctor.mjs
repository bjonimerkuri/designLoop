import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

const record = (ok, label, hint = '', optional = false) => {
  results.push({ ok, label, hint, optional });
};

function parseEnv(file) {
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

function canConnect(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
  });
}

function tracked(file) {
  try {
    return execFileSync('git', ['ls-files', '--error-unmatch', file], { cwd: root, stdio: 'ignore' }) !== null;
  } catch {
    return false;
  }
}

function run(command, args) {
  try {
    return execFileSync(command, args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

const major = Number(process.versions.node.split('.')[0]);
record(major >= 20, `Node ${process.versions.node}`, 'Install Node 20 or newer');

const envFile = path.join(root, '.env');
record(existsSync(envFile), '.env file exists', 'Run: cp .env.example .env');
const env = { ...parseEnv(path.join(root, '.env.example')), ...parseEnv(envFile), ...process.env };

const provider = env.LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai');
const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
record(
  Boolean(env[keyName]),
  `${keyName} is set (provider: ${provider})`,
  `Add ${keyName} to .env, or enter a key in the app under API key. Leave it out when visitors must bring their own`,
  true
);
record(
  !existsSync(path.join(root, '.git')) || !tracked('.env'),
  '.env is not tracked by git',
  'Run: git rm --cached .env, then rotate the key it contained'
);
record(
  Number(env.LLM_PRICE_IN_PER_M) > 0 && Number(env.LLM_PRICE_OUT_PER_M) > 0,
  'Model prices are set',
  'Set LLM_PRICE_IN_PER_M and LLM_PRICE_OUT_PER_M so costs are correct',
  true
);

record(existsSync(path.join(root, 'node_modules')), 'Dependencies are installed', 'Run: npm install');
for (const name of ['shared', 'agent-core']) {
  record(existsSync(path.join(root, 'packages', name, 'dist')), `packages/${name} is built`, 'Run: npm run build:packages');
}

try {
  const url = new URL(env.DATABASE_URL);
  const port = Number(url.port || 5432);
  const reachable = await canConnect(url.hostname, port);
  record(reachable, `Database reachable at ${url.hostname}:${port}`, 'Run: npm run db:up');
} catch {
  record(false, 'DATABASE_URL is valid', 'Check DATABASE_URL in .env');
}
record(
  existsSync(path.join(root, 'apps', 'api', 'prisma', 'migrations')),
  'Database migrations exist',
  'Run: npm run db:migrate (or npm run db:push for a quick start)',
  true
);

try {
  const { chromium } = await import('playwright');
  const executable = chromium.executablePath();
  record(existsSync(executable), 'Chromium is installed for Playwright', 'Run: npm run browsers');
} catch {
  record(false, 'Playwright is installed', 'Run: npm install', false);
}

const dockerVersion = run('docker', ['--version']);
record(Boolean(dockerVersion), dockerVersion ?? 'Docker is available', 'Install Docker (needed for Postgres and the sandbox)');
if (env.SANDBOX === 'docker') {
  const image = env.SANDBOX_IMAGE || 'designloop-sandbox';
  record(run('docker', ['image', 'inspect', image]) !== null, `Sandbox image "${image}" exists`, 'Run: npm run sandbox:build');
}

const designs = path.join(root, 'fixtures', 'designs');
const count = existsSync(designs) ? readdirSync(designs).filter((name) => name.endsWith('.png')).length : 0;
record(count > 0, `Eval fixtures rendered (${count})`, 'Run: npm run eval:fixtures (only needed for evals)', true);

for (const port of [4000, 3000]) {
  const inUse = await canConnect('127.0.0.1', port, 500);
  record(!inUse, `Port ${port} is free`, `Something is already listening on ${port}. Stop it or change the port`, true);
}

let failed = 0;
for (const result of results) {
  const mark = result.ok ? 'ok     ' : result.optional ? 'warning' : 'FAIL   ';
  console.log(`${mark} ${result.label}${result.ok ? '' : `\n         ${result.hint}`}`);
  if (!result.ok && !result.optional) failed++;
}
console.log(failed ? `\n${failed} problem(s) to fix before starting.` : '\nReady to run.');
process.exit(failed ? 1 : 0);
