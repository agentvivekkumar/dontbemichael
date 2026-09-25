'use strict';

/**
 * An owner's Ask me answer belongs to the agent that raised the question
 * (owner, 2026-09-25): it goes straight to that agent and into its memory
 * notes, and Michael is told so he can unblock the card. Michael's own
 * questions come back to him the same way.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { raiserOf, answerMessages } = loadTs('src/shared/askMeRouting.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { parseInbox } = loadTs('src/shared/memoryIndex.ts');

const known = new Set(['god', 'oscar', 'pam']);

test('the raiser is who the card says, else the assignee, else Michael', () => {
  assert.equal(raiserOf({ raisedBy: 'oscar' }, { assignee: 'pam' }, known), 'oscar');
  assert.equal(raiserOf({}, { assignee: 'pam' }, known), 'pam');
  assert.equal(raiserOf({ raisedBy: 'ghost' }, {}, known), 'god', 'an unknown id never swallows the answer');
  assert.equal(raiserOf({ raisedBy: 'god' }, { assignee: 'pam' }, known), 'god', 'Michael\'s own question');
});

test('a team member\'s answer goes to them and to Michael; Michael\'s own goes to him once', () => {
  const two = answerMessages({ raiser: 'oscar', raiserName: 'Oscar', taskId: 't1', title: 'Pay the supplier', q: 'Pay now?', a: 'Yes, always pay on time.' });
  assert.deepEqual(two.map((m) => m.to), ['oscar', 'god']);
  assert.match(two[0].body, /added to your memory notes/);
  assert.match(two[1].body, /It went straight to Oscar.*Unblock the card/);
  const one = answerMessages({ raiser: 'god', raiserName: 'Michael', taskId: 't2', title: 'Market research', q: 'Who does it?', a: 'Hire a researcher.' });
  assert.deepEqual(one.map((m) => m.to), ['god']);
  assert.match(one[0].body, /the question you raised/);
  for (const m of [...two, ...one]) assert.doesNotMatch(m.body + m.subject, /[–—]/);
});

test('the answer lands in the raiser\'s memory inbox as the owner\'s words', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-askme-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home });
  assert.equal(hive.rememberOwnerAnswer('oscar', 'Pay the supplier', 'Pay now?\nOr wait?', 'Yes.\n- Always pay on time.'), true);
  const notes = parseInbox(fs.readFileSync(path.join(home, 'hive', 'agents', 'oscar', 'memory', 'inbox.md'), 'utf8'));
  assert.equal(notes.length, 1, 'one note, even for a multi-line answer');
  assert.match(notes[0], /^From the owner \(\d{4}-\d{2}-\d{2}\), answering a question on "Pay the supplier": Q: Pay now\? Or wait\? A: Yes\. - Always pay on time\.$/);
  assert.equal(hive.rememberOwnerAnswer('../etc', 'x', 'q', 'a'), false);
  assert.equal(hive.rememberOwnerAnswer('ghost', 'x', 'q', 'a'), false);
});

test('Michael records who raised each question, and the tidy-up keeps the lasting part', () => {
  const hiveSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/hive.ts'), 'utf8');
  assert.match(hiveSrc, /push \{"q":"\.\.\.","askedAt":"<iso>","raisedBy":"<agent id>"\}/);
  assert.match(hiveSrc, /one humanQA ask with "raisedBy": "god"/);
  const tidy = fs.readFileSync(path.resolve(__dirname, '../src/main/memoryTidy.ts'), 'utf8');
  assert.match(tidy, /A note that starts "From the owner" is the owner\\'s answer/);
  const tab = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/components/AskMeTab.tsx'), 'utf8');
  assert.match(tab, /const raiser = raiserOf\(open, task, new Set\(agents\.map\(\(a\) => a\.id\)\)\);/);
  assert.match(tab, /window\.cth\.hiveRememberOwnerAnswer\(\{ agentId: raiser, task: task\.title, q: open\.q, a: text \}\)/);
});
