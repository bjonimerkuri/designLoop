import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { test } from 'node:test';
import { KeyVault } from '../src/key-vault';

const config = { provider: 'openai' as const, apiKey: 'sk-super-secret-value', model: 'gpt-4o' };

test('a key can be taken once and is then gone', () => {
  const vault = new KeyVault();
  vault.put('run1', config);
  assert.equal(vault.size, 1);
  assert.deepEqual(vault.take('run1'), config);
  assert.equal(vault.take('run1'), null);
  assert.equal(vault.size, 0);
});

test('a key expires after the time limit', async () => {
  const vault = new KeyVault(20);
  vault.put('run1', config);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(vault.take('run1'), null);
});

test('a dropped key is removed', () => {
  const vault = new KeyVault();
  vault.put('run1', config);
  vault.drop('run1');
  assert.equal(vault.take('run1'), null);
});

test('printing or serializing the vault never reveals a key', () => {
  const vault = new KeyVault();
  vault.put('run1', config);
  assert.ok(!JSON.stringify(vault).includes('super-secret'));
  assert.ok(!inspect(vault, { depth: 5 }).includes('super-secret'));
  assert.ok(!String(JSON.stringify({ vault })).includes('super-secret'));
});
