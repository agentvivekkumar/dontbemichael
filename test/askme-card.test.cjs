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

const { askHeadline, askedAgo } = loadTs('src/renderer/src/components/askHeadline.ts');
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
