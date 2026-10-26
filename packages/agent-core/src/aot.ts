import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ERROR_LINE = /error\s+(?:TS|NG)\d+/i;

export async function angularAotCheck(tsx: string, modulesDir: string): Promise<string[]> {
  let cliPackage: string;
  try {
    cliPackage = require.resolve('@angular/compiler-cli/package.json');
  } catch {
    return [];
  }
  const manifest = JSON.parse(await readFile(cliPackage, 'utf8')) as { bin?: string | Record<string, string> };
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.ngc;
  if (!bin) return [];

  const dir = await mkdtemp(path.join(os.tmpdir(), 'designloop-aot-'));
  try {
    await writeFile(path.join(dir, 'component.ts'), tsx);
    await writeFile(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          experimentalDecorators: true,
          useDefineForClassFields: false,
          noEmit: true,
          skipLibCheck: true,
          lib: ['ES2022', 'DOM']
        },
        files: ['component.ts'],
        angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true }
      })
    );
    await symlink(modulesDir, path.join(dir, 'node_modules'), 'dir');

    const output = await new Promise<string>((resolve) => {
      const child = spawn(process.execPath, [path.join(path.dirname(cliPackage), bin), '-p', 'tsconfig.json'], {
        cwd: dir
      });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.on('error', () => {
        clearTimeout(timer);
        resolve('');
      });
      child.on('close', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString());
      });
    });
    return output
      .split('\n')
      .filter((line) => ERROR_LINE.test(line))
      .slice(0, 6)
      .map((line) => line.replace(/\x1b\[[0-9;]*m/g, '').trim());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
