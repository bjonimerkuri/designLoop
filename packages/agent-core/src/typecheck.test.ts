import assert from 'node:assert/strict';
import { test } from 'node:test';
import { typecheckComponent } from './typecheck';

test('typecheckComponent reports type errors with a position', () => {
  const result = typecheckComponent({ tsx: "const value: number = 'text';\nexport default value;", css: '' }, 'react');
  assert.equal(result.available, true);
  assert.ok(result.errors.length > 0);
  assert.match(result.errors[0], /^1:\d+ TS2322/);
});

test('typecheckComponent accepts valid code', () => {
  const result = typecheckComponent({ tsx: 'const value: number = 1;\nexport default value;', css: '' }, 'react-tailwind');
  assert.deepEqual(result, { available: true, errors: [] });
});

test('typecheckComponent can be switched off', () => {
  process.env.TYPECHECK = 'off';
  try {
    assert.deepEqual(typecheckComponent({ tsx: 'const a: number = "x";', css: '' }, 'react'), {
      available: false,
      errors: []
    });
  } finally {
    delete process.env.TYPECHECK;
  }
});
