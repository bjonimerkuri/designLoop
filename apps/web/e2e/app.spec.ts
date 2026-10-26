import { expect, test } from '@playwright/test';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const step = (index: number, type: string, name: string, summary: string, iteration: number | null, data: unknown) => ({
  id: `s${index}`,
  index,
  type,
  name,
  summary,
  iteration,
  data,
  tokensIn: 0,
  tokensOut: 0,
  cost: 0,
  durationMs: 10
});

const run = {
  id: 'e2esample1234',
  status: 'passed',
  framework: 'react',
  parentId: null,
  instruction: null,
  review: null,
  hint: null,
  model: 'test-model',
  width: 300,
  height: 200,
  promptVersion: 'v3',
  tsx: 'export default function Card() { return null; }',
  css: '.card{}',
  error: null,
  stopReason: 'passed',
  similarity: 0.96,
  a11yBlocking: 0,
  compiled: true,
  iterations: 1,
  bestIteration: 1,
  totalCost: 0.02,
  totalDurationMs: 4000,
  createdAt: '2026-10-24T10:00:00.000Z',
  finishedAt: '2026-10-24T10:00:04.000Z',
  steps: [
    step(0, 'tool', 'extract_tokens', 'Measured 2 dominant colors', null, { palette: ['#ffffff', '#17233a'], background: '#ffffff' }),
    step(1, 'analysis', 'analyze_design', 'A small card', null, { summary: 'A small card', palette: ['#ffffff'], fonts: 'System', texts: [], layout: 'Single block' }),
    step(2, 'generate', 'generate_component', '12 lines of code', 1, null),
    step(3, 'verify', 'verify_component', '96.0% similar', 1, {
      compiled: true,
      compileErrors: [],
      typeErrors: [],
      consoleErrors: [],
      similarity: 0.96,
      regions: [],
      a11y: [],
      blocking: 0,
      passed: true
    })
  ]
};

test('the home page offers the three outputs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New run' })).toBeVisible();
  for (const label of ['React', 'React + Tailwind', 'Angular']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
});

test('a saved run replays step by step and ends with the code', async ({ page }) => {
  await page.route('**/demo/e2e-sample/run.json', (route) => route.fulfill({ json: run }));
  await page.route('**/demo/e2e-sample/*.png', (route) => route.fulfill({ body: pixel, contentType: 'image/png' }));
  await page.goto('/demo/e2e-sample');
  await expect(page.getByText('Measured the colors')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Component code' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Passed', { exact: true })).toBeVisible();
});

test('the theme can be switched', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
