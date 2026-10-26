'use strict';

/**
 * Fable is the default model but had no price row (it fell back to Sonnet, at
 * under a third of its real price) and no tier (so Pulse gave it no model advice).
 * It now has both. List prices: platform.claude.com/docs/en/about-claude/pricing
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { priceFor, knownPrice, estimateCostUsd } = loadTs('src/main/pricing.ts');
const { nextTier } = loadTs('src/shared/teamAdvice.ts');

test('Fable 5.1 and Fable 5 resolve to Fable rows, differing only in cache reads', () => {
  // Value: protects=Fable cost estimates; fails_when=Fable falls back to the Sonnet row again; why_new=no Fable row existed; seam=none; no_claim=live telemetry cost
  for (const id of ['claude-fable-5-1', 'claude-fable-5-1[1m]', 'claude-fable-5-1-thinking-high', 'Claude-Fable-5.1']) {
    const p = priceFor(id);
    assert.equal(p.inputPerM, 10, id);
    assert.equal(p.outputPerM, 50, id);
    assert.equal(p.cacheWritePerM, 12.5, id);
    assert.equal(p.cacheReadPerM, 0.25, id);
  }
  for (const id of ['claude-fable-5', 'claude-fable-5[1m]']) {
    assert.equal(priceFor(id).outputPerM, 50, id);
    assert.equal(priceFor(id).cacheReadPerM, 1, id);
  }
  assert.equal(priceFor('claude-fable-5-10').cacheReadPerM, 1, 'a later id is not 5.1');
  assert.ok(Math.abs(estimateCostUsd('claude-fable-5-1', { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 0, cacheWriteTokens: 0 }) - 60) < 1e-9);
});

test('knownPrice lists Fable so Pulse can project a saving', () => {
  // Value: protects=Pulse saving projection; fails_when=Fable has no known price; why_new=knownPrice skipped Fable; seam=none; no_claim=other families
  assert.equal(knownPrice('claude-fable-5-1'), 50);
  assert.equal(knownPrice('claude-fable-5'), 50);
  assert.equal(knownPrice('claude-sonnet-5'), 15);
  assert.equal(knownPrice('some-local-model'), undefined);
});

test('the Claude Fable catalog rows are top tier in both catalogs, so Pulse can step them down', () => {
  // Value: protects=model advice for the default model; fails_when=a Claude Fable row loses its tier; why_new=Fable had no tier; seam=none; no_claim=cursor provider rows
  for (const file of ['docs/model-catalog.json', 'src/shared/modelCatalog.json']) {
    const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
    const rows = cat.providers.claude;
    const fable = rows.filter((m) => m.id === 'claude-fable-5-1' || m.id === 'claude-fable-5');
    assert.equal(fable.length, 2, file);
    for (const m of fable) assert.equal(m.tier, 'top', `${file} ${m.id}`);
    const ladder = rows.map((m) => ({ provider: 'claude', id: m.id, label: m.label, tier: m.tier }));
    assert.equal(nextTier(ladder, 'claude', 'claude-fable-5-1', -1).tier, 'middle');
  }
});
