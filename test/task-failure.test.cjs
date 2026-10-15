'use strict';

/**
 * A failed task tells the owner why it failed, when, and how many times it
 * has been tried again (issue 451). Retry is offered only when the card says
 * trying again is safe. The action asks Michael to route it; it does not run
 * the work a second time. A second click finds the failure already cleared.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  FAILURE_BOARD_RULE, STOPPED_BEFORE_FINISH, canRetryTask, failedAtLabel,
  failureFromStop, retryTaskPatch, taskAfterRetry, taskFailure
} = loadTs('src/shared/taskFailure.ts');
const { parseTasks } = loadTs('src/renderer/src/components/hiveTasks.ts');
const { ownerChangeNote } = loadTs('src/shared/ownerRequests.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

function card(extra = {}) {
  return {
    id: 'pay-supplier',
    title: 'Pay the supplier',
    status: 'doing',
    assignee: 'pam',
    failureReason: 'The supplier site did not answer.',
    failedAt: '2026-10-15T10:00:00.000Z',
    retryCount: 1,
    retryable: true,
    ...extra
  };
}

test('the board keeps a failure exactly as it was written, and drops a blank one', () => {
  // Value: protects=the owner sees the reason, time, retry count and whether a retry is safe; fails_when=parseTasks drops the fields or keeps a blank reason; why_new=issue 451, the ledger had no failure the board could show; seam=none
  const [kept, blank, wrong] = parseTasks({ tasks: [
    card(),
    card({ id: 'b', failureReason: '   ', failedAt: 'not a time', retryCount: '1', retryable: 'yes' }),
    card({ id: 'c', failureReason: 7, failedAt: 5, retryCount: 1.5, retryable: false })
  ] });
  assert.equal(kept.failureReason, 'The supplier site did not answer.');
  assert.equal(kept.failedAt, '2026-10-15T10:00:00.000Z');
  assert.equal(kept.retryCount, 1);
  assert.equal(kept.retryable, true);
  assert.equal(blank.failureReason, undefined);
  assert.equal(blank.failedAt, undefined);
  assert.equal(blank.retryCount, undefined);
  assert.equal(blank.retryable, undefined);
  assert.equal(wrong.failureReason, undefined);
  assert.equal(wrong.retryable, false, 'an explicit no stays a no');
  assert.equal(wrong.retryCount, undefined);
});

test('a card is failed only with a reason or a time, and never once it is Done', () => {
  // Value: protects=the failure section appears for a real failure and not for a finished card; fails_when=a blank card or a Done card still reads as failed; why_new=issue 451; seam=none
  assert.equal(taskFailure(card()).reason, 'The supplier site did not answer.');
  assert.equal(taskFailure(card()).retryCount, 1);
  assert.equal(taskFailure(card({ failureReason: undefined })).failedAt, '2026-10-15T10:00:00.000Z');
  assert.equal(taskFailure(card({ failureReason: '  ', failedAt: 'Monday' })), null);
  assert.equal(taskFailure(card({ status: 'done' })), null);
  assert.equal(taskFailure(card({ status: 'triage' })), null);
  assert.ok(failedAtLabel('2026-10-15T10:00:00.000Z', 'en'));
  assert.equal(failedAtLabel('Monday', 'en'), undefined);
});

test('retry is only for a safe open card, and a second retry does not count', () => {
  // Value: protects=Retry stays off a permanent stop, a question for the owner, and a card that is waiting or blocked, and a double click cannot retry twice; fails_when=canRetryTask or retryTaskPatch accepts any of those, or the count grows twice; why_new=issue 451; seam=none
  assert.equal(canRetryTask(card()), true);
  assert.equal(canRetryTask(card({ retryable: false })), false);
  assert.equal(canRetryTask(card({ retryable: undefined })), false);
  assert.equal(canRetryTask(card({ status: 'blocked' })), false);
  assert.equal(canRetryTask(card({ status: 'waiting' })), false);
  assert.equal(canRetryTask(card({ status: 'done' })), false);
  assert.equal(canRetryTask(card({ humanQA: [{ q: 'Which supplier?' }] })), false);
  assert.equal(canRetryTask(card({ humanQA: [{ q: 'Which supplier?', a: 'The usual one.' }] })), true);
  const patch = retryTaskPatch(card());
  assert.deepEqual(patch, {
    status: 'todo', failureReason: null, failedAt: null, retryable: null, retryCount: 2
  });
  const after = taskAfterRetry(card());
  assert.equal(after.status, 'todo');
  assert.equal(after.retryCount, 2);
  assert.equal(after.failureReason, undefined);
  assert.equal(retryTaskPatch(after), null, 'the cleared card cannot be retried again');
  assert.equal(retryTaskPatch(card({ retryable: false })), null);
});

test('a stopped team member fails only their Doing cards, and an open question is not retried', () => {
  // Value: protects=a crash is recorded on the work that was in progress, without wiping a reason already written, and without offering retry while the owner still owes an answer; fails_when=failureFromStop marks To do, overwrites Michael, or sets retryable on an open ask; why_new=issue 451, a stopped process left the card looking busy; seam=none
  const stop = failureFromStop({ status: 'doing', retryCount: 2 }, '2026-10-15T11:00:00.000Z');
  assert.deepEqual(stop, {
    failureReason: STOPPED_BEFORE_FINISH, failedAt: '2026-10-15T11:00:00.000Z', retryCount: 2, retryable: true
  });
  assert.equal(failureFromStop({ status: 'todo' }, '2026-10-15T11:00:00.000Z'), null);
  assert.equal(failureFromStop(card(), '2026-10-15T11:00:00.000Z'), null, 'a reason already written stays');
  const asked = failureFromStop({ status: 'doing', humanQA: [{ q: 'Which supplier?' }] }, '2026-10-15T11:00:00.000Z');
  assert.equal(asked.retryable, false);
});

test('Michael is told to record a failure, and a retry tells him not to repeat a finished step', () => {
  // Value: protects=both of Michael's prompts name the failure fields, and the retry note warns him off a second send or charge; fails_when=one prompt drops the rule or the note stops naming the retry; why_new=issue 451; seam=none
  const hive = read('src/main/hive.ts');
  assert.equal((hive.match(/FAILURE_BOARD_RULE/g) || []).length, 3, 'the import and both prompts');
  assert.doesNotMatch(FAILURE_BOARD_RULE, /[\u002D\u2010-\u2015\u2212]/, 'the rule is plain words');
  const note = ownerChangeNote({ id: 'pay-supplier', title: 'Pay the supplier' }, { kind: 'retried', retryCount: 2 });
  assert.equal(note.subject, 'OWNER RETRY card pay-supplier');
  assert.match(note.body, /retry 2/);
  assert.match(note.body, /back in To do/);
  assert.match(note.body, /before you repeat a send, a charge, or any other finished step/);
});

test('the card and the detail show the failure, and the retry control cannot fire twice', () => {
  // Value: protects=the failure section and the in progress state are on the card and in the detail, and a click while one retry is running returns before sending another; fails_when=the section, the busy disable, or the lock is dropped; why_new=issue 451; seam=none
  const kanban = read('src/renderer/src/components/TasksKanban.tsx');
  const overlay = read('src/renderer/src/components/TaskDetailOverlay.tsx');
  assert.match(kanban, /if \(lock\.current \|\| busy \|\| !canRetryTask\(task\)\) return;/);
  assert.match(kanban, /disabled=\{retry\.busy\}/);
  assert.match(kanban, /data-failure-state=\{retry\.busy \? 'retrying' : 'failed'\}/);
  assert.match(kanban, /<TaskFailureView task=\{task\} onRetry=\{onRetry\} onOpen=\{onOpen\} variant="card" \/>/);
  assert.match(kanban, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(kanban, /<TaskFailureView task=\{task\} onRetry=\{onRetry\} variant="detail" \/>/);
  assert.match(overlay, /window\.cth\.hiveRetryTask\(task\.id\)/);
  assert.match(read('src/preload/index.ts'), /hiveRetryTask: \(id: string\)/);
  assert.match(read('src/main/index.ts'), /ipcMain\.handle\('hive:retryTask'/);
  assert.match(read('src/main/index.ts'), /return \{ ok: hive\.ownerRetryTask\(id\) \};/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const kanbanStrings = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).kanban;
    for (const key of ['failed', 'failureTitle', 'failedWhen', 'retryNone', 'retryOnce', 'retryMany', 'retryTask', 'retrying', 'retryTaskTitle']) {
      assert.equal(typeof kanbanStrings[key], 'string', `${loc} ${key}`);
    }
  }
});

function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-task-fail-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return new HiveManager(() => home);
}

function tasksOf(hive) {
  return Object.fromEntries(hive.tasks().tasks.map((task) => [task.id, task]));
}

function inbox(hive) {
  const dir = path.join(hive.root(), 'agents', 'god', 'inbox');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

test('a stopped person fails their Doing cards, and the owner can retry a safe one once', async (t) => {
  // Value: protects=the crash lands on the right cards, a retry clears it and tells Michael once, and a second retry does not count; fails_when=another person's card is marked, a written reason is replaced, the count grows twice, or the note is missing; why_new=issue 451; seam=recordAgentExit and ownerRetryTask
  const hive = floor(t);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: os.tmpdir(), isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: os.tmpdir() });
  hive.writeTasks([
    { id: 'a', title: 'Pay the supplier', status: 'doing', assignee: 'pam', dependsOn: [], priority: 3, createdAt: '2026-10-15T09:00:00.000Z', webhook: { tokenHash: 'abc' } },
    { id: 'b', title: 'File the receipt', status: 'todo', assignee: 'pam', dependsOn: [], priority: 3, createdAt: '2026-10-15T09:00:00.000Z' },
    { id: 'c', title: 'Call the customer', status: 'doing', assignee: 'nick', dependsOn: [], priority: 3, createdAt: '2026-10-15T09:00:00.000Z' },
    { id: 'd', title: 'Send the quote', status: 'doing', assignee: 'pam', dependsOn: [], priority: 3, createdAt: '2026-10-15T09:00:00.000Z', failureReason: 'Already noted.', failedAt: '2026-10-01T00:00:00.000Z', retryable: false, retryCount: 4 }
  ]);

  hive.recordAgentExit('pam', { exitCode: 0, signal: 0 });
  assert.equal(tasksOf(hive).a.failureReason, undefined, 'a clean exit is not a failure');

  hive.recordAgentExit('pam', { exitCode: 0, signal: 9 });
  let byId = tasksOf(hive);
  assert.equal(byId.a.failureReason, STOPPED_BEFORE_FINISH);
  assert.equal(byId.a.retryable, true);
  assert.equal(byId.a.retryCount, 0);
  assert.equal(byId.a.status, 'doing');
  assert.equal(byId.a.webhook.tokenHash, 'abc', 'a field the board does not edit stays');
  assert.equal(byId.b.failureReason, undefined, 'To do was not in progress');
  assert.equal(byId.c.failureReason, undefined, 'another person');
  assert.equal(byId.d.failureReason, 'Already noted.');
  assert.equal(byId.d.retryCount, 4);

  assert.equal(hive.ownerRetryTask('a'), true);
  assert.equal(hive.ownerRetryTask('a'), false, 'already cleared');
  byId = tasksOf(hive);
  assert.equal(byId.a.status, 'todo');
  assert.equal(byId.a.failureReason, null);
  assert.equal(byId.a.failedAt, null);
  assert.equal(byId.a.retryable, null);
  assert.equal(byId.a.retryCount, 1);
  assert.equal(byId.a.webhook.tokenHash, 'abc');
  const notes = inbox(hive).filter((m) => m.subject.startsWith('OWNER RETRY'));
  assert.equal(notes.length, 1);
  assert.match(notes[0].body, /retry 1/);
  assert.equal(notes[0].act, 'inform');

  assert.equal(hive.ownerRetryTask('d'), false, 'a permanent stop is not retried');
  assert.equal(tasksOf(hive).d.retryCount, 4);
});

test('a crash while a question is open is shown and cannot be retried', async (t) => {
  // Value: protects=the owner still sees that the work stopped, but Retry is refused while they owe an answer; fails_when=the open ask is retried or the failure is skipped; why_new=issue 451; seam=recordAgentExit and ownerRetryTask
  const hive = floor(t);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: os.tmpdir(), isGod: true });
  hive.writeTasks([{
    id: 'ask', title: 'Pay the supplier', status: 'doing', assignee: 'pam', dependsOn: [], priority: 3,
    createdAt: '2026-10-15T09:00:00.000Z', humanQA: [{ q: 'Which supplier?' }]
  }]);
  hive.recordAgentExit('pam', { exitCode: 1 });
  const cardOnDisk = tasksOf(hive).ask;
  assert.equal(cardOnDisk.failureReason, STOPPED_BEFORE_FINISH);
  assert.equal(cardOnDisk.retryable, false);
  assert.equal(hive.ownerRetryTask('ask'), false);
  assert.equal(tasksOf(hive).ask.status, 'doing');
});
