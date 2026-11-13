'use strict';

/**
 * Needs you after the last answer (owner, 2026-11-10): one quiet line for the
 * answers, then one tip from Michael drawn from this office. The picker is
 * pure (src/shared/allClearTip.ts); the card's wiring is pinned in the source.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const T = loadTs('src/shared/allClearTip.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const NOW = 1_800_000_000_000;

const runLess = (id, usd, extra = {}) => ({
  id, kind: 'run-less', agentId: 'kelly', missionId: 'm1', evidence: { runs: 20, nothing: 18 },
  change: { kind: 'interval', fromMs: 8 * 3_600_000, toMs: 16 * 3_600_000 }, savesPerWeek: usd, band: 18, ...extra
});
const base = (over = {}) => ({ advice: [], connectorsOn: [], grantedKeys: new Set(), snoozed: {}, now: NOW, ...over });

test('the biggest saving one click can apply comes first', () => {
  // Value: protects=the tip is the most useful saving and always one the button can apply; fails_when=a smaller saving wins, an editor-only or run-more suggestion is offered, or a cent-sized saving shows; why_new=new tip; seam=pure; no_claim=Pulse's own advice rules
  const tip = T.pickAllClearTip(base({
    advice: [
      runLess('a', 3),
      runLess('b', 11.2),
      runLess('c', 50, { change: { kind: 'editor', direction: 'less' } }),
      runLess('d', 40, { kind: 'run-more' }),
      runLess('e', 0.4),
      { ...runLess('f', 9), kind: 'cheaper-model', change: { kind: 'model', from: 'opus', to: 'sonnet', toLabel: 'Sonnet' } }
    ],
    connectorsOn: [{ key: 'Canva', label: 'Canva' }]
  }));
  assert.equal(tip.kind, 'save');
  assert.equal(tip.advice.id, 'b');
  assert.equal(tip.usdPerWeek, 11.2);
  assert.equal(tip.id, 'save:b');
});

test('a timed job whose times can be thinned is a saving tip too (owner, 2026-11-12)', () => {
  // Value: protects=a timed job's run less change, now one click, can be the tip; fails_when=the picker keeps only interval and model changes and the biggest saving on a timed job is never offered, or a run more on a timed job is offered as a saving; why_new=timed jobs got an applicable change on 2026-11-12, and the first test's table holds no timed change; seam=pure; no_claim=the card's wording (AllClearTipCard)
  const wk = [1, 2, 3, 4, 5];
  const when = { kind: 'when', from: { intervalMs: 86_400_000, weekly: { days: wk, minute: 540 } }, to: { intervalMs: 86_400_000, weekly: { days: [1, 3, 5], minute: 540 } } };
  const tip = T.pickAllClearTip(base({ advice: [runLess('a', 3), runLess('timed', 12, { change: when }), runLess('more', 40, { kind: 'run-more', change: when })] }));
  assert.equal(tip.kind, 'save');
  assert.equal(tip.advice.id, 'timed');
  assert.equal(tip.usdPerWeek, 12);
});

test('with no saving, a switched on connector no member may use', () => {
  // Value: protects=the second tip names a connector that is on and unused, never one a member already holds; fails_when=a granted connector is offered or the order is unstable; why_new=new tip; seam=pure; no_claim=connector switches themselves (claudeConnectors tests)
  const tip = T.pickAllClearTip(base({
    connectorsOn: [{ key: 'HubSpot', label: 'HubSpot' }, { key: 'Canva', label: 'Canva' }, { key: 'Asana', label: 'Asana' }],
    grantedKeys: new Set(['HubSpot'])
  }));
  assert.deepEqual(tip, { kind: 'connector', id: 'connector:Asana', key: 'Asana', label: 'Asana' });
});

test('nothing worth offering means no card', () => {
  // Value: protects=All clear stays plain when there is nothing to say; fails_when=an empty or filler tip is invented; why_new=new tip; seam=pure; no_claim=none beyond protects
  assert.equal(T.pickAllClearTip(base()), null);
  assert.equal(T.pickAllClearTip(base({ connectorsOn: [{ key: 'HubSpot', label: 'HubSpot' }], grantedKeys: new Set(['HubSpot']) })), null);
});

test('Not now hides a tip for a week and the next one shows meanwhile', () => {
  // Value: protects=a dismissed tip stays away for exactly a week and does not block the others; fails_when=it returns at once, never returns, or expired snoozes pile up; why_new=new tip; seam=pure; no_claim=browser storage (pinned below)
  const input = base({ advice: [runLess('b', 11)], connectorsOn: [{ key: 'Canva', label: 'Canva' }] });
  const snoozed = T.snoozeTip({ old: NOW - 1 }, 'save:b', NOW);
  assert.deepEqual(Object.keys(snoozed), ['save:b'], 'expired entries are dropped');
  assert.equal(snoozed['save:b'], NOW + T.TIP_SNOOZE_MS);
  assert.equal(T.pickAllClearTip({ ...input, snoozed }).kind, 'connector');
  assert.equal(T.pickAllClearTip({ ...input, snoozed, now: NOW + T.TIP_SNOOZE_MS }).kind, 'save', 'back after a week');
});

test('with no tip, what the team did today, in Pulse order and only what happened', () => {
  // Value: protects=the space is rarely empty: today's work shows when no tip qualifies, and only kinds that happened (owner, 2026-11-11); fails_when=empty kinds show, the order drifts from Pulse, or a missing snapshot throws; why_new=owner 2026-11-11; seam=pure; no_claim=Pulse's own counting
  const recap = T.todayRecap([
    { kind: 'check', total: 12, by: [], sub: 4 },
    { kind: 'sent', total: 0, by: [] },
    { kind: 'email', total: 14, by: [] },
    { kind: 'task', total: 3, by: [] }
  ]);
  assert.deepEqual(recap.map((o) => [o.kind, o.total]), [['email', 14], ['task', 3], ['check', 12]]);
  assert.deepEqual(T.todayRecap([]), []);
  assert.deepEqual(T.todayRecap(null), []);
});

test('the answer line shows the choice without "Picked:"', () => {
  // Value: protects=the summary reads as the owner's choice, not the record format; fails_when=the prefix shows or other answers are changed; why_new=new summary; seam=pure; no_claim=none beyond protects
  assert.equal(T.answerShort('Picked: Yes, both were us'), 'Yes, both were us');
  assert.equal(T.answerShort('Picked: Done. Note: posted at 9'), 'Done. Note: posted at 9');
  assert.equal(T.answerShort('1: Name them. 2: Yes'), '1: Name them. 2: Yes');
});

test('All clear shows one answer line and the tip card, not a stack of answer cards', () => {
  // Value: protects=the owner sees one quiet summary and at most one tip, outside the Needs you count; fails_when=answered cards come back, the tip shows while asks wait, or a tip action skips the existing apply paths; why_new=owner, 2026-11-10; seam=source pins; no_claim=a rendered column (renderer not run)
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  assert.ok(!/boardEmpty && answeredHere\.map/.test(ask), 'no stack of answered cards');
  assert.match(ask, /<AnswersSent answers=\{answeredHere\} godName=\{godName\} \/>/);
  assert.match(ask, /\{showAllClear && <AllClearTipCard godName=\{godName\} \/>\}/);
  const card = read('src/renderer/src/components/AllClearTipCard.tsx');
  assert.match(card, /window\.cth\.pulseApply\(a\.id, a\.change\)/, 'the same apply Pulse uses');
  assert.match(card, /pickAllClearTip\(/);
  assert.match(card, /new CustomEvent\('cth:open-settings', \{ detail: \{ section: 'Connections' \} \}\)/);
  assert.match(card, /snoozeTip\(/);
  assert.match(card, /window\.cth\.pulseSnapshot\('today', false\)/, 'one snapshot feeds the tip and the recap');
  assert.match(card, /if \(!tip\) \{[\s\S]{0,300}const lines = todayRecap\(outcomes\);\s*if \(!lines\.length\) return null;/, 'the recap only when no tip');
  assert.match(card, /t\(`pulse\.outcome\.\$\{o\.kind\}`, \{ sub: o\.sub \?\? 0 \}\)/, 'the words Pulse uses for each kind');
  assert.ok(!/useNeedsYou|count/.test(card.slice(card.indexOf('export function AllClearTipCard'))), 'never counted in Needs you');
  for (const loc of ['en']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    for (const k of ['save', 'idea', 'saveTitle', 'every', 'useModel', 'connectorTitle', 'connectorBody', 'openConnections', 'today', 'recapTitle', 'openPulse']) {
      assert.ok(typeof d.allClearTip?.[k] === 'string' && d.allClearTip[k], `${loc} allClearTip.${k}`);
      assert.ok(!/[–—]|\s-\s/.test(d.allClearTip[k]), `${loc} allClearTip.${k}: no dashes`);
    }
    for (const k of ['answerSent', 'answersSent', 'showAnswers', 'hideAnswers']) assert.ok(typeof d.askMe?.[k] === 'string' && d.askMe[k], `${loc} askMe.${k}`);
  }
});
