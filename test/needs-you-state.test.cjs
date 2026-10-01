'use strict';

/**
 * The right column's Needs you board (branding/DESIGN.md 7.6): open on launch,
 * closed by picking a person or opening one of Michael's tabs, and opened by
 * the old Ask me tab request. Focus mode is hidden in this build, so nothing
 * opens it, not even a saved preference. Run against the real store.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function runStore(body) {
  const script = `
    const mem = {
      'cth.agents': JSON.stringify([{ id: 'god', name: 'Michael', isGod: true, ptyId: 'p0' }, { id: 'pam', name: 'Pam', ptyId: 'p1' }]),
      'cth.selectedId': 'pam',
      'cth.prefersFocusMode': '1'
    };
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    globalThis.window = { localStorage: storage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    globalThis.localStorage = storage;
    const store = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))})('src/renderer/src/store/store.ts').useStore;
    const s = () => store.getState();
    const out = {};
    ${body}
    process.stdout.write(JSON.stringify(out));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }));
}

test('Needs you opens on launch, closes for a person or a tab, the Ask me request opens it; focus mode stays shut', () => {
  // Value: protects=the right column shows the board or a person exactly as the owner asked; fails_when=select, openAgentMemory or requestCommandCenterTab stop setting needsYouOpen, or 'human' starts bumping a tab that no longer exists, or a SHOW_FOCUS_MODE guard goes; why_new=the store was only regex-pinned (michael-tabs, hidden-surfaces); seam=none
  const r = runStore(`
    out.atLaunch = s().needsYouOpen;
    s().select('pam');
    out.afterSelect = s().needsYouOpen;
    s().requestCommandCenterTab('human');
    out.afterHuman = [s().needsYouOpen, s().ccTabRequest];
    s().requestCommandCenterTab('triggers');
    out.afterTab = [s().needsYouOpen, s().ccTabRequest];
    s().requestCommandCenterTab('human');
    s().openAgentMemory('pam');
    out.afterMemory = [s().needsYouOpen, s().selectedId, s().memoryFocusRequest];
    s().setNeedsYouOpen(true);
    out.afterSet = s().needsYouOpen;
  `);
  assert.equal(r.atLaunch, true, 'the board is the default right column');
  assert.equal(r.afterSelect, false, 'picking a person shows their panel');
  assert.deepEqual(r.afterHuman, [true, null], 'Ask me opens the board and requests no tab');
  assert.deepEqual(r.afterTab, [false, { tab: 'triggers', seq: 1 }], 'any other tab closes the board');
  assert.deepEqual(r.afterMemory, [false, 'god', { agentId: 'pam', seq: 2 }], 'a memory link opens Michael\'s panel');
  assert.equal(r.afterSet, true);
  // Focus mode stays shut in this build, even with a saved preference.
  const f = runStore(`
    out.atLaunch = s().fullscreenAgentId;
    s().setFullscreen('pam');
    out.afterSet = s().fullscreenAgentId;
    s().restoreFocusMode();
    out.afterRestore = s().fullscreenAgentId;
    s().setFullscreen(null);
    out.afterClear = s().fullscreenAgentId;
  `);
  assert.deepEqual([f.atLaunch, f.afterSet, f.afterRestore, f.afterClear], [null, null, null, null], 'focus mode never opens');
});

/**
 * Review, 2026-10-01: the pty parser calls updateAgent on every chunk of
 * output, mostly with what is already there; each call made a new agents
 * array and re-rendered the whole studio.
 */
test('updateAgent with nothing new keeps the same state; a real change still lands', () => {
  // Value: protects=idle CPU while agents stream output; fails_when=updateAgent rebuilds agents for an unchanged patch; why_new=no test ran updateAgent; seam=none
  const r = runStore(`
    const before = s().agents;
    s().updateAgent('pam', { name: 'Pam' });
    out.sameAfterNoop = s().agents === before;
    s().updateAgent('nobody', { name: 'X' });
    out.sameAfterUnknown = s().agents === before;
    s().updateAgent('pam', { action: 'Sorting mail' });
    out.changed = s().agents !== before && s().agents.find((a) => a.id === 'pam').action === 'Sorting mail';
  `);
  assert.deepEqual(r, { sameAfterNoop: true, sameAfterUnknown: true, changed: true });
});
