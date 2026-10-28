import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LlmConfigError, parseUserLlm, redactSecrets } from '../src/user-llm';

const valid = {
  'x-llm-provider': 'gemini',
  'x-llm-api-key': 'AIzaSyExampleKeyForTests123456',
  'x-llm-model': 'gemini-2.5-flash'
};

test('no headers means no personal key', () => {
  assert.equal(parseUserLlm({}), null);
});

test('valid headers become a config', () => {
  assert.deepEqual(parseUserLlm({ ...valid, 'x-llm-price-in': '0.1', 'x-llm-price-out': '0.4' }), {
    provider: 'gemini',
    apiKey: 'AIzaSyExampleKeyForTests123456',
    model: 'gemini-2.5-flash',
    priceInPerM: 0.1,
    priceOutPerM: 0.4
  });
  assert.equal(parseUserLlm(valid)?.priceInPerM, undefined);
});

test('invalid settings throw an error that never contains the key', () => {
  const bad: Record<string, string>[] = [
    { ...valid, 'x-llm-provider': 'custom' },
    { ...valid, 'x-llm-api-key': 'tiny' },
    { ...valid, 'x-llm-api-key': 'has space in the key value' },
    { ...valid, 'x-llm-model': '../etc/passwd' },
    { ...valid, 'x-llm-model': '' },
    { ...valid, 'x-llm-price-in': 'abc' },
    { ...valid, 'x-llm-price-out': '5000' }
  ];
  for (const headers of bad) {
    assert.throws(
      () => parseUserLlm(headers),
      (error: unknown) => error instanceof LlmConfigError && !error.message.includes('AIzaSy') && !error.message.includes('tiny')
    );
  }
});

test('redactSecrets removes the key and common key formats', () => {
  const key = 'abc-very-secret-value-123';
  assert.equal(redactSecrets(`bad key ${key} here`, key), 'bad key [redacted] here');
  assert.equal(redactSecrets('key sk-ant-api03-abcdefghijkl was rejected'), 'key [redacted] was rejected');
  assert.equal(redactSecrets('key sk-proj-abcdefghijkl1234 invalid'), 'key [redacted] invalid');
  assert.equal(redactSecrets('key AIzaSyA1B2C3D4E5F6G7H8 invalid'), 'key [redacted] invalid');
  assert.equal(redactSecrets('Authorization: Bearer abcdefghijklmnop'), 'Authorization: [redacted]');
  assert.equal(redactSecrets('HTTP 429 slow down'), 'HTTP 429 slow down');
});
