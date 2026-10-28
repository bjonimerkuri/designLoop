import type { LlmProviderId } from '@designloop/shared';
import { LLM_PROVIDERS } from '@designloop/shared';

export interface StoredKey {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
  priceIn: string;
  priceOut: string;
  remember: boolean;
}

const NAME = 'designloop.llm';

const isStoredKey = (value: unknown): value is StoredKey => {
  const item = value as Partial<StoredKey> | null;
  return (
    !!item &&
    typeof item.apiKey === 'string' &&
    typeof item.model === 'string' &&
    LLM_PROVIDERS.some((provider) => provider.id === item.provider)
  );
};

export function loadKey(): StoredKey | null {
  try {
    const raw = sessionStorage.getItem(NAME) ?? localStorage.getItem(NAME);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredKey(parsed)
      ? { ...parsed, priceIn: parsed.priceIn ?? '', priceOut: parsed.priceOut ?? '', remember: parsed.remember ?? false }
      : null;
  } catch {
    return null;
  }
}

export function clearKey(): void {
  try {
    sessionStorage.removeItem(NAME);
    localStorage.removeItem(NAME);
  } catch {
    return;
  }
}

export function saveKey(key: StoredKey): void {
  clearKey();
  const store = key.remember ? localStorage : sessionStorage;
  store.setItem(NAME, JSON.stringify(key));
}

export const maskKey = (apiKey: string) => `••••${apiKey.slice(-4)}`;

export function headersFor(key: StoredKey): Record<string, string> {
  return {
    'x-llm-provider': key.provider,
    'x-llm-api-key': key.apiKey,
    'x-llm-model': key.model,
    ...(key.priceIn ? { 'x-llm-price-in': key.priceIn } : {}),
    ...(key.priceOut ? { 'x-llm-price-out': key.priceOut } : {})
  };
}

export function llmHeaders(): Record<string, string> {
  const key = loadKey();
  return key ? headersFor(key) : {};
}

export function validateKeyForm(key: Pick<StoredKey, 'apiKey' | 'model' | 'priceIn' | 'priceOut'>): string | null {
  if (!/^[\x21-\x7e]{8,400}$/.test(key.apiKey)) {
    return 'The key must be 8 to 400 visible characters with no spaces. Paste it again.';
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(key.model)) {
    return 'The model name can only contain letters, numbers and . _ : / -';
  }
  for (const value of [key.priceIn, key.priceOut]) {
    if (value !== '' && !(Number(value) >= 0 && Number(value) <= 1000)) return 'Prices must be numbers from 0 to 1000.';
  }
  return null;
}
