import type { Framework, GeneratedCode } from './types';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const REACT_IMPORTS = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'];

const ALLOWED_IMPORTS: Record<Framework, string[]> = {
  react: REACT_IMPORTS,
  'react-tailwind': REACT_IMPORTS,
  angular: ['@angular/core', '@angular/common']
};

const IMPORT_PATTERN =
  /(?:import\s+(?:[^'"]*?\s+from\s+)?|import\(\s*|require\(\s*|export\s+[^'"]*?\s+from\s+)['"]([^'"]+)['"]/g;

const FORBIDDEN_APIS: [RegExp, string][] = [
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
  [/\.(?:inner|outer)HTML\b/, 'innerHTML'],
  [/\bdocument\.write/, 'document.write'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bimportScripts\b/, 'importScripts'],
  [/\b(?:localStorage|sessionStorage|indexedDB)\b/, 'browser storage'],
  [/\bbypassSecurityTrust\w*/, 'bypassSecurityTrust'],
  [/\bwindow\.open\b/, 'window.open'],
  [/\b(?:window|document)\.location\b/, 'location']
];

export type ImageKind = 'png' | 'jpeg';

export function detectImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readJpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = buf.readUInt16BE(i + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  return null;
}

export function readImageSize(buf: Buffer): { kind: ImageKind; width: number; height: number } | null {
  const kind = detectImage(buf);
  if (kind === 'png') {
    const size = readPngSize(buf);
    return size ? { kind, ...size } : null;
  }
  if (kind === 'jpeg') {
    const size = readJpegSize(buf);
    return size ? { kind, ...size } : null;
  }
  return null;
}

export function parseCode(text: string, framework: Framework): GeneratedCode | null {
  if (framework === 'angular') {
    const ts = /```(?:ts|typescript|tsx)\s*\n([\s\S]*?)```/.exec(text)?.[1];
    return ts ? { tsx: ts.trim(), css: '' } : null;
  }
  const tsx = /```(?:tsx|typescript|ts|jsx)\s*\n([\s\S]*?)```/.exec(text)?.[1];
  if (!tsx) return null;
  if (framework === 'react-tailwind') return { tsx: tsx.trim(), css: '' };
  const css = /```css\s*\n([\s\S]*?)```/.exec(text)?.[1];
  if (!css) return null;
  return { tsx: tsx.trim(), css: css.trim() };
}

export function validateCode(code: GeneratedCode, framework: Framework): string | null {
  const allowed = new Set(ALLOWED_IMPORTS[framework]);
  for (const match of code.tsx.matchAll(IMPORT_PATTERN)) {
    if (!allowed.has(match[1])) {
      return `Import "${match[1]}" is not allowed. Import only from ${ALLOWED_IMPORTS[framework].map((name) => `"${name}"`).join(', ')}.`;
    }
  }
  for (const [pattern, name] of FORBIDDEN_APIS) {
    if (pattern.test(code.tsx)) return `The code uses ${name}, which is not allowed in components.`;
  }
  if (framework === 'angular') {
    if (!/export\s+class\s+AppComponent\b/.test(code.tsx)) return 'Export a class named AppComponent.';
    if (!/selector\s*:\s*['"`]app-root['"`]/.test(code.tsx)) return 'The component selector must be "app-root".';
  }
  const styles = `${code.tsx}\n${code.css}`;
  if (/@import/i.test(styles)) return 'CSS @import is not allowed.';
  if (/url\(\s*(?!\s|['"]?(?:data:|#))/i.test(styles)) return 'Use only data: URIs inside CSS url().';
  return null;
}
