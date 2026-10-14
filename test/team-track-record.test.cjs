'use strict';

/**
 * Issue 319, first step: the weekly track record fold in
 * src/shared/teamTrackRecord.ts. One line per team member from what the
 * app already records: the cost ledger, the mail proposals and card
 * events, plus the office's one plan reading passed through.
 *
 * The three fixtures the issue names: a ledger that includes an app
 * restart, a quiet week that shows zeros and says so, and an edited
 * approval counted as edited.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const T = loadTs('src/shared/teamTrackRecord.ts');

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 5); // Monday 2026-10-05, UTC for stable fixtures
const END = START + 7 * DAY;
const IN = START + 2 * DAY; // a moment inside the week

const member = (rec, id) => rec.members.find((m) => m.agentId === id);
const row = (agent, session, ts, usd) => JSON.stringify({ agent_id: agent, session_id: session, ts, usd });
const proposal = (over) => ({
  id: 'mp_x', agentId: 'kelly', mailbox: 'support@', to: 'a@b.c',
  subject: 'Your order', body: 'It ships Friday.', createdAt: IN,
  state: 'waiting', ...over
});

test('a ledger that includes an app restart: the week keeps the spend on both sides of it', () => {
  const text = [
    row('kelly', 's1', START - DAY, 2.00), // before the week: baseline only
    row('kelly', 's1', START + DAY, 2.50),
    row('kelly', 's1', START + 2 * DAY, 0.10), // the counter drops: a restart
    row('kelly', 's1', START + 3 * DAY, 0.60),
    row('kelly', 's1', END + DAY, 9.99), // after the week: not this week
    row('oscar', 's9', START + DAY, 0.25),
    'this line is not json',
    JSON.stringify({ agent_id: 'kelly', session_id: 's1', ts: 'soon', usd: 5 })
  ].join('\n');
  const rec = T.teamTrackRecord({ costLedgerText: text }, START, END);
  // Kelly folded to 3.10 by the end of the week (peak 2.50 closed by the
  // restart, then 0.60) against a 2.00 baseline: the week itself is 1.10.
  assert.equal(member(rec, 'kelly').costUsd, 1.1);
  assert.equal(member(rec, 'oscar').costUsd, 0.25);
  assert.equal(member(rec, 'kelly').quiet, false);
});

test('a quiet week shows zeros and says so', () => {
  const rec = T.teamTrackRecord({
    agentIds: ['kelly', 'oscar'],
    costLedgerText: row('kelly', 's1', START - DAY, 3.25), // all before the week
    proposals: [proposal({ state: 'sent', decidedAt: START - DAY, sentAt: START - DAY })],
    cardEvents: [{ agentId: 'kelly', kind: 'closed', at: END + DAY }]
  }, START, END);
  assert.equal(rec.quiet, true);
  assert.equal(rec.plan, null);
  assert.deepEqual(rec.members.map((m) => m.agentId), ['kelly', 'oscar']);
  for (const m of rec.members) {
    assert.equal(m.costUsd, 0);
    assert.equal(m.cardsClosed, 0);
    assert.equal(m.cardsReopened, 0);
    assert.equal(m.draftsSentAsWritten, 0);
    assert.equal(m.draftsSentAfterEdits, 0);
    assert.equal(m.draftsStopped, 0);
    assert.equal(m.decisions, 0);
    assert.equal(m.quiet, true);
    assert.equal(m.showCountsOnly, true);
  }
});

test('an edited approval is counted as edited; the other decisions land in their own counts', () => {
  const rec = T.teamTrackRecord({
    proposals: [
      proposal({ id: 'a', state: 'sent', decidedAt: IN, sentAt: IN, approved: { subject: 'Your order', body: 'It ships Friday.' } }),
      proposal({ id: 'b', state: 'sent', decidedAt: IN, sentAt: IN, approved: { subject: 'Your order', body: 'It ships Monday, on us.' } }),
      proposal({ id: 'c', state: 'declined', decidedAt: IN }),
      proposal({ id: 'd', state: 'changes', decidedAt: IN }),
      proposal({ id: 'e', state: 'waiting' }), // no decision yet
      proposal({ id: 'f', state: 'cancelled', decidedAt: IN }), // the app, not the owner
      proposal({ id: 'g', state: 'sent', decidedAt: START - DAY, sentAt: START - DAY, approved: { subject: 'Your order', body: 'It ships Friday.' } }) // last week
    ],
    cardEvents: [
      { agentId: 'kelly', kind: 'closed', at: IN },
      { agentId: 'kelly', kind: 'closed', at: IN },
      { agentId: 'kelly', kind: 'reopened', at: IN },
      { agentId: 'kelly', kind: 'closed', at: END } // the next week starts here
    ]
  }, START, END);
  const kelly = member(rec, 'kelly');
  assert.equal(kelly.draftsSentAsWritten, 1);
  assert.equal(kelly.draftsSentAfterEdits, 1);
  assert.equal(kelly.draftsStopped, 1);
  assert.equal(kelly.changesRequested, 1);
  assert.equal(kelly.decisions, 4);
  assert.equal(kelly.showCountsOnly, true, 'four decisions are counts, not percentages');
  assert.equal(kelly.cardsClosed, 2);
  assert.equal(kelly.cardsReopened, 1);
});

test('ten decisions in the window turn counts-only off for that member', () => {
  const many = Array.from({ length: 10 }, (_, i) => proposal({ id: `p${i}`, state: 'declined', decidedAt: IN + i }));
  const rec = T.teamTrackRecord({ agentIds: ['kelly', 'oscar'], proposals: many }, START, END);
  assert.equal(member(rec, 'kelly').decisions, 10);
  assert.equal(member(rec, 'kelly').showCountsOnly, false);
  assert.equal(member(rec, 'oscar').showCountsOnly, true);
});

test('the plan meter is the one office reading, passed through; the cost label travels with it', () => {
  const plan = { usedPercentage: 82, resetsAt: END + DAY };
  const rec = T.teamTrackRecord({ agentIds: ['kelly'], plan }, START, END);
  assert.deepEqual(rec.plan, plan);
  assert.match(T.COST_BASIS_LABEL, /at API prices/);
});

test('the fold is read only: no file access, no writes, nothing that sets a model', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/shared/teamTrackRecord.ts'), 'utf8');
  assert.doesNotMatch(src, /from '(node:)?fs'|from 'electron'|writeFile|appendFile|createWriteStream/);
  assert.doesNotMatch(src, /\.model\s*=|model\s*:/, 'no code path writes a model choice');
});
