'use strict';

/**
 * The store's side of what this build hides and where launch lands, run for
 * real rather than read from source. hidden-surfaces.test.cjs and
 * floor-view.test.cjs pin the source text; these load the store from a given
 * saved state and check what an owner actually gets:
 *
 *  - a GIT tab or a stray floor view saved by an older build opens on
 *    something that exists;
 *  - nothing can open the hidden IDE, whichever caller asks;
 *  - a leftover organisation key does not bring back the History tab;
 *  - a roster with no Michael (an old install mid-restore) still opens on the
 *    saved agent, and "open this agent's memory" does not blank the selection.
 *
 * Each case runs in its own process: load-ts caches the store module, and its
 * initial state is computed once, at load, from localStorage.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function freshRun(saved, body) {
  const script = `
    const mem = ${JSON.stringify(saved)};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    globalThis.window = { localStorage: storage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    globalThis.localStorage = storage;
    const mod = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))})('src/renderer/src/store/store.ts');
    const store = mod.useStore;
    const out = (() => { ${body} })();
    process.stdout.write(JSON.stringify(out));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }));
}

test('views an older build saved open on ones this build has', () => {
  const r = freshRun({ 'cth.sidebarTab': 'git', 'cth.floorView': 'workers' }, `
    const s = store.getState();
    return { tab: s.sidebarTab, floor: s.floorView };`);
  assert.deepEqual(r, { tab: 'terminal', floor: 'office' });
});

test('nothing opens the hidden IDE, and an org key alone does not bring back History', () => {
  const r = freshRun({ 'cth.agents': JSON.stringify([{ id: 'god', name: 'Michael', isGod: true, cwd: '/tmp/o' }]) }, `
    const s = store.getState();
    s.setIdeOpen(true, 'god');
    const afterOpen = { open: store.getState().ideOpen, agent: store.getState().ideAgentId };
    store.getState().openFileInIde('/tmp/o/menu.md');
    const afterFile = { open: store.getState().ideOpen, file: store.getState().ideInitialFile };
    const st = store.getState();
    const orgOnly = mod.triggerHistoryVisible({ ...st, webhookTriggers: [], orgTrigger: { ...st.orgTrigger, apiKey: 'org-key' } });
    const withHook = mod.triggerHistoryVisible({ ...st, webhookTriggers: [{ id: 'w1' }] });
    return { afterOpen, afterFile, orgOnly, withHook };`);
  assert.deepEqual(r.afterOpen, { open: false, agent: null });
  assert.deepEqual(r.afterFile, { open: false, file: null });
  assert.equal(r.orgOnly, false);
  assert.equal(r.withHook, true, 'webhooks still show their history');
});

test('with no Michael on the roster, launch keeps the saved agent and a memory jump keeps it too', () => {
  const r = freshRun({
    'cth.agents': JSON.stringify([{ id: 'oscar', name: 'Oscar' }, { id: 'pam', name: 'Pam' }]),
    'cth.selectedId': 'pam'
  }, `
    const first = store.getState().selectedId;
    store.getState().openAgentMemory('oscar');
    const s = store.getState();
    return { first, after: s.selectedId, tab: s.ccTabRequest.tab, focus: s.memoryFocusRequest.agentId };`);
  assert.deepEqual(r, { first: 'pam', after: 'pam', tab: 'memory', focus: 'oscar' });
});

test('selecting another agent drops a pending "open this agent\'s memory" jump', () => {
  // Otherwise Michael's Memory tab reopened on an agent picked from the graph
  // long ago, every time his panel remounted.
  const r = freshRun({ 'cth.agents': JSON.stringify([{ id: 'god', name: 'Michael', isGod: true }, { id: 'oscar', name: 'Oscar' }]) }, `
    store.getState().openAgentMemory('oscar');
    const before = store.getState().memoryFocusRequest && store.getState().memoryFocusRequest.agentId;
    store.getState().select('oscar');
    return { before, after: store.getState().memoryFocusRequest };`);
  assert.deepEqual(r, { before: 'oscar', after: null });
});
