'use strict';

/**
 * Two small helpers behind the office switch and the knowledge import:
 *  - switching or starting over an office clears the renderer's saved state,
 *    and a switch that fails puts it back (the app keeps running on the
 *    current office, so its cards must not vanish);
 *  - raw system error codes become plain reasons for the owner.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

// A localStorage with the same shape the browser gives (length + key(i)).
const mem = new Map();
globalThis.window = {
  localStorage: {
    get length() { return mem.size; },
    key: (i) => [...mem.keys()][i] ?? null,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); }
  }
};

const { snapshotLocalState, restoreLocalState, clearLocalState } = loadTs('src/renderer/src/store/localState.ts');
const { plainReasonKey } = loadTs('src/renderer/src/store/plainReason.ts');

test('a failed switch gets the saved state back, and only the app\'s own keys are touched', () => {
  mem.clear();
  mem.set('cth.agents', '[{"id":"oscar"}]');
  mem.set('cth.selectedId', 'god');
  mem.set('someone.else', 'keep me');
  const snap = snapshotLocalState();
  clearLocalState();
  assert.deepEqual([...mem.keys()], ['someone.else'], 'clear leaves other keys alone');
  restoreLocalState(snap);
  assert.equal(mem.get('cth.agents'), '[{"id":"oscar"}]');
  assert.equal(mem.get('cth.selectedId'), 'god');
  assert.equal(mem.get('someone.else'), 'keep me');
});

test('raw system codes become plain reasons; the reader\'s own reasons pass through', () => {
  assert.equal(plainReasonKey(undefined), 'settings.memory.errUnknown');
  assert.equal(plainReasonKey("ENOENT: no such file or directory, open '/x.docx'"), 'settings.memory.errNotFound');
  assert.equal(plainReasonKey('EACCES: permission denied'), 'settings.memory.errNoPermission');
  assert.equal(plainReasonKey('EPERM: operation not permitted'), 'settings.memory.errNoPermission');
  assert.equal(plainReasonKey('EISDIR: illegal operation on a directory'), 'settings.memory.errIsFolder');
  assert.equal(plainReasonKey('This file has no text in it to read.'), null, 'already plain: shown as is');
  const en = require('../src/renderer/src/i18n/locales/en.json');
  for (const k of ['errUnknown', 'errNotFound', 'errNoPermission', 'errIsFolder']) assert.ok(en.settings.memory[k], k);
});
