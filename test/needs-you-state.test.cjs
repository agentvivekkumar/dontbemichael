'use strict';

/**
 * The right column (docs/designs/needs-you-empty-state.md, eng R1 and R5):
 * closed at launch so the office takes the window, the board on the owner's
 * click or once at launch when something waits, a person's panel when one is
 * picked. Focus mode is hidden in this build, so nothing opens it, not even a
 * saved preference. Run against the real store.
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

test('the right column: closed at launch, a person or a tab shows the panel, Ask me shows the board, close closes; focus mode stays shut', () => {
  // Value: protects=the right column shows nothing, the board or a person exactly as the owner asked; fails_when=select, openAgentMemory or requestCommandCenterTab set the wrong column, 'human' starts bumping a tab, the launch default reopens the board, or a SHOW_FOCUS_MODE guard goes; why_new=rewritten on rightColumn (eng R5), keeping every check of the needsYouOpen version; seam=none
  const r = runStore(`
    out.atLaunch = s().rightColumn;
    s().select('pam');
    out.afterSelect = s().rightColumn;
    s().requestCommandCenterTab('human');
    out.afterHuman = [s().rightColumn, s().ccTabRequest];
    s().requestCommandCenterTab('triggers');
    out.afterTab = [s().rightColumn, s().ccTabRequest];
    s().requestCommandCenterTab('human');
    s().openAgentMemory('pam');
    out.afterMemory = [s().rightColumn, s().selectedId, s().memoryFocusRequest];
    s().setRightColumn('closed');
    out.afterClose = s().rightColumn;
    s().openNeedsYou({ taskId: 't1' });
    out.afterOpen = [s().rightColumn, s().needsYouFocus];
    s().openNeedsYou();
    out.afterOpenAgain = s().needsYouFocus;
  `);
  assert.equal(r.atLaunch, 'closed', 'intended change: the office takes the window at launch (D1)');
  assert.equal(r.afterSelect, 'person', 'picking a person shows their panel');
  assert.deepEqual(r.afterHuman, ['board', null], 'Ask me opens the board and requests no tab');
  assert.deepEqual(r.afterTab, ['person', { tab: 'triggers', seq: 1 }], 'any other tab shows the panel');
  assert.deepEqual(r.afterMemory, ['person', 'god', { agentId: 'pam', seq: 2 }], 'a memory link opens Michael\'s panel');
  assert.equal(r.afterClose, 'closed', 'intended change: closing collapses the column, not back to the board (D6)');
  assert.deepEqual(r.afterOpen, ['board', { seq: 1, taskId: 't1' }], 'a for you chip opens the board at its ask (D11)');
  assert.deepEqual(r.afterOpenAgain, { seq: 2 }, 'each open asks for focus again (D10)');
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
