import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { extractTokens } from './tokens';

function split(width: number, height: number, redColumns: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const red = x < redColumns;
      png.data[i] = red ? 255 : 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = red ? 0 : 255;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test('extractTokens returns the dominant colors, most common first', () => {
  const tokens = extractTokens(split(100, 50, 60));
  assert.equal(tokens.palette[0], '#ff0000');
  assert.ok(tokens.palette.includes('#0000ff'));
  assert.equal(tokens.background, '#ff0000');
});

test('extractTokens ignores transparent pixels', () => {
  const png = new PNG({ width: 10, height: 10 });
  assert.deepEqual(extractTokens(PNG.sync.write(png)), { palette: [], background: '#ffffff' });
});
