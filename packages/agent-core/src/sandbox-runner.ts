import { chromium } from 'playwright';
import { renderComponent } from './tools';
import type { Framework, GeneratedCode } from './types';

interface RunnerInput {
  code: GeneratedCode;
  size: { width: number; height: number };
  framework: Framework;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

async function main() {
  const input = JSON.parse(await readStdin()) as RunnerInput;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const result = await renderComponent(browser, input.code, input.size, input.framework);
    process.stdout.write(JSON.stringify({ ...result, renderPng: result.renderPng?.toString('base64') }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(String(error));
  process.exit(1);
});
