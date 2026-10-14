'use strict';

/**
 * #358: a Codex office spent money but its lifetime cost stayed $0, because
 * the breaker beat only appended samples with a live OTel session id and the
 * transcript fallback (Codex's only usage source) always has none.
 * costLedgerRow lets a fallback sample in under its transcript's session id,
 * once per change, and the lifetime fold then counts it like any other row.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { costLedgerRow } = loadTs('src/main/telemetry.ts');
const { lifetimeUsdFromLedger } = loadTs('src/main/costLifetime.ts');

function sample(over) {
  return {
    agentId: 'codex-1', sessionId: '', ts: 1, input: 100, output: 10,
    cacheRead: 0, cacheCreation: 0, model: 'gpt-5', usd: 0.5, ...over
  };
}

/** The row hive.appendCostLedger writes, as one ledger line. */
function line(s) {
  return JSON.stringify({
    agent_id: s.agentId, session_id: s.sessionId, ts: s.ts, input: s.input, output: s.output,
    cache_read: s.cacheRead, cache_creation: s.cacheCreation, model: s.model, usd: s.usd
  });
}

/** Run the beat's append step over a run of samples and return the ledger text. */
function beats(samples) {
  const last = new Map();
  return samples.map((s) => costLedgerRow(s, last)).filter(Boolean).map(line).join('\n');
}

test('a live OTel sample is written as it is, every beat', () => {
  const last = new Map();
  const live = sample({ agentId: 'claude-1', sessionId: 'otel-s' });
  assert.equal(costLedgerRow(live, last), live);
  assert.equal(costLedgerRow(live, last), live);
});

test('a fallback sample with no transcript session is not written', () => {
  assert.equal(costLedgerRow(sample({}), new Map()), null);
  assert.equal(costLedgerRow(null, new Map()), null);
});

test('a Codex fallback sample is written under its transcript session id', () => {
  const row = costLedgerRow(sample({ transcriptSessionId: 'rollout-s' }), new Map());
  assert.equal(row.sessionId, 'rollout-s');
  assert.equal(row.usd, 0.5);
  assert.equal('transcriptSessionId' in row, false, 'the ledger row keeps its usual shape');
});

test('a frozen transcript is written once, not on every beat', () => {
  const s = sample({ transcriptSessionId: 'rollout-s' });
  const text = beats([s, s, s, sample({ transcriptSessionId: 'rollout-s', usd: 0.8, output: 20 }), s]);
  assert.equal(text.split('\n').length, 3, 'one row per change');
});

test('repeated beats for one session fold to that session\'s peak', () => {
  const text = beats([
    sample({ transcriptSessionId: 's1', usd: 0.5 }),
    sample({ transcriptSessionId: 's1', usd: 1.25, output: 20 }),
    sample({ transcriptSessionId: 's1', usd: 1.25, output: 20 }),
    sample({ transcriptSessionId: 's1', usd: 2, output: 30 })
  ]);
  assert.equal(lifetimeUsdFromLedger(text).get('codex-1'), 2);
});

test('a new session id after a restart adds to the total instead of merging', () => {
  const text = beats([
    sample({ transcriptSessionId: 's1', usd: 2 }),
    sample({ transcriptSessionId: 's2', usd: 0.25 }),
    sample({ transcriptSessionId: 's2', usd: 0.75, output: 20 })
  ]);
  assert.equal(lifetimeUsdFromLedger(text).get('codex-1'), 2.75);
});

test('a resumed session keeps its id and is not counted twice', () => {
  // Codex's rollout total is cumulative for the whole session, so a resume that
  // reads the same total again must not add it a second time.
  const before = beats([sample({ transcriptSessionId: 's1', usd: 2 })]);
  const after = beats([sample({ transcriptSessionId: 's1', usd: 2 }), sample({ transcriptSessionId: 's1', usd: 3, output: 20 })]);
  assert.equal(lifetimeUsdFromLedger(`${before}\n${after}`).get('codex-1'), 3);
});

test('index.ts appends through costLedgerRow, not the old live-only gate', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/index.ts'), 'utf8');
  assert.match(src, /const ledgerRow = costLedgerRow\(sample, lastFallbackLedgerRow\);/);
  assert.doesNotMatch(src, /if \(sample\?\.sessionId\) hive\.appendCostLedger\(sample\)/);
});
