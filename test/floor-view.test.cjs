'use strict';

/**
 * The floor area toggles between the animated office and the full task board
 * (owner, 2026-09-24): the quickest read of who is doing what, what is blocked
 * and what is done. The choice is remembered on this Mac, the office pauses
 * while the board covers it, and the office whiteboard opens the board.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test('the office shows by default, and the choice is remembered', () => {
  // freshRun (below) loads the store in its own process, so it really starts
  // from this saved state rather than a module cached by an earlier test.
  const r = freshRun({}, `
    const first = store.getState().floorView;
    store.getState().setFloorView('tasks');
    return { first, now: store.getState().floorView, saved: mem['cth.floorView'] };`);
  assert.deepEqual(r, { first: 'office', now: 'tasks', saved: 'tasks' });
});

test('the toggle sits in the floor\'s bottom left corner, over the board, which leaves it room', () => {
  const app = read('src/renderer/src/App.tsx');
  const office = app.indexOf('<OfficeFloor />');
  const board = app.indexOf("{floorView !== 'office' && (");
  const toggle = app.indexOf('<FloorViewToggle />');
  assert.ok(office > 0 && board > office && toggle > board, 'office, then the board over it, then the toggle over both');
  assert.match(app.slice(board, board + 700), /position: 'absolute', inset: 0, zIndex: 50,[\s\S]*paddingBottom: 52,[\s\S]*\{floorView === 'tasks' && <TasksKanban \/>\}/);
  assert.match(app.slice(toggle - 200, toggle), /position: 'absolute', left: 12, bottom: 12, zIndex: 60/);
  // No header strip above the floor any more.
  assert.doesNotMatch(app, /flexDirection: 'column', gap: 8 \}\}>\s*\{\/\* OFFICE \| TASKS/);
});

test('the office pauses while the board covers it, and its whiteboard opens the board', () => {
  const floor = read('src/renderer/src/scene/office/OfficeFloor.tsx');
  assert.match(floor, /const paused = !!fullscreenAgentId \|\| ideOpen \|\| docHidden \|\| floorView !== 'office';/);
  const board = floor.indexOf("boardG.on('pointertap'");
  assert.match(floor.slice(board, board + 300), /setFloorView\('tasks'\)/);
});

test('the toggle counts blocked cards so trouble shows on the office view too', () => {
  const src = read('src/renderer/src/components/FloorViewToggle.tsx');
  assert.match(src, /parseTasks\(raw\)\.filter\(\(x\) => x\.status === 'blocked'\)\.length/);
  assert.match(src, /option\('tasks', 'check', t\('floorView\.tasks'\), blocked\)/);
});

/**
 * GRAPH moved from Michael's panel to the floor too (owner, 2026-09-24): who
 * talks to whom and what they remember needs the room. Clicking an agent in it
 * still opens that agent's memory on Michael's Memory tab.
 */
/** Load the store in its own process, so it really starts from `saved`
 *  (the module cache would otherwise hand every test the first load). */
function freshRun(saved, body) {
  const { execFileSync } = require('node:child_process');
  const script = `
    const mem = ${JSON.stringify(saved)};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    globalThis.window = { localStorage: storage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    globalThis.localStorage = storage;
    const store = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))})('src/renderer/src/store/store.ts').useStore;
    const out = (() => { ${body} })();
    process.stdout.write(JSON.stringify(out));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }));
}

test('the floor has a GRAPH view, remembered like the others', () => {
  const r = freshRun({ 'cth.floorView': 'graph' }, `
    const first = store.getState().floorView;
    store.getState().setFloorView('office');
    return { first, saved: mem['cth.floorView'] };`);
  assert.deepEqual(r, { first: 'graph', saved: 'office' });
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /\{floorView === 'graph' && \(\s*<MemoryGraphPanel godId=\{godId\} onJumpToMemory=\{\(id\) => useStore\.getState\(\)\.openAgentMemory\(id\)\} \/>/);
  assert.match(read('src/renderer/src/components/FloorViewToggle.tsx'), /option\('graph', 'web', t\('floorView\.graph'\)\)/);
});

test('clicking an agent in the graph opens its memory on Michael\'s panel', () => {
  const r = freshRun({ 'cth.agents': JSON.stringify([{ id: 'god', name: 'Michael', isGod: true }, { id: 'oscar', name: 'Oscar' }]) }, `
    store.getState().select('oscar');
    store.getState().openAgentMemory('oscar');
    const st = store.getState();
    return { selected: st.selectedId, tab: st.ccTabRequest.tab, focus: st.memoryFocusRequest.agentId };`);
  assert.deepEqual(r, { selected: 'god', tab: 'memory', focus: 'oscar' });
  const cc = read('src/renderer/src/components/CommandCenterPanel.tsx');
  assert.match(cc, /if \(memoryFocusRequest\) setSelectedMemoryAgent\(memoryFocusRequest\.agentId\);/);
  assert.doesNotMatch(cc, /MemoryGraphPanel|key: 'graph'/);
});

test('TASKS and GRAPH open with a plain line on what they are', () => {
  const app = read('src/renderer/src/App.tsx');
  const board = app.indexOf("{floorView !== 'office' && (");
  assert.match(app.slice(board, board + 900), /<FloorViewIntro view=\{floorView\} \/>\s*\{floorView === 'tasks' && <TasksKanban \/>\}/);
  for (const l of ['en', 'zh-CN', 'ar']) {
    const j = JSON.parse(read(`src/renderer/src/i18n/locales/${l}.json`));
    for (const k of ['tasksIntroTitle', 'tasksIntro', 'graphIntroTitle', 'graphIntro']) assert.ok(j.floorView[k], `${l} ${k}`);
    // The intro names the board's own columns, so they must match.
    const cols = [j.kanban.colBlocked, j.kanban.colDone].map((c) => c.toLowerCase());
    for (const c of cols) assert.ok(j.floorView.tasksIntro.toLowerCase().includes(c), `${l} intro names "${c}"`);
  }
});
