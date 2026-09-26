'use strict';
/**
 * The fresh-start note is a stacked note (docs/designs/cleared-banner.md,
 * owner 2026-09-25): short copy, the sentence above a button row, Hide per
 * clear, and a visible working and failed state for Bring back.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const src = read('src/renderer/src/components/ClearedBanner.tsx');

test('stacked: the sentence, then a row with the standard button and Hide', () => {
  assert.match(src, /flexDirection: 'column', gap: 8/);
  assert.match(src, /<PixelButton variant="secondary" size="sm" onClick=\{bringBack\} disabled=\{busy\}>/);
  assert.doesNotMatch(src, /padding: '3px 10px 1px'/, 'no hand-styled button');
  assert.match(src, /role="status"/);
});

test('hiding lasts until the next fresh start', () => {
  assert.match(src, /hiddenAt\(agentId\) !== s\.at/);
  assert.match(src, /localStorage\.setItem\(hiddenKey\(agentId\), String\(cleared\.at\)\)/);
});

test('a failed restore says so and keeps the button for a retry', () => {
  assert.match(src, /if \(r\.ok\) setCleared\(null\);\s*else setFailed\(true\);/);
  assert.match(src, /catch \{\s*setFailed\(true\);/);
  assert.match(src, /failed \? `! \$\{t\('clearedBanner\.restoreFailed'\)\}`/);
  assert.match(src, /busy \? t\('clearedBanner\.bringingBack'\)/);
});

test('short copy in every language, no dashes', () => {
  assert.equal(JSON.parse(read('src/renderer/src/i18n/locales/en.json')).clearedBanner.text, '{{name}} got a fresh start {{ago}}. Nothing was lost.');
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).clearedBanner;
    for (const k of ['text', 'bringBack', 'bringingBack', 'restoreFailed', 'hide']) assert.ok(d[k], `${loc} ${k}`);
    assert.doesNotMatch(JSON.stringify(d), /[–—]/, loc);
  }
});
