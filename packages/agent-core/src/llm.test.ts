import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { createLlmClient } from './llm';

afterEach(() => mock.restoreAll());

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
}

function stubSequence(responses: { payload: unknown; status: number; headers?: Record<string, string> }[]): Call[] {
  const calls: Call[] = [];
  mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(next.payload), { status: next.status, headers: next.headers });
  });
  return calls;
}

function stubFetch(payload: unknown, status = 200): Call[] {
  const calls: Call[] = [];
  mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body))
    });
    return new Response(JSON.stringify(payload), { status });
  });
  return calls;
}

const request = {
  system: 'You are careful.',
  parts: [
    { type: 'text' as const, text: 'Describe this.' },
    { type: 'image' as const, png: Buffer.from('abc') }
  ]
};

test('the OpenAI client sends an image, asks for JSON and prices the usage', async () => {
  const calls = stubFetch({ choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } });
  const client = createLlmClient({
    LLM_PROVIDER: 'openai',
    OPENAI_API_KEY: 'key',
    OPENAI_MODEL: 'model-one',
    LLM_PRICE_IN_PER_M: '2',
    LLM_PRICE_OUT_PER_M: '10'
  });
  const result = await client.complete({ ...request, json: true, maxTokens: 800 });

  assert.equal(client.model, 'model-one');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].headers.authorization, 'Bearer key');
  assert.equal(calls[0].body.model, 'model-one');
  assert.equal(calls[0].body.max_completion_tokens, 800);
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.equal(calls[0].body.messages[0].role, 'system');
  assert.match(calls[0].body.messages[1].content[1].image_url.url, /^data:image\/png;base64,YWJj$/);
  assert.equal(result.text, 'hello');
  assert.equal(result.tokensIn, 1000);
  assert.equal(result.tokensOut, 500);
  assert.ok(Math.abs(result.costUsd - 0.007) < 1e-9);
});

test('the Anthropic client sends the system prompt and image blocks and joins text blocks', async () => {
  const calls = stubFetch({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], usage: { input_tokens: 10, output_tokens: 5 } });
  const client = createLlmClient({ ANTHROPIC_API_KEY: 'key' });
  const result = await client.complete(request);

  assert.equal(client.model, 'claude-sonnet-5-5');
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], 'key');
  assert.equal(calls[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(calls[0].body.system, 'You are careful.');
  assert.deepEqual(calls[0].body.messages[0].content[1].source, { type: 'base64', media_type: 'image/png', data: 'YWJj' });
  assert.equal(result.text, 'ab');
  assert.equal(result.tokensIn, 10);
});

test('the provider follows the configured keys', () => {
  assert.equal(createLlmClient({ ANTHROPIC_API_KEY: 'a' }).model, 'claude-sonnet-5-5');
  assert.equal(createLlmClient({ OPENAI_API_KEY: 'o' }).model, 'gpt-4o');
  assert.equal(createLlmClient({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' }).model, 'gpt-4o');
});

test('a missing key or unknown provider is reported clearly', () => {
  assert.throws(() => createLlmClient({}), /not set/);
  assert.throws(() => createLlmClient({ LLM_PROVIDER: 'anthropic' }), /ANTHROPIC_API_KEY is not set/);
  assert.throws(() => createLlmClient({ LLM_PROVIDER: 'other', OPENAI_API_KEY: 'o' }), /Unknown LLM_PROVIDER/);
});

test('an error response becomes an error with the status code', async () => {
  stubFetch({ error: 'rate limited' }, 429);
  const client = createLlmClient({ ANTHROPIC_API_KEY: 'key', LLM_RETRIES: '0' });
  await assert.rejects(client.complete(request), /429/);
});

test('a rate limit response is retried and then succeeds', async () => {
  const calls = stubSequence([
    { payload: { error: 'slow down' }, status: 429, headers: { 'retry-after': '0' } },
    { payload: { error: 'busy' }, status: 503 },
    { payload: { content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 1, output_tokens: 1 } }, status: 200 }
  ]);
  const client = createLlmClient({ ANTHROPIC_API_KEY: 'key', LLM_RETRY_BASE_MS: '1' });
  const result = await client.complete(request);
  assert.equal(result.text, 'done');
  assert.equal(calls.length, 3);
});

test('errors that are not rate limits are not retried', async () => {
  const calls = stubSequence([{ payload: { error: 'bad key' }, status: 401 }]);
  const client = createLlmClient({ ANTHROPIC_API_KEY: 'key', LLM_RETRY_BASE_MS: '1' });
  await assert.rejects(client.complete(request), /401/);
  assert.equal(calls.length, 1);
});

test('an OpenAI-compatible server can use another base URL and token parameter', async () => {
  const calls = stubFetch({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  const client = createLlmClient({
    LLM_PROVIDER: 'openai',
    OPENAI_API_KEY: 'key',
    OPENAI_MODEL: 'gemini-flash',
    OPENAI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    OPENAI_MAX_TOKENS_PARAM: 'max_tokens',
    LLM_PRICE_IN_PER_M: '0',
    LLM_PRICE_OUT_PER_M: '0'
  });
  const result = await client.complete({ ...request, maxTokens: 300 });
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(calls[0].body.max_tokens, 300);
  assert.equal(calls[0].body.max_completion_tokens, undefined);
  assert.equal(result.costUsd, 0);
});
