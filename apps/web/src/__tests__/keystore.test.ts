import { clearKey, headersFor, llmHeaders, loadKey, maskKey, saveKey, validateKeyForm } from '@/lib/keystore';
import type { StoredKey } from '@/lib/keystore';

const NAME = 'designloop.llm';

const key: StoredKey = {
  provider: 'gemini',
  apiKey: 'AIzaSyExampleKeyForTests123456',
  model: 'gemini-2.5-flash',
  priceIn: '',
  priceOut: '',
  remember: false
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('key storage', () => {
  it('keeps a session key in sessionStorage only', () => {
    saveKey(key);
    expect(sessionStorage.getItem(NAME)).toContain('AIzaSy');
    expect(localStorage.getItem(NAME)).toBeNull();
    expect(loadKey()).toEqual(key);
  });

  it('keeps a remembered key in localStorage and moves it when the choice changes', () => {
    saveKey({ ...key, remember: true });
    expect(localStorage.getItem(NAME)).not.toBeNull();
    expect(sessionStorage.getItem(NAME)).toBeNull();
    saveKey(key);
    expect(sessionStorage.getItem(NAME)).not.toBeNull();
    expect(localStorage.getItem(NAME)).toBeNull();
  });

  it('removes the key from both places', () => {
    saveKey({ ...key, remember: true });
    clearKey();
    expect(loadKey()).toBeNull();
    expect(localStorage.getItem(NAME)).toBeNull();
  });

  it('ignores corrupt or unknown data', () => {
    sessionStorage.setItem(NAME, '{broken');
    expect(loadKey()).toBeNull();
    sessionStorage.setItem(NAME, JSON.stringify({ provider: 'unknown', apiKey: 'x', model: 'y' }));
    expect(loadKey()).toBeNull();
  });
});

describe('request headers', () => {
  it('sends only the fields that are set', () => {
    expect(headersFor(key)).toEqual({
      'x-llm-provider': 'gemini',
      'x-llm-api-key': key.apiKey,
      'x-llm-model': 'gemini-2.5-flash'
    });
    expect(headersFor({ ...key, priceIn: '0.1', priceOut: '0.4' })).toMatchObject({
      'x-llm-price-in': '0.1',
      'x-llm-price-out': '0.4'
    });
  });

  it('sends nothing when no key is stored', () => {
    expect(llmHeaders()).toEqual({});
    saveKey(key);
    expect(llmHeaders()['x-llm-api-key']).toBe(key.apiKey);
  });
});

describe('helpers', () => {
  it('masks everything but the last four characters', () => {
    expect(maskKey('abcdef123456')).toBe('••••3456');
  });

  it('validates the form fields', () => {
    expect(validateKeyForm(key)).toBeNull();
    expect(validateKeyForm({ ...key, apiKey: 'short' })).toMatch(/8 to 400/);
    expect(validateKeyForm({ ...key, apiKey: 'has a space inside it' })).toMatch(/8 to 400/);
    expect(validateKeyForm({ ...key, apiKey: 'ключ-не-ascii-значение' })).toMatch(/8 to 400/);
    expect(validateKeyForm({ ...key, model: 'bad model' })).toMatch(/model name/);
    expect(validateKeyForm({ ...key, priceIn: '-1' })).toMatch(/Prices/);
    expect(validateKeyForm({ ...key, priceOut: 'abc' })).toMatch(/Prices/);
  });
});
