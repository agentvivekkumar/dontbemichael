'use strict';

/**
 * The fallback price table had no GPT rows, so a Codex agent on gpt-5 got
 * the default row: about 2.4x its input price and 1.5x its output price.
 * GPT models now resolve to OpenAI rows.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { priceFor, estimateCostUsd } = loadTs('src/main/pricing.ts');

test('GPT models are priced as OpenAI models, not with the default row', () => {
  assert.equal(priceFor('gpt-5').inputPerM, 1.25);
  assert.equal(priceFor('gpt-5.5').outputPerM, 10);
  assert.equal(priceFor('gpt-5-codex').inputPerM, 1.25);
  assert.equal(priceFor('GPT-5-mini').inputPerM, 0.25);
  assert.equal(priceFor('gpt-5-nano').outputPerM, 0.4);
});

test('OpenAI rows bill no cache writes', () => {
  const usd = estimateCostUsd('gpt-5', {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    cacheWriteTokens: 1_000_000
  });
  assert.equal(usd, 1.25 + 10 + 0.125);
});

test('an unknown model still gets the default row', () => {
  assert.equal(priceFor('some-local-model').inputPerM, 3);
  assert.equal(priceFor(undefined).inputPerM, 3);
});
