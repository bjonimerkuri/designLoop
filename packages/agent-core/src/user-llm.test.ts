import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { createUserLlmClient } from './user-llm';

afterEach(() => mock.restoreAll());

function stub(payload: unknown) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, any> }[] = [];
  mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  return calls;
}

const request = { system: 's', parts: [{ type: 'text' as const, text: 't' }] };

test('a personal Anthropic key is used and the server key is ignored', async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'server-key';
  try {
    const calls = stub({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } });
    const client = createUserLlmClient({ provider: 'anthropic', apiKey: 'user-key', model: 'claude-x' });
    await client.complete(request);
    assert.equal(client.model, 'claude-x');
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
    assert.equal(calls[0].headers['x-api-key'], 'user-key');
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous;
  }
});

test('a personal OpenAI key cannot be redirected to another host', async () => {
  const previous = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_BASE_URL = 'https://internal.example.test/v1';
  try {
    const calls = stub({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    await createUserLlmClient({ provider: 'openai', apiKey: 'user-key', model: 'gpt-x' }).complete(request);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0].headers.authorization, 'Bearer user-key');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous;
  }
});

test('a personal Gemini key uses the fixed Gemini endpoint and max_tokens', async () => {
  const calls = stub({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  await createUserLlmClient({ provider: 'gemini', apiKey: 'user-key', model: 'gemini-x' }).complete({ ...request, maxTokens: 50 });
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(calls[0].body.max_tokens, 50);
  assert.equal(calls[0].body.max_completion_tokens, undefined);
});

test('cost is zero unless the user supplies prices', async () => {
  stub({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } });
  const free = await createUserLlmClient({ provider: 'openai', apiKey: 'k', model: 'm' }).complete(request);
  assert.equal(free.costUsd, 0);
  const priced = await createUserLlmClient({ provider: 'openai', apiKey: 'k', model: 'm', priceInPerM: 1, priceOutPerM: 3 }).complete(request);
  assert.ok(Math.abs(priced.costUsd - 0.004) < 1e-9);
});
