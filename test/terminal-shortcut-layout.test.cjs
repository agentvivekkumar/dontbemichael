'use strict';

// Ctrl+C on selected terminal text copies it on every keyboard layout. On a
// Russian, Arabic, Greek or Hebrew layout `key` is not 'c', so the copy was
// skipped and xterm sent the agent an interrupt instead.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { shortcutLetter } = loadTs('src/renderer/src/components/shortcutLetter.ts');

test('a shortcut on a non-Latin layout is read from the physical key', () => {
  // Value: protects=Ctrl+C copies a selection and Ctrl+Shift+V pastes on any layout; fails_when=a non-Latin layout's letter is compared with 'c' or 'v'; why_new=bug fix; seam=none; no_claim=xterm's own key mapping
  for (const [layout, key] of [['Russian', 'с'], ['Arabic', 'ؤ'], ['Greek', 'ψ'], ['Hebrew', 'ב'], ['Russian with Shift', 'С']]) {
    assert.equal(shortcutLetter({ key, code: 'KeyC' }), 'c', layout);
  }
  assert.equal(shortcutLetter({ key: 'М', code: 'KeyV' }), 'v', 'Ctrl+Shift+V on a Russian layout');
});

test('a Latin layout keeps its own letter', () => {
  // Value: protects=US, Dvorak and AZERTY owners keep the shortcuts they know; fails_when=the physical key wins over a Latin letter; why_new=bug fix; seam=none; no_claim=none
  assert.equal(shortcutLetter({ key: 'c', code: 'KeyC' }), 'c', 'US');
  assert.equal(shortcutLetter({ key: 'C', code: 'KeyC' }), 'c', 'US with Shift');
  assert.equal(shortcutLetter({ key: 'c', code: 'KeyI' }), 'c', 'Dvorak C sits on the I key');
  assert.equal(shortcutLetter({ key: 'j', code: 'KeyC' }), 'j', 'Dvorak J sits on the C key and is not a copy');
  assert.equal(shortcutLetter({ key: 'Enter', code: 'Enter' }), 'enter', 'a key that is not a letter stays as it is');
  assert.equal(shortcutLetter({ key: 'с' }), 'с', 'no code: nothing to fall back on');
});

test('the terminal reads its copy and paste letter through shortcutLetter', () => {
  // Value: protects=the wiring of the helper into the terminal's key handler; fails_when=the handler goes back to ev.key; why_new=bug fix; seam=none; no_claim=none
  const src = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/terminalPool.ts'), 'utf8');
  assert.match(src, /attachCustomKeyEventHandler\(\(ev\) => \{\n\s+const key = shortcutLetter\(ev\);/);
  assert.doesNotMatch(src, /ev\.key\.toLowerCase\(\)/);
});
