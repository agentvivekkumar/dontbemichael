'use strict';

/**
 * The hire wizard's jobs, folders and instant overlap rules
 * (src/shared/hireTemplates.ts, docs/designs/hire-redesign.md).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const H = loadTs('src/shared/hireTemplates.ts');
const { OFFICE_CAST } = (() => {
  // cast.ts imports renderer paths; read the names from the source instead.
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/scene/office/cast.ts'), 'utf8');
  const names = [...src.matchAll(/name: '([a-z]+)'/g)].map((m) => m[1]);
  return { OFFICE_CAST: [...new Set(names)] };
})();

const packsDir = path.resolve(__dirname, '..', 'resources/packs');
const all = fs.readdirSync(packsDir).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(packsDir, f), 'utf8')));
const core = all.find((p) => p.businessType === 'core');
const packs = all.filter((p) => p !== core);
const business = { name: 'Taco Shop', city: 'Austin' };

test('every character but Michael has a job family whose card exists in some pack', () => {
  const cards = H.cardJobs(packs, core, 'restaurant-food', business);
  for (const c of OFFICE_CAST.filter((n) => n !== 'michael')) {
    const job = H.ownJob(c, [], cards);
    assert.ok(job, `${c} has a job`);
  }
});

test('the office pack comes first, core text shown once, every job filled for the business', () => {
  const cards = H.cardJobs(packs, core, 'restaurant-food', business);
  assert.equal(cards[0].sourceCard.split('/')[0], 'restaurant-food');
  const keys = cards.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const c of cards) {
    assert.doesNotMatch(c.workStyle, /\{Business\}|\{City\}/);
    assert.ok(c.title && c.routing, c.key);
  }
  // Erin's own job in a restaurant is this office's Pam card.
  assert.equal(H.ownJob('erin', [], cards).sourceCard, 'restaurant-food/pam');
  // Nick has no restaurant card, so another pack's IT card is used.
  assert.equal(H.ownJob('nick', [], cards).sourceCard.split('/')[1], 'nick');
});

test('a live teammate in the family wins over the card, with the owner edits', () => {
  const cards = H.cardJobs(packs, core, 'restaurant-food', business);
  const team = H.teamJobs([
    { id: 'michael', name: 'Michael', isGod: true, description: 'office manager' },
    { id: 'pam', name: 'Pam', character: 'pam', description: 'Executive Admin: Pam sorts the catering inbox.', goal: 'Pam: edited by the owner.' }
  ], cards);
  assert.equal(team.length, 1);
  const job = H.ownJob('erin', team, cards);
  assert.equal(job.key, 'team:pam');
  const copy = H.jobFor(job, 'Erin');
  assert.equal(copy.routing, 'Erin sorts the catering inbox.');
  assert.equal(copy.workStyle, 'Erin: edited by the owner.');
});

test('name swap is whole word only', () => {
  assert.equal(H.swapName('Pam and Pamphlets; ask Pam.', 'Pam', 'Erin'), 'Erin and Pamphlets; ask Erin.');
  assert.equal(H.swapName('text', '', 'Erin'), 'text');
});

test('a hire gets its own folder, suffixed with its name on a clash', () => {
  const taken = new Set(['Admin', 'Admin_Erin']);
  assert.equal(H.hireFolderName('Finance', 'Kevin', (f) => taken.has(f)), 'Finance');
  assert.equal(H.hireFolderName('Admin', 'Jim', (f) => taken.has(f)), 'Admin_Jim');
  assert.equal(H.hireFolderName('Admin', 'Erin', (f) => taken.has(f)), 'Admin_Erin_2');
});

test('the rules flag a near copy of what to send, not a title', () => {
  const pam = { name: 'Pam', title: 'Executive Admin', routing: 'Pam sorts the business inbox: customer orders, catering enquiries, supplier mail and bills.' };
  const ryan = { name: 'Ryan', title: 'Marketing', routing: 'Ryan writes the daily special, promotions and social posts.' };
  // The title alone decides nothing: same title with different work is not flagged.
  assert.deepEqual(H.overlapsByRules({ name: 'Erin', title: 'Executive Admin', routing: 'Erin books travel and keeps the owner calendar.' }, [pam, ryan]), []);
  assert.deepEqual(H.overlapsByRules({ name: 'Erin', title: 'Receptionist', routing: 'Erin sorts the business inbox: customer orders, catering enquiries, supplier mail and bills.' }, [pam, ryan]), ['Pam']);
  assert.deepEqual(H.overlapsByRules({ name: 'Jim', title: 'Social Media', routing: 'Jim follows the company Instagram feed and answers comments.' }, [pam, ryan]), []);
});

test('a binding scopes the new line and hands the rest back once', () => {
  const b = H.bindingLines('the support@ mailbox', 'Erin');
  assert.equal(b.own, 'Only the support@ mailbox.');
  assert.equal(b.others, 'Not for the support@ mailbox; that goes to Erin.');
  assert.equal(H.appendOnce(H.appendOnce('Pam sorts mail.', b.others), b.others), `Pam sorts mail. ${b.others}`);
});

test('the AI verdict keeps only real teammate names and falls back to null on junk', () => {
  const v = H.parseDistinctAnswer('ok {"distinct": false, "overlapsWith": ["pam", "Bob"], "why": "Both sort mail.", "suggestion": "Bind to support@"}', ['Pam', 'Ryan']);
  assert.deepEqual(v.overlapsWith, ['Pam']);
  assert.equal(v.distinct, false);
  assert.equal(v.source, 'ai');
  assert.equal(H.parseDistinctAnswer('{"distinct": true, "overlapsWith": ["Ryan"]}', ['Ryan']).distinct, false);
  assert.equal(H.parseDistinctAnswer('no json here', ['Pam']), null);
  assert.equal(H.parseDistinctAnswer('{"distinct": "maybe"}', ['Pam']), null);
});

test('the check prompt names every teammate and asks for JSON', () => {
  const p = H.distinctPrompt({ name: 'Erin', title: 'Admin', routing: 'r' }, [{ name: 'Pam', title: 'Admin', routing: 'p', mailbox: 'ceo@x.com' }]);
  assert.match(p, /- Pam: title "Admin"/);
  assert.match(p, /mailbox ceo@x\.com/);
  assert.match(p, /ONE JSON object/);
});

test('office jobs are listed only in the character\'s family (owner, 2026-09-27)', () => {
  const cards = H.cardJobs(packs, core, 'restaurant-food', business);
  const team = H.teamJobs([
    { id: 'pam', name: 'Pam', character: 'pam', description: 'Executive Admin: Pam sorts the inbox.' },
    { id: 'ryan', name: 'Ryan', character: 'ryan', description: 'Marketing: Ryan writes posts.' },
    { id: 'jim-1', name: 'Jim', character: 'jim', description: 'Social Media Manager: Jim follows Instagram.' }
  ], cards);
  const forErin = team.filter((j) => H.sameFamily(j, 'erin')).map((j) => j.fromName);
  assert.deepEqual(forErin, ['Pam']);
  // A job the owner wrote for Jim stays in Jim's Sales family.
  assert.deepEqual(team.filter((j) => H.sameFamily(j, 'stanley')).map((j) => j.fromName), ['Jim']);
  assert.equal(H.sameFamily(team[0], 'michael'), false);
});

test('renaming the job title never clears an overlap (owner, 2026-09-27)', () => {
  const dwight = { name: 'Dwight', title: 'Sales Director', routing: 'Dwight runs the sales pipeline: leads, open deals and their stages, draft proposals and quotes, prospect follow ups, and the monthly forecast.' };
  const jim = (title) => ({ name: 'Jim', title, routing: H.swapName(dwight.routing, 'Dwight', 'Jim') });
  for (const title of ['Sales Director', 'Sales Director1', 'Head of Growth', '']) {
    assert.deepEqual(H.overlapsByRules(jim(title), [dwight]), ['Dwight'], title);
  }
  assert.match(H.distinctPrompt(jim('x'), [dwight]), /The job title and the person's name never make a job distinct/);
});
