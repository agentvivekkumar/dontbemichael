'use strict';

/**
 * The Waiting column (owner, 2026-10-03: "i see two tasks in doing section, one
 * for Oscar and one for Kelly. But they are not working on anything."). Doing
 * held both work in progress and work held on a customer or a teammate. A card
 * held on someone now sits in Waiting, with who it waits on; Doing means
 * someone is working on it now. Michael sets Waiting, as he does Blocked.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('a waiting card keeps its status and who it waits on through the parse', () => {
  const { parseTasks } = loadTs('src/renderer/src/components/hiveTasks.ts');
  const [a, b, c] = parseTasks({ tasks: [
    { id: 'k1', title: 'Salesforce setup', status: 'waiting', waitingOn: ' customer Gopi ', assignee: 'kelly' },
    { id: 'o1', title: 'Summary', status: 'waiting' },
    { id: 'x1', title: 'Odd', status: 'parked' }
  ] });
  assert.equal(a.status, 'waiting');
  assert.equal(a.waitingOn, 'customer Gopi');
  assert.equal(b.status, 'waiting');
  assert.equal(b.waitingOn, undefined);
  assert.equal(c.status, 'todo', 'an unknown status still falls back to To do');
});

test('the board has a Waiting column between Doing and Blocked, and each card says who', () => {
  const kanban = read('src/renderer/src/components/TasksKanban.tsx');
  const keys = [...kanban.matchAll(/\{ key: '([a-z]+)',\s+labelKey: 'kanban\.col/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['todo', 'doing', 'waiting', 'blocked', 'done']);
  // Yellow (owner, 2026-10-03).
  assert.match(kanban, /key: 'waiting', labelKey: 'kanban\.colWaiting', accent: 'var\(--cth-amber\)',\s+soft: 'var\(--cth-amber-soft\)',\s+text: 'var\(--cth-amber-text\)'/);
  assert.match(kanban, /task\.waitingOn \? t\('kanban\.waitingOn', \{ who: task\.waitingOn \}\) : t\('kanban\.waitingOnUnknown'\)/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const k = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).kanban;
    for (const key of ['colWaiting', 'waitingOn', 'waitingOnUnknown', 'waitingOnTitle']) assert.ok(k[key], `${loc} ${key}`);
    assert.match(k.waitingOn, /\{\{who\}\}/, loc);
  }
  assert.equal(JSON.parse(read('src/renderer/src/i18n/locales/en.json')).kanban.waitingOn, 'Waiting on {{who}}');
});

test('Michael is told: waiting names who, doing means working now, and back to doing on the answer', () => {
  const hive = read('src/main/hive.ts');
  assert.match(hive, /status: 'todo' \| 'doing' \| 'waiting' \| 'blocked' \| 'done';\n\s+\/\*\* Who a Waiting card waits on/);
  const rules = hive.match(/is "waiting", with "waitingOn" naming who in a few words/g) || [];
  assert.equal(rules.length, 2, 'both the house rules and Michael\'s own instructions say it');
  assert.doesNotMatch(hive, /waiting on someone outside the office[^.]*is "doing"/);
  assert.match(hive, /"doing" means someone is working on it now\./);
  assert.match(hive, /todo \/ doing \/ waiting \/ blocked \/ done/);
  assert.match(read('src/shared/ownerRequests.ts'), /move it to "waiting" and name who in "waitingOn"/);
});

test('a waiting card is nobody\'s work right now: not Doing on the floor, not busy on the roster', () => {
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(stage, /if \(t\.status !== 'waiting'\) board\[t\.status\]\+\+;/);
  assert.match(stage, /if \(t\.status === 'doing' && t\.assignee\) doingBy/);
  assert.match(read('src/main/hive.ts'), /t\?\.assignee === id && t\.status === 'doing'\)\?\.title/);
});

test('only Michael sets Waiting: not from Task detail, the IPC or voice', () => {
  assert.match(read('src/main/index.ts'), /!\['todo', 'doing', 'done'\]\.includes\(status as string\)/);
  const voice = read('src/main/realtimeActions.ts');
  assert.match(voice, /const valid = \['todo', 'doing', 'waiting', 'blocked', 'done'\];/);
  assert.match(voice, /if \(status === 'waiting'\) \{[\s\S]*?Waiting names who the card waits on, so only \$\{godName\} sets it\./);
  assert.match(read('src/renderer/src/realtime/tools.ts'), /\$\{by\('waiting'\)\.length\} waiting on someone/);
});

test('the owner cannot set Waiting, and moving a card out of Waiting drops who it waited on', () => {
  // Value: protects=a card the owner moves from Waiting to Doing or To do no longer says "Waiting on <who>", and Waiting stays Michael's; fails_when=ownerMoveTask keeps waitingOn or accepts waiting; why_new=ship review 2026-10-03 maintainability finding; seam=none
  const os = require('node:os');
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-waiting-'));
  try {
    fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
    fs.writeFileSync(path.join(home, 'hive', 'tasks.json'), JSON.stringify({ tasks: [{ id: 'c1', title: 'Setup', status: 'waiting', waitingOn: 'customer Gopi', assignee: 'kelly', dependsOn: [], priority: 3, createdAt: 'x' }] }));
    const hive = new HiveManager(() => home);
    assert.equal(hive.ownerMoveTask('c1', 'waiting'), false);
    assert.equal(hive.ownerMoveTask('c1', 'doing'), true);
    const card = JSON.parse(fs.readFileSync(path.join(home, 'hive', 'tasks.json'), 'utf8')).tasks.find((t) => t.id === 'c1');
    assert.equal(card.status, 'doing');
    assert.equal(card.waitingOn, undefined);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('the renderer can patch a card only with Ask me answers; a move goes through the owner move rules', () => {
  // Value: protects=Blocked and Waiting stay Michael's at the main process boundary, not just in the UI; fails_when=hive:patchTask accepts status, waitingOn or any other field from the renderer; why_new=Codex adversarial review 2026-10-04; seam=none
  const src = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'src/main/index.ts'), 'utf8');
  const handler = src.slice(src.indexOf("ipcMain.handle('hive:patchTask'"), src.indexOf("ipcMain.handle('hive:moveTask'"));
  assert.match(handler, /if \(Object\.keys\(patch\)\.some\(\(k\) => k !== 'humanQA'\)\) return \{ ok: false, error: 'only Ask me answers can be patched' \};/);
  assert.ok(handler.indexOf("k !== 'humanQA'") < handler.indexOf('hive.patchTask('), 'refused before anything is written');
  const callers = require('node:child_process').execSync("grep -rn 'hivePatchTask(' src/renderer || true", { cwd: require('node:path').resolve(__dirname, '..') }).toString().trim().split('\n').filter(Boolean);
  for (const c of callers) assert.match(c, /hivePatchTask\([^,]+, \{ humanQA: [^}]+\}\)/, c);
});
