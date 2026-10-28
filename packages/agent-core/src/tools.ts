import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { build } from 'esbuild';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { PNG } from 'pngjs';
import { angularAotCheck } from './aot';
import { compileTailwind } from './tailwind';
import { typecheckComponent } from './typecheck';
import type { A11yIssue, Comparison, Framework, GeneratedCode, Renderer, VerifyResult } from './types';

function resolveModulesDir(specifier: string, levelsUp: number): string | null {
  try {
    const parts = new Array<string>(levelsUp).fill('..');
    return path.resolve(require.resolve(specifier), ...parts);
  } catch {
    return null;
  }
}

const NODE_PATHS = Array.from(
  new Set(
    [resolveModulesDir('react/package.json', 2), resolveModulesDir('@angular/core/package.json', 3)].filter(
      (dir): dir is string => dir !== null
    )
  )
);

const REACT_ENTRY = `import { createRoot } from 'react-dom/client';
import Component from './Component';
import './styles.css';
createRoot(document.getElementById('root') as HTMLElement).render(<Component />);
`;

const ANGULAR_ENTRY = `import * as compiler from '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './component';
(globalThis as Record<string, unknown>).__designloopCompiler = compiler;
bootstrapApplication(AppComponent, { providers: [provideZonelessChangeDetection()] }).catch((error) => console.error(String(error)));
`;

async function bundle(dir: string, code: GeneratedCode, framework: Framework) {
  if (framework === 'angular') {
    await writeFile(path.join(dir, 'component.ts'), code.tsx);
    await writeFile(path.join(dir, 'entry.ts'), ANGULAR_ENTRY);
    return build({
      entryPoints: [path.join(dir, 'entry.ts')],
      bundle: true,
      write: false,
      outdir: path.join(dir, 'out'),
      format: 'iife',
      target: 'es2022',
      nodePaths: NODE_PATHS,
      ignoreAnnotations: true,
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
      logLevel: 'silent'
    });
  }
  const styles = framework === 'react-tailwind' ? await compileTailwind(code.tsx) : code.css;
  await writeFile(path.join(dir, 'Component.tsx'), code.tsx);
  await writeFile(path.join(dir, 'styles.css'), styles);
  await writeFile(path.join(dir, 'entry.tsx'), REACT_ENTRY);
  return build({
    entryPoints: [path.join(dir, 'entry.tsx')],
    bundle: true,
    write: false,
    outdir: path.join(dir, 'out'),
    format: 'iife',
    jsx: 'automatic',
    target: 'es2020',
    nodePaths: NODE_PATHS,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent'
  });
}

function formatBuildErrors(error: unknown): string[] {
  const errors = (error as { errors?: { text: string; location?: { line: number; column: number } | null }[] }).errors;
  if (errors?.length) {
    return errors
      .slice(0, 8)
      .map((e) => (e.location ? `${e.text} (line ${e.location.line}, column ${e.location.column})` : e.text));
  }
  return [error instanceof Error ? error.message : String(error)];
}

export async function renderComponent(
  browser: Browser,
  code: GeneratedCode,
  size: { width: number; height: number },
  framework: Framework
): Promise<VerifyResult> {
  const typeErrors = [...typecheckComponent(code, framework).errors];
  if (framework === 'angular' && process.env.ANGULAR_AOT === 'true') {
    typeErrors.push(...(await angularAotCheck(code.tsx, NODE_PATHS[NODE_PATHS.length - 1] ?? '')));
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), 'designloop-'));
  try {
    let js = '';
    let css = '';
    try {
      const result = await bundle(dir, code, framework);
      js = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
      css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
    } catch (error) {
      return { compiled: false, compileErrors: formatBuildErrors(error), typeErrors, consoleErrors: [], a11y: [] };
    }

    const mountSelector = framework === 'angular' ? 'app-root' : '#root';
    const host = framework === 'angular' ? '<app-root></app-root>' : '<div id="root"></div>';
    const html =
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Preview</title>' +
      `<style>html,body{margin:0;padding:0}body{font-family:system-ui,sans-serif}</style><style>${css}</style></head>` +
      `<body>${host}<script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;

    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    try {
      await context.route('**/*', (route) => {
        const url = route.request().url();
        return url.startsWith('http://') || url.startsWith('https://') ? route.abort() : route.continue();
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => consoleErrors.push(error.message));

      await page.setContent(html, { waitUntil: 'load' });
      await page
        .waitForFunction(
          (selector) => (document.querySelector(selector)?.childElementCount ?? 0) > 0,
          mountSelector,
          { timeout: framework === 'angular' ? 8000 : 3000 }
        )
        .catch(() => undefined);
      await page.waitForTimeout(150);

      const mounted = await page.evaluate(
        (selector) => (document.querySelector(selector)?.childElementCount ?? 0) > 0,
        mountSelector
      );
      if (!mounted) consoleErrors.push('The component rendered nothing.');

      const renderPng = await page.screenshot({ type: 'png' });

      const axe = await new AxeBuilder({ page: page as never })
        .disableRules(['region', 'landmark-one-main', 'page-has-heading-one'])
        .analyze();
      const a11y: A11yIssue[] = axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? 'minor',
        help: v.help,
        count: v.nodes.length
      }));

      return {
        compiled: true,
        compileErrors: [],
        typeErrors,
        consoleErrors: consoleErrors.slice(0, 8),
        a11y,
        renderPng
      };
    } finally {
      await context.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function createBrowserRenderer(framework: Framework): Promise<Renderer> {
  const browser = await chromium.launch({
    args: process.env.CHROMIUM_NO_SANDBOX === 'true' ? ['--no-sandbox'] : []
  });
  return {
    render: (code, size) => renderComponent(browser, code, size, framework),
    close: () => browser.close()
  };
}

const ROWS = ['top', 'middle', 'bottom'];
const COLS = ['left', 'center', 'right'];

export function compareImages(design: Buffer, render: Buffer): Comparison {
  const a = PNG.sync.read(design);
  const b = PNG.sync.read(render);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Render size ${b.width}x${b.height} does not match design size ${a.width}x${a.height}`);
  }
  const { width, height } = a;
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });

  const cells = new Array<number>(9).fill(0);
  for (let y = 0; y < height; y++) {
    const row = Math.min(2, Math.floor((y * 3) / height));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) {
        cells[row * 3 + Math.min(2, Math.floor((x * 3) / width))]++;
      }
    }
  }
  const cellPixels = (width * height) / 9;
  const regions = cells
    .map((count, index) => ({ ratio: count / cellPixels, label: `${ROWS[Math.floor(index / 3)]}-${COLS[index % 3]}` }))
    .filter((cell) => cell.ratio >= 0.1)
    .sort((x, y) => y.ratio - x.ratio)
    .slice(0, 3)
    .map((cell) => `${cell.label} (${Math.round(cell.ratio * 100)}% mismatch)`);

  return {
    similarity: 1 - mismatched / (width * height),
    diffPng: PNG.sync.write(diff),
    regions
  };
}
