import { spawn } from 'node:child_process';
import type { Framework, Renderer, VerifyResult } from './types';

interface SerializedResult extends Omit<VerifyResult, 'renderPng'> {
  renderPng?: string;
}

export function createDockerRenderer(framework: Framework, env: NodeJS.ProcessEnv = process.env): Renderer {
  const image = env.SANDBOX_IMAGE ?? 'designloop-sandbox';
  const timeoutMs = Number(env.SANDBOX_TIMEOUT_MS ?? 90000);
  const args = [
    'run',
    '--rm',
    '-i',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,size=256m',
    '--memory',
    env.SANDBOX_MEMORY ?? '1g',
    '--cpus',
    env.SANDBOX_CPUS ?? '1',
    '--pids-limit',
    '256',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--shm-size',
    '512m',
    '-e',
    'HOME=/tmp',
    image
  ];

  return {
    render(code, size) {
      return new Promise<VerifyResult>((resolve, reject) => {
        const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('The sandbox timed out'));
        }, timeoutMs);

        child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on('close', (status) => {
          clearTimeout(timer);
          if (status !== 0) {
            reject(new Error(`The sandbox failed: ${Buffer.concat(err).toString().slice(0, 500)}`));
            return;
          }
          try {
            const parsed = JSON.parse(Buffer.concat(out).toString()) as SerializedResult;
            resolve({ ...parsed, renderPng: parsed.renderPng ? Buffer.from(parsed.renderPng, 'base64') : undefined });
          } catch (error) {
            reject(error);
          }
        });
        child.stdin.end(JSON.stringify({ code, size, framework }));
      });
    },
    async close() {}
  };
}
