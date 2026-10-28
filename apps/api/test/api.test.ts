import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, mock, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { encode } from 'jpeg-js';
import { PNG } from 'pngjs';
import request from 'supertest';

const root = mkdtempSync(join(tmpdir(), 'designloop-api-'));
const evalsDir = join(root, 'evals');
mkdirSync(evalsDir, { recursive: true });
process.env.STORAGE_DIR = join(root, 'storage');
process.env.EVALS_DIR = evalsDir;
process.env.LLM_PROVIDER = 'anthropic';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.WORKER_ENABLED = 'false';

function png(width: number, height: number): Buffer {
  const image = new PNG({ width, height });
  image.data.fill(255);
  return PNG.sync.write(image);
}

function jpeg(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4, 200);
  return Buffer.from(encode({ data, width, height }, 80).data);
}

type Row = Record<string, unknown>;
const runs = new Map<string, Row>();

const fakePrisma = {
  $queryRaw: async () => [1],
  $connect: async () => undefined,
  $disconnect: async () => undefined,
  run: {
    create: async ({ data }: { data: Row }) => {
      const run: Row = {
        id: `run${runs.size + 1}abcdefghij`,
        createdAt: new Date(),
        finishedAt: null,
        tsx: null,
        css: null,
        error: null,
        stopReason: null,
        similarity: null,
        a11yBlocking: null,
        compiled: null,
        iterations: null,
        bestIteration: null,
        totalCost: null,
        totalDurationMs: null,
        parentId: null,
        instruction: null,
        baseTsx: null,
        baseCss: null,
        ...data
      };
      runs.set(run.id as string, run);
      return run;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const run = runs.get(where.id);
      return run ? { ...run, steps: [] } : null;
    },
    findMany: async () => [...runs.values()],
    aggregate: async () => ({ _sum: { totalCost: 0 }, _avg: {} }),
    groupBy: async () => [],
    update: async ({ where, data }: { where: { id: string }; data: Row }) => ({ ...runs.get(where.id), ...data })
  },
  evalRun: {
    findMany: async () => [
      {
        id: 'eval1',
        createdAt: new Date('2026-10-24T10:00:00Z'),
        meta: { model: 'm', date: '2026-10-24' },
        summaries: []
      }
    ]
  },
  step: {
    create: async ({ data }: { data: Row }) => data,
    deleteMany: async () => ({ count: 0 })
  }
};

let app: INestApplication;

before(async () => {
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module');
  const { PrismaService } = await import('../src/prisma.service');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(fakePrisma)
    .compile();
  app = moduleRef.createNestApplication();
  const { securityHeaders } = await import('../src/security');
  app.use(securityHeaders);
  await app.init();
});

after(async () => {
  await app.close();
});

const server = () => app.getHttpServer();

test('health reports the database as up', async () => {
  const res = await request(server()).get('/health').expect(200);
  assert.deepEqual(res.body, { status: 'ok', database: 'up' });
});

test('metrics returns an empty window', async () => {
  const res = await request(server()).get('/metrics').expect(200);
  assert.equal(res.body.passRate, null);
  assert.equal(res.body.windowHours, 24);
});

test('creating a run needs a design file', async () => {
  const res = await request(server()).post('/runs').expect(400);
  assert.match(res.body.message, /PNG/);
});

test('creating a run rejects an unknown framework', async () => {
  const res = await request(server())
    .post('/runs')
    .field('framework', 'vue')
    .attach('design', png(300, 200), { filename: 'd.png', contentType: 'image/png' })
    .expect(400);
  assert.match(res.body.message, /react-tailwind/);
});

test('a JPEG upload is converted and accepted', async () => {
  const created = await request(server())
    .post('/runs')
    .field('framework', 'react-tailwind')
    .attach('design', jpeg(320, 240), { filename: 'd.jpg', contentType: 'image/jpeg' })
    .expect(201);
  assert.equal(created.body.framework, 'react-tailwind');
  assert.equal(created.body.width, 320);
  const image = await request(server()).get(`/runs/${created.body.id}/files/design.png`).expect(200);
  assert.match(image.headers['content-type'], /image\/png/);
});

test('creating a run rejects files that are not PNG', async () => {
  const res = await request(server())
    .post('/runs')
    .attach('design', Buffer.from('not an image'), { filename: 'd.png', contentType: 'image/png' })
    .expect(400);
  assert.match(res.body.message, /PNG/);
});

test('creating a run rejects sizes outside the limits', async () => {
  const res = await request(server())
    .post('/runs')
    .attach('design', png(100, 50), { filename: 'd.png', contentType: 'image/png' })
    .expect(400);
  assert.match(res.body.message, /between/);
});

test('a valid upload creates a queued run and serves its design', async () => {
  const created = await request(server())
    .post('/runs')
    .field('framework', 'angular')
    .field('hint', 'pricing card')
    .attach('design', png(300, 200), { filename: 'd.png', contentType: 'image/png' })
    .expect(201);
  assert.equal(created.body.status, 'queued');
  assert.equal(created.body.framework, 'angular');
  assert.equal(created.body.width, 300);

  const fetched = await request(server()).get(`/runs/${created.body.id}`).expect(200);
  assert.equal(fetched.body.id, created.body.id);

  const image = await request(server()).get(`/runs/${created.body.id}/files/design.png`).expect(200);
  assert.match(image.headers['content-type'], /image\/png/);

  await request(server()).get(`/runs/${created.body.id}/files/render-9.png`).expect(404);
  await request(server()).get(`/runs/${created.body.id}/files/..%2F..%2Fsecret.png`).expect(404);
});

test('reviews need a valid decision and a finished run', async () => {
  const created = await request(server())
    .post('/runs')
    .attach('design', png(300, 200), { filename: 'd.png', contentType: 'image/png' })
    .expect(201);
  await request(server()).post(`/runs/${created.body.id}/review`).send({ decision: 'maybe' }).expect(400);
  const early = await request(server()).post(`/runs/${created.body.id}/review`).send({ decision: 'accepted' }).expect(400);
  assert.match(early.body.message, /finish/);

  runs.set(created.body.id, { ...runs.get(created.body.id), status: 'passed', tsx: 'code', css: '' });
  const reviewed = await request(server()).post(`/runs/${created.body.id}/review`).send({ decision: 'accepted' }).expect(201);
  assert.equal(reviewed.body.review, 'accepted');
});

test('the run list is paginated with a cursor', async () => {
  for (let i = 0; i < 3; i++) {
    await request(server())
      .post('/runs')
      .attach('design', png(300, 200), { filename: 'd.png', contentType: 'image/png' })
      .expect(201);
  }
  const first = await request(server()).get('/runs?limit=2').expect(200);
  assert.equal(first.body.items.length, 2);
  assert.equal(typeof first.body.nextCursor, 'string');

  const all = await request(server()).get('/runs?limit=100').expect(200);
  assert.ok(all.body.items.length >= 3);
  assert.equal(all.body.nextCursor, null);

  const bad = await request(server()).get('/runs?limit=abc&cursor=../etc').expect(200);
  assert.ok(Array.isArray(bad.body.items));
});

test('unknown runs return 404', async () => {
  await request(server()).get('/runs/doesnotexist1234').expect(404);
});

test('revisions need an instruction and a finished run', async () => {
  const created = await request(server())
    .post('/runs')
    .attach('design', png(300, 200), { filename: 'd.png', contentType: 'image/png' })
    .expect(201);
  await request(server()).post(`/runs/${created.body.id}/revisions`).send({ instruction: '   ' }).expect(400);
  const early = await request(server())
    .post(`/runs/${created.body.id}/revisions`)
    .send({ instruction: 'Make it bigger' })
    .expect(400);
  assert.match(early.body.message, /finish/);
});

test('demo mode limits runs per hour', async () => {
  process.env.DEMO_MODE = 'true';
  process.env.ALLOW_SERVER_KEY = 'true';
  process.env.RATE_LIMIT_PER_HOUR = '2';
  try {
    const upload = () =>
      request(server()).post('/runs').attach('design', png(300, 200), { filename: 'd.png', contentType: 'image/png' });
    await upload().expect(201);
    await upload().expect(201);
    const limited = await upload().expect(429);
    assert.match(limited.body.message, /limit/);
  } finally {
    delete process.env.DEMO_MODE;
    delete process.env.RATE_LIMIT_PER_HOUR;
  }
});

test('metrics need the admin token when one is set', async () => {
  process.env.ADMIN_TOKEN = 'secret';
  try {
    await request(server()).get('/metrics').expect(401);
    await request(server()).get('/metrics').set('Authorization', 'Bearer wrong').expect(401);
    await request(server()).get('/metrics').set('Authorization', 'Bearer secret').expect(200);
  } finally {
    delete process.env.ADMIN_TOKEN;
  }
});

test('prometheus metrics are plain text and share the admin token', async () => {
  const res = await request(server()).get('/metrics/prometheus').expect(200);
  assert.match(res.headers['content-type'], /text\/plain/);
  assert.match(res.text, /# TYPE designloop_runs gauge/);
  assert.match(res.text, /designloop_cost_usd 0/);

  process.env.ADMIN_TOKEN = 'secret';
  try {
    await request(server()).get('/metrics/prometheus').expect(401);
    await request(server()).get('/metrics/prometheus').set('Authorization', 'Bearer secret').expect(200);
  } finally {
    delete process.env.ADMIN_TOKEN;
  }
});

test('eval history is read from the database', async () => {
  const res = await request(server()).get('/evals/history').expect(200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].meta.model, 'm');
});

test('eval reports are listed and read from disk', async () => {
  const empty = await request(server()).get('/evals').expect(200);
  assert.deepEqual(empty.body, []);

  const report = {
    meta: { date: '2026-10-24', model: 'm', promptVersion: 'v2', commit: 'abc', similarityThreshold: 0.9, a11yMaxBlocking: 0, maxIterations: 5, repeats: 1 },
    results: [],
    summaries: []
  };
  writeFileSync(join(evalsDir, 'one.json'), JSON.stringify(report));
  const list = await request(server()).get('/evals').expect(200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].name, 'one.json');

  const detail = await request(server()).get('/evals/one.json').expect(200);
  assert.equal(detail.body.meta.model, 'm');
  await request(server()).get('/evals/missing.json').expect(404);
  await request(server()).get('/evals/..%2Fpackage.json').expect(404);
});

const PERSONAL = {
  'x-llm-provider': 'anthropic',
  'x-llm-api-key': 'sk-ant-personal-secret-123456',
  'x-llm-model': 'claude-sonnet-5-5'
};

const upload = () =>
  request(server()).post('/runs').attach('design', png(300, 200), { filename: 'd.png', contentType: 'image/png' });

test('the config endpoint says whether a server key exists', async () => {
  const res = await request(server()).get('/config').expect(200);
  assert.deepEqual(res.body, { serverKeyAvailable: true, personalKeysEnabled: true, demoMode: false });
});

test('a personal key creates a run and is never stored or returned', async () => {
  const res = await upload().set(PERSONAL).expect(201);
  assert.equal(res.body.model, 'claude-sonnet-5-5');
  assert.ok(!JSON.stringify(res.body).includes('personal-secret'));
  assert.ok(!JSON.stringify([...runs.values()]).includes('personal-secret'));
  assert.equal(runs.get(res.body.id)?.usesServerKey, false);
});

test('invalid personal key settings are rejected without echoing the key', async () => {
  const cases: [Record<string, string>, RegExp][] = [
    [{ ...PERSONAL, 'x-llm-provider': 'other' }, /provider/],
    [{ ...PERSONAL, 'x-llm-api-key': 'short' }, /API key/],
    [{ ...PERSONAL, 'x-llm-model': 'bad model' }, /model/],
    [{ 'x-llm-provider': 'openai', 'x-llm-model': 'gpt-4o' }, /key/],
    [{ ...PERSONAL, 'x-llm-price-in': '-1' }, /price/]
  ];
  for (const [headers, pattern] of cases) {
    const res = await upload().set(headers).expect(400);
    assert.match(res.body.message, pattern);
    assert.ok(!JSON.stringify(res.body).includes('personal-secret'));
  }
});

test('without a server key and without a personal key the run is refused', async () => {
  process.env.ALLOW_SERVER_KEY = 'false';
  try {
    const refused = await upload().expect(400);
    assert.match(refused.body.message, /API key/);
    const config = await request(server()).get('/config').expect(200);
    assert.equal(config.body.serverKeyAvailable, false);
    await upload().set(PERSONAL).expect(201);
  } finally {
    delete process.env.ALLOW_SERVER_KEY;
  }
});

test('personal keys are not counted against the demo limits', async () => {
  process.env.DEMO_MODE = 'true';
  process.env.RATE_LIMIT_PER_HOUR = '1';
  try {
    for (let i = 0; i < 3; i++) await upload().set(PERSONAL).expect(201);
  } finally {
    delete process.env.DEMO_MODE;
    delete process.env.RATE_LIMIT_PER_HOUR;
  }
});

test('personal keys can be turned off', async () => {
  process.env.PERSONAL_KEYS = 'false';
  try {
    const res = await upload().set(PERSONAL).expect(400);
    assert.match(res.body.message, /turned off/);
  } finally {
    delete process.env.PERSONAL_KEYS;
  }
});

test('the key check reports success and hides the key in error messages', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async () =>
    calls++ === 0
      ? new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: 'invalid x-api-key sk-ant-personal-secret-123456' } }), { status: 401 })
  );
  try {
    const good = await request(server()).post('/llm/test').set(PERSONAL).expect(201);
    assert.equal(good.body.ok, true);
    const bad = await request(server()).post('/llm/test').set(PERSONAL).expect(201);
    assert.equal(bad.body.ok, false);
    assert.match(bad.body.message, /401/);
    assert.ok(!bad.body.message.includes('personal-secret'));
  } finally {
    mock.restoreAll();
  }
  await request(server()).post('/llm/test').expect(400);
});

test('every response carries the security headers', async () => {
  const res = await request(server()).get('/health').expect(200);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal(res.headers['x-frame-options'], 'DENY');
});
