'use strict';

// Every literal t('a.b') key the renderer asks for must exist in en.json.
//
// i18next returns the KEY itself when a key is missing, so a typo or a key
// nobody added renders as raw text like "common.clear" on a button. The
// locale parity test in arabic-ui.test.cjs cannot catch that: it compares the
// locale files with each other, never with the code that reads them.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rendererDir = path.join(root, 'src/renderer/src');
const en = JSON.parse(fs.readFileSync(path.join(rendererDir, 'i18n/locales/en.json'), 'utf8'));

function has(key) {
  let node = en;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object' || !(part in node)) return false;
    node = node[part];
  }
  return true;
}
// Plural keys live as key_one / key_other.
const exists = (key) => has(key) || has(`${key}_one`) || has(`${key}_other`);

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

test('every literal t() key in the renderer exists in en.json', () => {
  const missing = [];
  let seen = 0;
  for (const file of sources(rendererDir)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([A-Za-z]\w*(?:\.\w+)+)'/g)) {
      seen++;
      if (!exists(m[1])) missing.push(`${path.relative(root, file)}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, [], 'these keys would render as raw key text');
  assert.ok(seen > 500, `sanity: only ${seen} t() calls found`);
});
