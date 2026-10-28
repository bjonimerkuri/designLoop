import type { UserLlmConfig } from '@designloop/agent-core';

const PROVIDERS = ['anthropic', 'openai', 'gemini'];

export class LlmConfigError extends Error {}

type HeaderBag = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function price(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) throw new LlmConfigError(`The ${name} price is not valid.`);
  return parsed;
}

export function parseUserLlm(headers: HeaderBag): UserLlmConfig | null {
  const apiKey = single(headers['x-llm-api-key']);
  const provider = single(headers['x-llm-provider']);
  const model = single(headers['x-llm-model']);
  if (!apiKey && !provider && !model) return null;
  if (!apiKey) throw new LlmConfigError('The API key header is missing.');
  if (!provider || !PROVIDERS.includes(provider)) {
    throw new LlmConfigError('The provider must be anthropic, openai or gemini.');
  }
  if (!/^[\x21-\x7e]{8,400}$/.test(apiKey)) {
    throw new LlmConfigError('The API key must be 8 to 400 visible ASCII characters.');
  }
  if (!model || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(model)) {
    throw new LlmConfigError('The model name is not valid.');
  }
  return {
    provider: provider as UserLlmConfig['provider'],
    apiKey,
    model,
    priceInPerM: price(single(headers['x-llm-price-in']), 'input'),
    priceOutPerM: price(single(headers['x-llm-price-out']), 'output')
  };
}

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{6,}/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /AIza[0-9A-Za-z_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b[A-Za-z0-9_-]{32,}\b/g
];

export function redactSecrets(text: string, secret?: string): string {
  let result = text;
  if (secret && secret.length >= 6) result = result.split(secret).join('[redacted]');
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[redacted]');
  return result;
}
