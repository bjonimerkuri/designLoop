import { createLlmClient } from './llm';
import type { LlmClient } from './types';

export type LlmProviderId = 'anthropic' | 'openai' | 'gemini';

export interface UserLlmConfig {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
  priceInPerM?: number;
  priceOutPerM?: number;
}

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export function createUserLlmClient(config: UserLlmConfig, base: NodeJS.ProcessEnv = process.env): LlmClient {
  const shared: NodeJS.ProcessEnv = {
    LLM_RETRIES: base.LLM_RETRIES,
    LLM_RETRY_BASE_MS: base.LLM_RETRY_BASE_MS,
    LLM_PRICE_IN_PER_M: String(config.priceInPerM ?? 0),
    LLM_PRICE_OUT_PER_M: String(config.priceOutPerM ?? 0)
  };
  if (config.provider === 'anthropic') {
    return createLlmClient({
      ...shared,
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: config.apiKey,
      ANTHROPIC_MODEL: config.model
    });
  }
  return createLlmClient({
    ...shared,
    LLM_PROVIDER: 'openai',
    OPENAI_API_KEY: config.apiKey,
    OPENAI_MODEL: config.model,
    ...(config.provider === 'gemini'
      ? { OPENAI_BASE_URL: GEMINI_BASE_URL, OPENAI_MAX_TOKENS_PARAM: 'max_tokens' }
      : {})
  });
}
