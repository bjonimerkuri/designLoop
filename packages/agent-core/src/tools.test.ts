import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { compareImages } from './tools';

function image(width: number, height: number, paint: (x: number, y: number) => number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = paint(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = value;
      png.data[i + 1] = value;
      png.data[i + 2] = value;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test('identical images are fully similar and have no mismatch regions', () => {
  const white = image(60, 60, () => 255);
  const result = compareImages(white, white);
  assert.equal(result.similarity, 1);
  assert.deepEqual(result.regions, []);
});

test('completely different images have no similarity', () => {
  const result = compareImages(image(60, 60, () => 255), image(60, 60, () => 0));
  assert.equal(result.similarity, 0);
  assert.equal(result.regions.length, 3);
});

test('a difference on the left edge is reported on the left side', () => {
  const design = image(90, 90, () => 255);
  const render = image(90, 90, (x) => (x < 30 ? 0 : 255));
  const result = compareImages(design, render);
  assert.ok(result.similarity > 0.6 && result.similarity < 0.7);
  assert.equal(result.regions.length, 3);
  assert.ok(result.regions.every((region) => region.includes('left')));
});

test('different sizes are rejected', () => {
  assert.throws(() => compareImages(image(60, 60, () => 255), image(50, 60, () => 255)), /does not match/);
});
