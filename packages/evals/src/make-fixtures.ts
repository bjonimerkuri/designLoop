import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(__dirname, '../../..');

async function main() {
  const manifest = JSON.parse(await readFile(path.join(root, 'fixtures', 'manifest.json'), 'utf8')) as {
    id: string;
    width: number;
    height: number;
  }[];
  await mkdir(path.join(root, 'fixtures', 'designs'), { recursive: true });
  const browser = await chromium.launch({
    args: process.env.CHROMIUM_NO_SANDBOX === 'true' ? ['--no-sandbox'] : []
  });
  try {
    for (const fixture of manifest) {
      const page = await browser.newPage({ viewport: { width: fixture.width, height: fixture.height }, deviceScaleFactor: 1 });
      const html = await readFile(path.join(root, 'fixtures', 'html', `${fixture.id}.html`), 'utf8');
      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(root, 'fixtures', 'designs', `${fixture.id}.png`) });
      await page.close();
      console.log(`${fixture.id} ${fixture.width}x${fixture.height}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
