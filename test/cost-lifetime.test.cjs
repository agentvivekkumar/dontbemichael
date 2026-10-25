'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { CostLedgerTotals, lifetimeUsdFromLedger } = loadTs('src/main/costLifetime.ts');

/** One ledger row in the exact shape appendCostLedger writes. */
function row(agent, session, usd) {
  return JSON.stringify({
    agent_id: agent, session_id: session, ts: 0,
    input: 0, output: 0, cache_read: 0, cache_creation: 0, model: '', usd
  });
}

function ledgerWith(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cost-'));
  const p = path.join(dir, 'cost-ledger.jsonl');
  fs.writeFileSync(p, lines.length ? `${lines.join('\n')}\n` : '');
  return p;
}

async function totalsFor(lines) {
  const t = new CostLedgerTotals();
  await t.refreshFully(ledgerWith(lines));
  return t;
}

test('no reset: lifetime is simply the last cumulative value', async () => {
  const t = await totalsFor([row('a', 's1', 1), row('a', 's1', 5), row('a', 's1', 9.25)]);
  assert.equal(t.usdFor('a'), 9.25);
});

test('one reset: the pre-reset peak is added to the open segment', async () => {
  // climbs to 20, restarts at 0, climbs to 3  ->  23, not 3
  const t = await totalsFor([
    row('a', 's1', 8), row('a', 's1', 20),
    row('a', 's1', 0), row('a', 's1', 3)
  ]);
  assert.equal(t.usdFor('a'), 23);
});

test('several resets in one session all accumulate', async () => {
  const t = await totalsFor([
    row('a', 's1', 10), row('a', 's1', 0),
    row('a', 's1', 7), row('a', 's1', 0),
    row('a', 's1', 2)
  ]);
  assert.equal(t.usdFor('a'), 19);
});

test('a sub-dollar reset still counts (a $1 threshold would miss this)', async () => {
  // Both of these occur in the live ledger: 0.92 -> 0.00 and 0.73 -> 0.00.
  const t = await totalsFor([
    row('a', 's1', 0.92), row('a', 's1', 0), row('a', 's1', 0.4)
  ]);
  assert.equal(Number(t.usdFor('a').toFixed(4)), 1.32);
});

test('the reset keeps the SAME session_id, which is the whole bug', async () => {
  const t = await totalsFor([row('a', 'same', 30), row('a', 'same', 0), row('a', 'same', 1)]);
  assert.equal(t.usdFor('a'), 31);
});

test('separate sessions for one agent sum together', async () => {
  const t = await totalsFor([row('a', 's1', 4), row('a', 's2', 6)]);
  assert.equal(t.usdFor('a'), 10);
});

test('agents are kept apart, and floorTotal sums the floor', async () => {
  const t = await totalsFor([
    row('a', 's1', 10), row('a', 's1', 0), row('a', 's1', 1),
    row('b', 's2', 5)
  ]);
  assert.equal(t.usdFor('a'), 11);
  assert.equal(t.usdFor('b'), 5);
  assert.equal(t.floorTotal(), 16);
});

test('an unknown agent is 0 once warm, and null before any fold', async () => {
  const cold = new CostLedgerTotals();
  assert.equal(cold.usdFor('nobody'), null, 'cold must not claim $0 as fact');
  assert.equal(cold.ready, false);
  const t = await totalsFor([row('a', 's1', 1)]);
  assert.equal(t.ready, true);
  assert.equal(t.usdFor('nobody'), 0);
});

test('INCREMENTAL: folding in two passes equals folding in one', async () => {
  const first = [row('a', 's1', 8), row('a', 's1', 20)];
  const rest = [row('a', 's1', 0), row('a', 's1', 3)];

  const p = ledgerWith(first);
  const t = new CostLedgerTotals();
  await t.refreshFully(p);
  assert.equal(t.usdFor('a'), 20);

  fs.appendFileSync(p, `${rest.join('\n')}\n`);
  await t.refreshFully(p);
  assert.equal(t.usdFor('a'), 23, 'appended lines must fold onto existing state');

  const oneShot = await totalsFor([...first, ...rest]);
  assert.equal(t.usdFor('a'), oneShot.usdFor('a'));
});

test('INCREMENTAL: a half-written trailing line is not lost or double counted', async () => {
  const p = ledgerWith([row('a', 's1', 5)]);
  const partial = row('a', 's1', 11);
  fs.appendFileSync(p, partial.slice(0, 20)); // torn mid-write, no newline

  const t = new CostLedgerTotals();
  await t.refreshFully(p);
  assert.equal(t.usdFor('a'), 5, 'the torn line must not be parsed');

  fs.appendFileSync(p, `${partial.slice(20)}\n`); // writer finishes the line
  await t.refreshFully(p);
  assert.equal(t.usdFor('a'), 11, 'the completed line must be folded exactly once');
});

test('re-reading an unchanged ledger does not double count', async () => {
  const p = ledgerWith([row('a', 's1', 10), row('a', 's1', 0), row('a', 's1', 4)]);
  const t = new CostLedgerTotals();
  await t.refreshFully(p);
  await t.refreshFully(p);
  await t.refreshFully(p);
  assert.equal(t.usdFor('a'), 14);
});

test('truncation or rotation rebuilds from scratch instead of going negative', async () => {
  const p = ledgerWith([row('a', 's1', 10), row('a', 's1', 25)]);
  const t = new CostLedgerTotals();
  await t.refreshFully(p);
  assert.equal(t.usdFor('a'), 25);

  fs.writeFileSync(p, `${row('a', 's1', 2)}\n`); // rotated: smaller than the offset
  await t.refreshFully(p);
  assert.equal(t.usdFor('a'), 2, 'stale offset must not survive a truncation');
});

test('malformed and empty lines are skipped, not fatal', async () => {
  const p = ledgerWith([row('a', 's1', 3)]);
  fs.appendFileSync(p, '\nnot json at all\n{"agent_id":null}\n');
  fs.appendFileSync(p, `${row('a', 's1', 7)}\n`);
  const t = new CostLedgerTotals();
  await t.refreshFully(p);
  assert.equal(t.usdFor('a'), 7);
});

test('a missing ledger leaves the last good totals in place', async () => {
  const p = ledgerWith([row('a', 's1', 9)]);
  const t = new CostLedgerTotals();
  await t.refreshFully(p);
  await t.refresh(path.join(path.dirname(p), 'does-not-exist.jsonl'));
  assert.equal(t.usdFor('a'), 9);
});

test('a non-numeric usd is treated as 0 rather than NaN-poisoning the total', async () => {
  const p = ledgerWith([row('a', 's1', 5)]);
  fs.appendFileSync(p, `${JSON.stringify({ agent_id: 'a', session_id: 's1', usd: 'lots' })}\n`);
  const t = new CostLedgerTotals();
  await t.refreshFully(p);
  assert.equal(Number.isFinite(t.usdFor('a')), true);
  assert.equal(t.usdFor('a'), 5);
});

test('lifetimeUsdFromLedger gives the same totals with or without a trailing newline', () => {
  const lines = [row('a', 's1', 10), row('a', 's1', 0), row('a', 's1', 4)];
  const withNewline = lifetimeUsdFromLedger(`${lines.join('\n')}\n`);
  const withoutNewline = lifetimeUsdFromLedger(lines.join('\n'));
  assert.equal(withNewline.get('a'), 14);
  assert.equal(withoutNewline.get('a'), 14);
});

// ─── the breaker beat feeds the ledger and Pulse one session at a time ──────

const { TelemetryCollector } = loadTs('src/main/telemetry.ts');
const { SessionCostRecorder } = loadTs('src/main/sessionCost.ts');
const { CostFold } = loadTs('src/shared/costFold.ts');

function costBatch(agent, session, usd) {
  return {
    resourceMetrics: [{
      resource: { attributes: [{ key: 'agent.id', value: { stringValue: agent } }] },
      scopeMetrics: [{ metrics: [{ name: 'claude_code.cost.usage', sum: { dataPoints: [{ asDouble: usd, attributes: [
        { key: 'session.id', value: { stringValue: session } },
        { key: 'model', value: { stringValue: 'claude-opus-4-8[1m]' } }
      ] }] } }] }]
    }]
  };
}

test('a session cleared mid run is counted once in the ledger and in Pulse', () => {
  // safeClearer types /clear into the live PTY and Claude Code goes on under a
  // new session id while the collector keeps the old session's totals. The
  // beat used to write the aggregate ($10 + $1) under the new id, so lifetime
  // cost and Pulse both came to $21 for $11 of spending.
  const telemetry = new TelemetryCollector();
  telemetry.tokenFor('a1');
  const ingest = (session, usd) => telemetry.ingestMetrics(costBatch('a1', session, usd), 'a1');
  const recorder = new SessionCostRecorder();
  const ledger = [];
  const pulse = new CostFold();
  let pulseUsd = 0;
  const sinks = {
    // The row exactly as hive.appendCostLedger writes it.
    ledger: (s) => ledger.push(JSON.stringify({
      agent_id: s.agentId, session_id: s.sessionId, ts: s.ts, input: s.input, output: s.output,
      cache_read: s.cacheRead, cache_creation: s.cacheCreation, model: s.model, usd: s.usd
    })),
    pulse: (agentId, session, usd) => { pulseUsd += pulse.add(`${agentId}\t${session}`, usd); }
  };
  const beat = () => recorder.record(telemetry.sessionSamples('a1'), sinks);

  ingest('before-clear', 4); beat();
  ingest('before-clear', 6); beat();
  ingest('after-clear', 1); beat();
  beat(); beat(); // idle beats

  assert.equal(lifetimeUsdFromLedger(ledger.join('\n')).get('a1'), 11);
  assert.equal(pulseUsd, 11);
  // A late point for the old session grows only the old session.
  ingest('before-clear', 2); beat();
  assert.equal(lifetimeUsdFromLedger(ledger.join('\n')).get('a1'), 13);
  assert.equal(pulseUsd, 13);
  // A session whose totals did not move gets no new row: idle beats and the
  // quiet session add nothing to a ledger that is never trimmed.
  assert.equal(ledger.length, 4);
  // The breaker and the cost cap still see the whole agent.
  assert.equal(telemetry.getAgentUsage('a1').usd, 13);
});

test('the breaker beat records cost per session, not the aggregate', () => {
  // index.ts cannot be loaded under plain Node, so check the beat's wiring in
  // its source: the per session recorder is fed, and the aggregate sample is
  // not written to the ledger or handed to Pulse under a live session id.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  const start = src.indexOf('function runBreakerBeat(');
  const end = src.indexOf('breaker.tick(', start);
  assert.ok(start !== -1 && end > start, 'runBreakerBeat not found in index.ts');
  const beat = src.slice(start, end);
  assert.match(beat, /sessionCost\.record\(telemetry\.sessionSamples\(id\)/);
  assert.doesNotMatch(beat, /appendCostLedger\(sample\)/);
  assert.doesNotMatch(beat, /pulseTelemetry\.cost\(id,\s*sample\.sessionId/);
});

