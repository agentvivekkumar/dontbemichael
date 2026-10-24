'use strict';

/**
 * Claude Fable was missing from the fallback price table, so a Fable agent
 * was costed using the Sonnet row, which is about one-fifth of Fable's real
 * price. Fable rows are now listed explicitly (#556).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const bundledCatalog = require('../src/shared/modelCatalog.json');
const docsCatalog = require('../docs/model-catalog.json');

const { priceFor, knownPrice } = loadTs('src/main/pricing.ts');

test('Fable 5.1 is priced at Anthropic list rates, not Sonnet rates', () => {
  // Fable 5.1 published pricing: input $10, output $50, cache write $12.5,
  // cache read $0.25 (all per million tokens).
  const p = priceFor('claude-fable-5-1');
  assert.equal(p.inputPerM, 10);
  assert.equal(p.outputPerM, 50);
  assert.equal(p.cacheWritePerM, 12.5);
  assert.equal(p.cacheReadPerM, 0.25);
});

test('Fable 5 is priced at its own row, not the Sonnet default', () => {
  const p = priceFor('claude-fable-5');
  assert.equal(p.inputPerM, 10);
  assert.equal(p.outputPerM, 50);
  assert.equal(p.cacheWritePerM, 12.5);
  assert.equal(p.cacheReadPerM, 1.0);
});

test('Fable 5.1 with a [1m] context suffix still resolves correctly', () => {
  const p = priceFor('claude-fable-5-1[1m]');
  assert.equal(p.inputPerM, 10);
  assert.equal(p.outputPerM, 50);
});

test('Fable 5.1 thinking-high variant resolves to Fable 5.1 prices', () => {
  // The Cursor provider uses this model id.
  const p = priceFor('claude-fable-5-1-thinking-high');
  assert.equal(p.inputPerM, 10);
  assert.equal(p.outputPerM, 50);
});

test('knownPrice returns the Fable output rate, not undefined', () => {
  assert.equal(knownPrice('claude-fable-5-1'), 50);
  assert.equal(knownPrice('claude-fable-5'), 50);
});

test('both catalog files have "tier": "top" on every Fable row', () => {
  for (const [name, catalog] of [['src/shared/modelCatalog.json', bundledCatalog], ['docs/model-catalog.json', docsCatalog]]) {
    const fableRows = (catalog.providers.claude ?? []).filter((r) => r.id?.includes('fable'));
    assert.ok(fableRows.length >= 2, `${name}: expected at least two Fable rows`);
    for (const row of fableRows) {
      assert.equal(row.tier, 'top', `${name}: ${row.id} should have tier "top"`);
    }
  }
});
