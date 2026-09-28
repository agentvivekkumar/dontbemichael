'use strict';

/**
 * The two hidden Claude calls behind the hire wizard and Edit Agent:
 * src/main/hireCheck.ts (is the new job distinct?) and
 * src/main/workStyleConvert.ts (plain description <-> instructions). Each has
 * a fallback so a sign-in problem never blocks hiring; these tests drive every
 * branch with runHiddenClaude stubbed, so no terminal or model is involved.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

// hiddenClaude.ts imports node-pty (built for Electron); stand it in so the
// module loads, then replace runHiddenClaude on its shared exports object.
const ptyPath = require.resolve('node-pty');
require.cache[ptyPath] = { id: ptyPath, filename: ptyPath, loaded: true, exports: { spawn() { throw new Error('no pty in tests'); } } };
const HC = loadTs('src/main/hiddenClaude.ts');
const K = loadTs('src/main/hireCheck.ts');
const C = loadTs('src/main/workStyleConvert.ts');

const realRun = HC.runHiddenClaude;
test.after(() => { HC.runHiddenClaude = realRun; });

/** Stub the hidden call; returns the list of calls it received. */
function stub(answer) {
  const calls = [];
  HC.runHiddenClaude = async (prompt, opts) => {
    calls.push({ prompt, opts });
    if (answer instanceof Error) throw answer;
    return typeof answer === 'function' ? answer(prompt, opts) : answer;
  };
  return calls;
}
const deps = (logs) => ({ cwd: '/tmp', command: 'claude', log: (e) => logs.push(e) });

const pam = { name: 'Pam', title: 'Executive Admin', routing: 'Pam sorts the business inbox: customer orders, catering enquiries, supplier mail and bills.' };
const ryan = { name: 'Ryan', title: 'Marketing', routing: 'Ryan writes the daily special, promotions and social posts.' };
const erinCopy = { name: 'Erin', title: 'Receptionist', routing: 'Erin sorts the business inbox: customer orders, catering enquiries, supplier mail and bills.' };
const erinNew = { name: 'Erin', title: 'Travel', routing: 'Erin books travel and keeps the owner calendar.' };

// ─── readJobProfile ──────────────────────────────────────────────────────────

test('readJobProfile trusts only short strings and needs a name', () => {
  assert.equal(K.readJobProfile(null), null);
  assert.equal(K.readJobProfile('Erin'), null);
  assert.equal(K.readJobProfile({ name: '   ' }), null);
  assert.equal(K.readJobProfile({ name: 42 }), null);
  const p = K.readJobProfile({ name: '  Erin  ', title: 'x'.repeat(500), routing: 'r'.repeat(5000), workStyle: 7, mailbox: '' });
  assert.equal(p.name, 'Erin');
  assert.equal(p.title.length, 120);
  assert.equal(p.routing.length, 1500);
  assert.equal(p.workStyle, '');
  assert.equal(p.mailbox, undefined, 'an empty mailbox is no mailbox');
  assert.equal(K.readJobProfile({ name: 'N'.repeat(100) }).name.length, 60);
});

// ─── checkDistinct ───────────────────────────────────────────────────────────

test('checkDistinct: nobody on the team means distinct without asking the model', async () => {
  const calls = stub({ ok: true, text: '{"distinct": false, "overlapsWith": []}' });
  const v = await K.checkDistinct(erinCopy, [], deps([]));
  assert.deepEqual(v, { distinct: true, overlapsWith: [], why: '', source: 'rules' });
  assert.equal(calls.length, 0);
});

test('checkDistinct: the model answers with Haiku and no tools, and its verdict is used', async () => {
  const calls = stub({ ok: true, text: 'Sure. {"distinct": true, "overlapsWith": [], "why": "Travel is new work."}' });
  const v = await K.checkDistinct(erinNew, [pam, ryan], deps([]));
  assert.equal(v.distinct, true);
  assert.equal(v.source, 'ai');
  assert.equal(v.why, 'Travel is new work.');
  assert.equal(calls[0].opts.model, 'claude-haiku-4-5');
  assert.equal(calls[0].opts.noTools, true);
  assert.match(calls[0].prompt, /- Pam: title "Executive Admin"/);
});

test('checkDistinct: the model cannot clear a near copy the rules flag', async () => {
  stub({ ok: true, text: '{"distinct": true, "overlapsWith": [], "why": "Looks fine."}' });
  const v = await K.checkDistinct(erinCopy, [pam, ryan], deps([]));
  assert.equal(v.distinct, false);
  assert.deepEqual(v.overlapsWith, ['Pam']);
  assert.equal(v.source, 'ai');
});

test('checkDistinct: the model and the rules naming the same teammate list them once', async () => {
  stub({ ok: true, text: '{"distinct": false, "overlapsWith": ["Pam", "Ryan"], "why": "Both."}' });
  const v = await K.checkDistinct(erinCopy, [pam, ryan], deps([]));
  assert.deepEqual(v.overlapsWith, ['Pam', 'Ryan']);
  assert.equal(v.distinct, false);
});

test('checkDistinct: a junk answer falls back to the rules and is logged', async () => {
  stub({ ok: true, text: 'I think they are fine.' });
  const logs = [];
  const v = await K.checkDistinct(erinCopy, [pam, ryan], deps(logs));
  assert.deepEqual(v, { distinct: false, overlapsWith: ['Pam'], why: '', source: 'rules' });
  assert.deepEqual(logs, [{ kind: 'hire-check-fallback', reason: 'no verdict' }]);
});

test('checkDistinct: a failed call (signed out) falls back to the rules with its error', async () => {
  stub({ ok: false, error: 'not signed in' });
  const logs = [];
  const v = await K.checkDistinct(erinNew, [pam], deps(logs));
  assert.deepEqual(v, { distinct: true, overlapsWith: [], why: '', source: 'rules' });
  assert.deepEqual(logs, [{ kind: 'hire-check-fallback', reason: 'not signed in' }]);
  stub({ ok: false });
  const logs2 = [];
  await K.checkDistinct(erinNew, [pam], deps(logs2));
  assert.equal(logs2[0].reason, 'failed');
});

test('checkDistinct: a throwing call still answers from the rules, and a missing logger is fine', async () => {
  stub(new Error('spawn exploded'));
  const logs = [];
  const v = await K.checkDistinct(erinCopy, [pam], deps(logs));
  assert.equal(v.source, 'rules');
  assert.deepEqual(v.overlapsWith, ['Pam']);
  assert.match(logs[0].reason, /spawn exploded/);
  const quiet = await K.checkDistinct(erinCopy, [pam], { cwd: '/tmp', command: 'claude' });
  assert.equal(quiet.source, 'rules');
});

test('checkDistinct: only the first 40 teammates are compared', async () => {
  const team = Array.from({ length: 45 }, (_, i) => ({ name: `Mate${i}`, title: 't', routing: `Mate${i} handles area ${i} work` }));
  const calls = stub({ ok: true, text: '{"distinct": true, "overlapsWith": []}' });
  await K.checkDistinct(erinNew, team, deps([]));
  assert.match(calls[0].prompt, /- Mate39:/);
  assert.doesNotMatch(calls[0].prompt, /- Mate40:/);
});

// ─── readConvertRequest ──────────────────────────────────────────────────────

test('readConvertRequest needs a direction, some text and a name', () => {
  assert.equal(C.readConvertRequest(null), null);
  assert.equal(C.readConvertRequest({ to: 'prompt', text: 'x', ctx: { name: 'Erin' } }), null);
  assert.equal(C.readConvertRequest({ to: 'plain', text: '   ', ctx: { name: 'Erin' } }), null);
  assert.equal(C.readConvertRequest({ to: 'plain', text: 'x', ctx: { name: ' ' } }), null);
  assert.equal(C.readConvertRequest({ to: 'plain', text: 'x' }), null, 'no ctx means no name');
  const r = C.readConvertRequest({ to: 'instructions', text: 't'.repeat(9000), ctx: { name: ' Erin ', title: '', business: 'Taco', manager: '  ' }, previous: '' });
  assert.equal(r.text.length, 8000);
  assert.equal(r.ctx.name, 'Erin');
  assert.equal(r.ctx.title, undefined);
  assert.deepEqual(r.ctx.business, { name: undefined, city: undefined }, 'a non-object business is ignored');
  assert.equal(r.ctx.manager, undefined);
  assert.equal(r.previous, undefined);
  const full = C.readConvertRequest({ to: 'plain', text: 'x', ctx: { name: 'Erin', business: { name: 'Taco Shop', city: 'Austin' }, manager: 'Mike' }, previous: 'old' });
  assert.deepEqual(full.ctx.business, { name: 'Taco Shop', city: 'Austin' });
  assert.equal(full.ctx.manager, 'Mike');
  assert.equal(full.previous, 'old');
});

// ─── convertWorkStyle ────────────────────────────────────────────────────────

const ctx = { name: 'Erin', title: 'Executive Admin', business: { name: 'Taco Shop', city: 'Austin' } };
const instructions = 'The owner set this work style for your role at Taco Shop, Austin.\n\n### The job\nYou are the inbox keeper.';

test('convertWorkStyle: reading back uses Haiku, writing uses Sonnet, both without tools', async () => {
  const calls = stub({ ok: true, text: '```\nErin sorts the inbox.\n```' });
  const plain = await C.convertWorkStyle({ to: 'plain', text: instructions, ctx }, deps([]));
  assert.deepEqual(plain, { text: 'Erin sorts the inbox.', source: 'ai' }, 'fences are dropped');
  await C.convertWorkStyle({ to: 'instructions', text: 'The job: Erin sorts the inbox.', ctx, previous: 'old words' }, deps([]));
  assert.equal(calls[0].opts.model, 'claude-haiku-4-5');
  assert.equal(calls[1].opts.model, 'claude-sonnet-5');
  assert.ok(calls.every((c) => c.opts.noTools === true));
  assert.match(calls[0].prompt, /in the third person/);
  assert.match(calls[1].prompt, /--- PREVIOUS WORK STYLE ---\nold words/);
});

test('convertWorkStyle: an empty answer uses the quick rewrite and says so', async () => {
  stub({ ok: true, text: '```\n```' });
  const logs = [];
  const plain = await C.convertWorkStyle({ to: 'plain', text: instructions, ctx }, deps(logs));
  assert.equal(plain.source, 'rules');
  assert.match(plain.text, /^The job:\nErin is the inbox keeper\.$/);
  assert.deepEqual(logs, [{ kind: 'work-style-fallback', to: 'plain', reason: 'empty' }]);
});

test('convertWorkStyle: a failed or throwing call writes instructions from the owner\'s words', async () => {
  stub({ ok: false, error: 'timeout' });
  const logs = [];
  const out = await C.convertWorkStyle({ to: 'instructions', text: 'The job: sorts the inbox.', ctx }, deps(logs));
  assert.equal(out.source, 'rules');
  assert.match(out.text, /^The owner set this work style for your role at Taco Shop, Austin\.\n\n### The job\nsorts the inbox\.$/);
  assert.deepEqual(logs, [{ kind: 'work-style-fallback', to: 'instructions', reason: 'timeout' }]);
  stub(new Error('boom'));
  const logs2 = [];
  const thrown = await C.convertWorkStyle({ to: 'plain', text: instructions, ctx }, deps(logs2));
  assert.equal(thrown.source, 'rules');
  assert.match(logs2[0].reason, /boom/);
});
