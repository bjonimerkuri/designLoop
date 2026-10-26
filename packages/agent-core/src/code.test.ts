import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectImage, parseCode, readImageSize, readPngSize, validateCode } from './code';

const reactCode = { tsx: "import { useState } from 'react';\nexport default function A() { return null; }", css: '.a{color:red}' };
const angularCode = {
  tsx: "import { Component } from '@angular/core';\n@Component({ selector: 'app-root', standalone: true, template: '<p>hi</p>' })\nexport class AppComponent {}",
  css: ''
};

test('parseCode reads tsx and css blocks for react', () => {
  const text = 'x\n```tsx\nconst a = 1;\n```\n```css\n.a{}\n```';
  assert.deepEqual(parseCode(text, 'react'), { tsx: 'const a = 1;', css: '.a{}' });
});

test('parseCode returns null when a block is missing', () => {
  assert.equal(parseCode('```tsx\nconst a = 1;\n```', 'react'), null);
  assert.equal(parseCode('no code here', 'angular'), null);
});

test('parseCode reads a single ts block for angular', () => {
  assert.deepEqual(parseCode('```ts\nexport class AppComponent {}\n```', 'angular'), {
    tsx: 'export class AppComponent {}',
    css: ''
  });
});

test('validateCode accepts allowed code', () => {
  assert.equal(validateCode(reactCode, 'react'), null);
  assert.equal(validateCode(angularCode, 'angular'), null);
});

test('validateCode rejects imports outside the allow list', () => {
  const bad = { tsx: "import fs from 'fs';\nexport default function A() { return null; }", css: '' };
  assert.match(validateCode(bad, 'react') ?? '', /not allowed/);
  const dynamic = { tsx: "const x = await import('lodash');", css: '' };
  assert.match(validateCode(dynamic, 'react') ?? '', /not allowed/);
  const required = { tsx: "const x = require('child_process');", css: '' };
  assert.match(validateCode(required, 'react') ?? '', /not allowed/);
});

test('validateCode rejects remote css', () => {
  assert.match(validateCode({ ...reactCode, css: "@import url('https://x.test/a.css');" }, 'react') ?? '', /@import/);
  assert.match(validateCode({ ...reactCode, css: '.a{background:url(https://x.test/a.png)}' }, 'react') ?? '', /data:/);
  assert.match(validateCode({ ...reactCode, css: '.a{background:url( /etc/passwd )}' }, 'react') ?? '', /data:/);
  assert.equal(validateCode({ ...reactCode, css: '.a{fill:url(#grad)}' }, 'react'), null);
  assert.equal(validateCode({ ...reactCode, css: '.a{background:url(data:image/png;base64,AAAA)}' }, 'react'), null);
});

test('validateCode checks angular component shape', () => {
  assert.match(validateCode({ tsx: angularCode.tsx.replace('AppComponent', 'Other'), css: '' }, 'angular') ?? '', /AppComponent/);
  assert.match(validateCode({ tsx: angularCode.tsx.replace('app-root', 'x-y'), css: '' }, 'angular') ?? '', /app-root/);
});

test('readPngSize reads dimensions and rejects other data', () => {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(320, 16);
  header.writeUInt32BE(200, 20);
  assert.deepEqual(readPngSize(header), { width: 320, height: 200 });
  assert.equal(readPngSize(Buffer.from('not a png at all, not a png at all')), null);
});

test('parseCode reads a single tsx block for react-tailwind', () => {
  assert.deepEqual(parseCode('```tsx\nexport default function A() { return null; }\n```', 'react-tailwind'), {
    tsx: 'export default function A() { return null; }',
    css: ''
  });
});

test('validateCode applies the react import list to react-tailwind', () => {
  assert.equal(validateCode({ tsx: "import { useState } from 'react';", css: '' }, 'react-tailwind'), null);
  assert.match(validateCode({ tsx: "import x from 'tailwindcss';", css: '' }, 'react-tailwind') ?? '', /not allowed/);
});

test('detectImage and readImageSize recognise png and jpeg', () => {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.equal(detectImage(png), 'png');
  assert.deepEqual(readImageSize(png), { kind: 'png', width: 640, height: 480 });

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  assert.equal(detectImage(jpeg), 'jpeg');
  assert.deepEqual(readImageSize(jpeg), { kind: 'jpeg', width: 300, height: 200 });

  assert.equal(detectImage(Buffer.from('GIF89a......')), null);
  assert.equal(readImageSize(Buffer.from('plain text here, definitely not an image')), null);
});

test('validateCode rejects APIs that a component should never use', () => {
  const cases: [string, string][] = [
    ['const x = eval("1");', 'eval'],
    ['const f = new Function("return 1");', 'new Function'],
    ['export default () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;', 'dangerouslySetInnerHTML'],
    ['document.body.innerHTML = "x";', 'innerHTML'],
    ['fetch("/api");', 'fetch'],
    ['new WebSocket("ws://x");', 'WebSocket'],
    ['localStorage.setItem("a", "b");', 'browser storage'],
    ['window.open("https://x.test");', 'window.open'],
    ['document.location = "https://x.test";', 'location']
  ];
  for (const [tsx, name] of cases) {
    assert.match(validateCode({ tsx, css: '' }, 'react') ?? '', new RegExp(name.replace('.', '\\.')), tsx);
  }
  assert.match(validateCode({ tsx: 'this.sanitizer.bypassSecurityTrustHtml(x);', css: '' }, 'angular') ?? '', /bypassSecurityTrust/);
});

test('validateCode does not flag ordinary words', () => {
  const tsx = "const label = 'Fetch your data';\nconst location = 'Tirana';\nexport default function A() { return <p>{label} {location}</p>; }";
  assert.equal(validateCode({ tsx, css: '' }, 'react'), null);
});
