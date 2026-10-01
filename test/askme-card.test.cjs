'use strict';

/**
 * The Ask me board reads as a list (owner, 2026-09-30): folded cards show the
 * ask in a line or two; one card is open at a time, the newest by default.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { askHeadline, askTitle, askedAgo } = loadTs('src/renderer/src/components/askHeadline.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the headline is Michael\'s bold lead, else the first sentence, as plain text', () => {
  assert.equal(askHeadline('**Two deals passed their close date. Where does each stand?**\n\n1. `GammaTile`'), 'Two deals passed their close date. Where does each stand?');
  assert.equal(askHeadline('Refund it, or tell Kelly what to say?'), 'Refund it, or tell Kelly what to say?');
  assert.equal(askHeadline('Please check whether `support@x.it` is reaching. It has shown no mail.'), 'Please check whether support@x.it is reaching.');
  assert.equal(askHeadline('Sign in again\nwith the app password'), 'Sign in again');
});

test('how long ago, in plain words', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.equal(askedAgo('2026-09-30T11:59:30Z', now, 'en'), 'just now');
  assert.equal(askedAgo('2026-09-30T07:00:00Z', now, 'en'), '5h ago');
  assert.equal(askedAgo(undefined, now, 'en'), '');
});

test('one card is open at a time, the newest by default; folded cards show the headline', () => {
  const src = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(src, /const expanded = openId === undefined \? idx === 0 : openId === t\.id;/);
  assert.match(src, /\{askHeadline\(open\.q\)\}/);
  assert.match(src, /WebkitLineClamp: 2/);
  // A chevron shows a card folds and opens, and turns as it opens.
  assert.match(src, /className="cth-askme-chevron"/);
  assert.match(src, /transform: expanded \? 'rotate\(180deg\)' : undefined/);
  // Nothing the owner relies on went away: answering, routing and memory are unchanged.
  assert.match(src, /window\.cth\.hiveRememberOwnerAnswer\(/);
  assert.match(src, /\{translate\('askMe\.openTask'\)\}/);
  // The cards sit on the app's own background, no tinted slab behind them.
  assert.match(read('src/renderer/src/shell/NeedsYouBoard.tsx'), /padding: '14px 16px 12px'\n\s+\}\}>/);
});

test('an ask is cleared only by answering it: no dismiss on the board (owner, 2026-10-01)', () => {
  const src = read('src/renderer/src/components/AskMeTab.tsx');
  assert.doesNotMatch(src, /const dismiss = /);
  assert.doesNotMatch(src, /dismissedAt: new Date/);
  assert.doesNotMatch(src, /askMe\.dismiss/);
  // Older dismissed entries are still read as closed (askMeRouting openAskIndex).
  assert.match(read('src/shared/askMeRouting.ts'), /dismissedAt/);
});

/**
 * Card titles read clean (owner, 2026-10-01: a header full of a user id and
 * "(support@, 1 Oct)" looked cryptic). Agents are told to write plain titles,
 * and the card cleans the ones that aren't.
 */
test('an Ask me card title drops opaque ids and bracketed metadata', () => {
  assert.equal(askTitle('Acme app user Xk29fLq8ZpR3mN7tV2wB requested CRM setup (support@, 1 Oct)'), 'Acme app user requested CRM setup');
  assert.equal(askTitle('Billing export errors (30 Sep)'), 'Billing export errors');
  assert.equal(askTitle('Check mail is reaching help@example.com (nothing since 21 Sep, per Kelly)'), 'Check mail is reaching help@example.com');
  assert.equal(askTitle('Order 550e8400-e29b-41d4-a716-446655440000 is stuck'), 'Order is stuck');
  // Plain titles, and brackets that are part of the name, stay as they are.
  assert.equal(askTitle('New lead: Jane Doe, example.org (website form)'), 'New lead: Jane Doe, example.org (website form)');
  assert.equal(askTitle('Refund for Northwind Cafe, Invoice #4471'), 'Refund for Northwind Cafe, Invoice #4471');
  const tab = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(tab, /\{askTitle\(t\.title\)\}/);
  // And at the source: Michael and the team are told how to title a card.
  const hive = read('src/main/hive.ts');
  assert.match(hive, /The card(\\'|')s title is its headline: a few plain words naming the matter, under 60 characters/);
  assert.match(hive, /Give the card a TITLE the owner can read at a glance/);
  assert.match(hive, /- give the card a title the owner reads at a glance/);
});

/**
 * Task detail (owner, 2026-10-01): the id and close sit on one row with the
 * title below at full width, and the card's notes show (agents write "notes";
 * the dialog read only "description", so it was empty on every card).
 */
test('task detail: title under the id row, and the card\'s notes show', () => {
  const src = read('src/renderer/src/components/TasksKanban.tsx');
  // "description" when it has text, else the agents' "notes".
  assert.match(src, /description: typeof t\.description === 'string' && t\.description\.trim\(\) \? t\.description\n\s*: typeof t\.notes === 'string' \? t\.notes : undefined,/);
  assert.match(src, /\{task\.description\?\.trim\(\) && \(/, 'no empty section');
  assert.doesNotMatch(src, /noDescription/);
  assert.match(src, /<div style=\{\{ marginTop: 10, fontSize: 16, fontWeight: 600[^}]*\}\}>\{askTitle\(task\.title\)\}<\/div>/);
  assert.match(read('src/main/hive.ts'), /Keep the card\\'s "notes" to what the work is and where it stands/);
});

/** The answer box grows with the text (owner, 2026-10-01). */
test('the Ask me answer box grows with what is typed, then scrolls', () => {
  const tab = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(tab, /<GrowingTextarea\n\s*className="cth-input"/);
  assert.doesNotMatch(tab, /rows=\{draft\.includes/);
  const grow = read('src/renderer/src/components/GrowingTextarea.tsx');
  assert.match(grow, /el\.style\.height = `\$\{Math\.min\(full, maxHeight\)\}px`;/);
  assert.match(grow, /el\.style\.overflowY = full > maxHeight \? 'auto' : 'hidden';/);
  assert.match(grow, /new ResizeObserver/);
});
