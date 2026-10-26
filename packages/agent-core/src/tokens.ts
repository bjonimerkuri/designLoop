import { PNG } from 'pngjs';
import type { DesignTokens } from './types';

const hex = (value: number) => value.toString(16).padStart(2, '0');

export function extractTokens(png: Buffer, count = 8): DesignTokens {
  const image = PNG.sync.read(png);
  const total = image.width * image.height;
  const stride = Math.max(1, Math.floor(total / 200000));
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let pixel = 0; pixel < total; pixel += stride) {
    const i = pixel * 4;
    if (image.data[i + 3] < 128) continue;
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }
  const palette = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((bucket) => `#${hex(Math.round(bucket.r / bucket.n))}${hex(Math.round(bucket.g / bucket.n))}${hex(Math.round(bucket.b / bucket.n))}`);
  return { palette, background: palette[0] ?? '#ffffff' };
}
