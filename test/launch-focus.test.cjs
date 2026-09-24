'use strict';

/**
 * Every launch opens on Michael (owner, 2026-09-24). It used to open on the
 * last agent to start: each start took the focus, and that selection was saved
 * and restored on the next launch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

// The store reads its saved roster from localStorage when it loads.
const saved = {
  'cth.agents': JSON.stringify([
    { id: 'oscar', name: 'Oscar' },
    { id: 'god', name: 'Michael', isGod: true },
    { id: 'pam', name: 'Pam' }
  ]),
  'cth.selectedId': 'pam' // last session ended on Pam, the last to start
};
const storage = {
  getItem: (k) => saved[k] ?? null,
  setItem: (k, v) => { saved[k] = String(v); },
  removeItem: (k) => { delete saved[k]; }
};
globalThis.window = { localStorage: storage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
globalThis.localStorage = storage;

const { useStore } = loadTs('src/renderer/src/store/store.ts');
const card = (id, extra = {}) => ({
  id, name: id, character: 'jim', accent: 'mint', description: '', project: '', tmuxTarget: '',
  cwd: '/tmp', status: 'idle', action: '', progress: 0, currentStation: 'desk', ...extra
});

test('a launch opens on Michael, not on the agent that was last selected', () => {
  assert.equal(useStore.getState().selectedId, 'god');
});

test('agents the app starts on its own leave the focus on Michael', () => {
  useStore.getState().addAgent(card('kelly'), { select: false });
  useStore.getState().addAgent(card('ryan'), { select: false });
  assert.equal(useStore.getState().selectedId, 'god');
  assert.equal(saved['cth.selectedId'], 'god', 'and that is what gets saved');
  assert.ok(useStore.getState().agents.some((a) => a.id === 'ryan'), 'the cards still appear');
});

test('an agent the owner just added still opens', () => {
  useStore.getState().addAgent(card('dwight'));
  assert.equal(useStore.getState().selectedId, 'dwight');
});

test('the launch paths that start agents all pass select: false', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
  assert.match(read('src/renderer/src/hooks/useRestoreTeam.ts'), /addAgent\(restoredAgent, \{ select: false \}\)/);
  assert.match(read('src/renderer/src/hooks/useHive.ts'), /character: castName\(def\.character\),[\s\S]{0,600}\}, \{ select: false \}\);/);
});
