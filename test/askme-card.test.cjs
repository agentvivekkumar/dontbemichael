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
  assert.match(src, /const pinned = openId !== undefined && \(openId === null \|\| waiting\.some\(\(x\) => x\.id === openId\)\);/);
  assert.match(src, /const expanded = pinned \? openId === t\.id : idx === 0;/);
  // Typing pins the card, so a newer ask never folds it mid answer (review, 2026-10-01).
  assert.match(src, /onFocus=\{\(\) => setOpenId\(t\.id\)\}/);
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
  // Both fields: the app's "description" and the agents' "notes" (the parser
  // lives in hiveTasks.ts, shared with the Needs you feed).
  assert.match(read('src/renderer/src/components/hiveTasks.ts'), /description: typeof t\.description === 'string' \? t\.description : undefined,\n\s*notes: typeof t\.notes === 'string' \? t\.notes : undefined,/);
  assert.match(src, /\[\['description', task\.description\], \['notes', task\.notes\]\]/);
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

/** Talk to Michael grows the same way (owner, 2026-10-01). */
test('the Talk to Michael box grows upward; Enter sends, Shift+Enter is a new line', () => {
  const bar = read('src/renderer/src/shell/BottomBar.tsx');
  assert.match(bar, /<GrowingTextarea\n\s*value=\{text\}/);
  assert.match(bar, /if \(e\.key === 'Enter' && !e\.shiftKey\) \{ e\.preventDefault\(\); send\(\); \}/);
  assert.match(bar, /bottom: 24, zIndex: 70,\n\s*display: 'flex', alignItems: 'flex-end'/);
  assert.match(bar, /<div style=\{\{ height: 50, display: 'flex', alignItems: 'center', gap: 14 \}\}>/);
});

test('card titles and times hold up at the edges', () => {
  // Generated by /ship coverage audit (pass 1).
  // Value: protects=a card header never goes blank, keeps stacked metadata, or shows a broken time; fails_when=askTitle strips only one trailing bracket, empties an all-id title, or askedAgo loses its minute/day steps, its bad-date guard or its clamp for a clock ahead; why_new=only the happy paths were checked; seam=none
  // Every trailing bracket of metadata goes, one after another; a name bracket stays.
  assert.equal(askTitle('Mailbox check (support@) (2026-09-30)'), 'Mailbox check');
  assert.equal(askTitle('Refund (website form) (1 Oct)'), 'Refund (website form)');
  // A title that is only an id is kept as it is rather than shown empty.
  assert.equal(askTitle('Xk29fLq8ZpR3mN7tV2wB'), 'Xk29fLq8ZpR3mN7tV2wB');
  // Removing an id leaves no stray space before punctuation.
  assert.equal(askTitle('User a1b2c3d4e5f6a7b8c9d0 , needs access'), 'User, needs access');
  // The headline drops headings, links and code marks.
  assert.equal(askHeadline('## Sign in to [QuickBooks](https://example.com) now. Then tell me.'), 'Sign in to QuickBooks now.');
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.equal(askedAgo('2026-09-30T11:55:00Z', now, 'en'), '5m ago');
  assert.equal(askedAgo('2026-09-27T12:00:00Z', now, 'en'), '3d ago');
  assert.equal(askedAgo('not a date', now, 'en'), '', 'a bad timestamp shows nothing');
  assert.equal(askedAgo('2026-09-30T12:05:00Z', now, 'en', 'now'), 'now', 'a clock ahead of ours is just now, never negative');
  assert.notEqual(askedAgo('2026-09-30T11:00:00Z', now, 'ar'), askedAgo('2026-09-30T11:00:00Z', now, 'en'), 'in the app\'s language');
});

/**
 * Review, 2026-10-01: an agent-written card with no string title crashed the
 * Ask me board, and a huge title took about half a second per render.
 */
test('askTitle never throws on agent-written data, stays fast, and keeps readable names', () => {
  for (const bad of [undefined, null, 42, {}]) assert.equal(askTitle(bad), '');
  const t0 = Date.now();
  askTitle('Refund (' + ' '.repeat(50000) + 'x');
  askTitle('A' + ' (1 Oct)'.repeat(5000));
  assert.ok(Date.now() - t0 < 100, 'long titles stay fast');
  assert.equal(askTitle('Upgrade Windows10Enterprise laptops'), 'Upgrade Windows10Enterprise laptops');
  assert.equal(askTitle('Review Q3_2026_budget_final export'), 'Review Q3_2026_budget_final export');
  assert.equal(askTitle('Sign the lease (Suite 100)'), 'Sign the lease (Suite 100)');
  assert.equal(askTitle('Refund for Northwind Cafe (#4471, 30 Sep)'), 'Refund for Northwind Cafe');
  const tab = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(tab, /const who = nameFor\(typeof t\.assignee === 'string' \? t\.assignee : undefined\);/);
});
