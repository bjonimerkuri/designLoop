import '../env';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { STORAGE_DIR } from '../config';
import { toRunView } from '../mappers';

interface DemoEntry {
  slug: string;
  title: string;
  framework: string;
  similarity: number | null;
  status: string;
}

async function main() {
  const [runId, slug, ...titleParts] = process.argv.slice(2);
  if (!runId || !slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Usage: npm run demo:export -w @designloop/api -- <runId> <slug> [title]');
  }
  const prisma = new PrismaClient();
  try {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { index: 'asc' } } }
    });
    if (!run) throw new Error(`Run ${runId} was not found`);

    const publicDir = resolve(__dirname, '..', '..', '..', 'web', 'public', 'demo');
    const out = join(publicDir, slug);
    await mkdir(out, { recursive: true });

    const view = toRunView(run, run.steps);
    await writeFile(join(out, 'run.json'), JSON.stringify(view, null, 2));
    for (const name of await readdir(join(STORAGE_DIR, runId))) {
      if (name.endsWith('.png')) await copyFile(join(STORAGE_DIR, runId, name), join(out, name));
    }

    const indexPath = join(publicDir, 'index.json');
    const index = JSON.parse(await readFile(indexPath, 'utf8').catch(() => '[]')) as DemoEntry[];
    const entry: DemoEntry = {
      slug,
      title: titleParts.join(' ') || slug,
      framework: run.framework,
      similarity: run.similarity,
      status: run.status
    };
    await writeFile(indexPath, JSON.stringify([...index.filter((item) => item.slug !== slug), entry], null, 2));
    console.log(`Exported run ${runId} to apps/web/public/demo/${slug}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
