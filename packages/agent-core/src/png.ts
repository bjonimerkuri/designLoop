import { decode } from 'jpeg-js';
import { PNG } from 'pngjs';
import { detectImage } from './code';

export function sanitizeImage(input: Buffer): Buffer {
  const kind = detectImage(input);
  if (kind === 'png') return PNG.sync.write(PNG.sync.read(input));
  if (kind === 'jpeg') {
    const image = decode(input, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 8, maxMemoryUsageInMB: 256 });
    const png = new PNG({ width: image.width, height: image.height });
    Buffer.from(image.data).copy(png.data);
    return PNG.sync.write(png);
  }
  throw new Error('Unsupported image type');
}
