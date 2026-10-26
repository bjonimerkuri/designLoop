import type { LlmClient, LlmRequest, LlmResponse } from './types';

const REQUEST_TIMEOUT_MS = 120000;

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback;
};

const priceOf = (tokensIn: number, tokensOut: number, env: NodeJS.ProcessEnv) =>
  (tokensIn * num(env.LLM_PRICE_IN_PER_M, 3) + tokensOut * num(env.LLM_PRICE_OUT_PER_M, 15)) / 1_000_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  env: NodeJS.ProcessEnv
): Promise<any> {
  const retries = num(env.LLM_RETRIES, 3);
  const baseDelay = num(env.LLM_RETRY_BASE_MS, 2000);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    const retryable = res.status === 429 || res.status === 503;
    if (!retryable || attempt >= retries) throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
    const advised = Number(res.headers.get('retry-after')) * 1000;
    await sleep(Math.min(30000, advised > 0 ? advised : baseDelay * 2 ** attempt));
  }
}

class OpenAiClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly env: NodeJS.ProcessEnv
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const content = req.parts.map((part) =>
      part.type === 'text'
        ? { type: 'text', text: part.text }
        : { type: 'image_url', image_url: { url: `data:image/png;base64,${part.png.toString('base64')}` } }
    );
    const base = this.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const data = await postJson(
      `${base}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        [this.env.OPENAI_MAX_TOKENS_PARAM ?? 'max_completion_tokens']: req.maxTokens ?? 4096,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content }
        ],
        ...(req.json ? { response_format: { type: 'json_object' } } : {})
      },
      this.env
    );
    const tokensIn = data.usage?.prompt_tokens ?? 0;
    const tokensOut = data.usage?.completion_tokens ?? 0;
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      tokensIn,
      tokensOut,
      costUsd: priceOf(tokensIn, tokensOut, this.env)
    };
  }
}

class AnthropicClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly env: NodeJS.ProcessEnv
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const content = req.parts.map((part) =>
      part.type === 'text'
        ? { type: 'text', text: part.text }
        : { type: 'image', source: { type: 'base64', media_type: 'image/png', data: part.png.toString('base64') } }
    );
    const base = this.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
    const data = await postJson(
      `${base}/v1/messages`,
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 4096,
        system: req.system,
        messages: [{ role: 'user', content }]
      },
      this.env
    );
    const text = Array.isArray(data.content)
      ? data.content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join('')
      : '';
    const tokensIn = data.usage?.input_tokens ?? 0;
    const tokensOut = data.usage?.output_tokens ?? 0;
    return { text, tokensIn, tokensOut, costUsd: priceOf(tokensIn, tokensOut, this.env) };
  }
}

export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const provider = (env.LLM_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')).toLowerCase();
  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    return new AnthropicClient(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', env);
  }
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    return new OpenAiClient(env.OPENAI_API_KEY, env.OPENAI_MODEL ?? 'gpt-4o', env);
  }
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}
