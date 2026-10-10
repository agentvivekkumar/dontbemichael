'use strict';

/**
 * A Codex agent sends no OTel to the collector and leaves no transcripts
 * where the default reader looks, so getAgentUsage() returned null for it on
 * every beat: the breaker's token caps, the cost caps and the cost views
 * never saw it spend.
 * With resolveCodexHome wired (hive.codexHome in index.ts) the fallback reads
 * the session's rollout in that agent's CODEX_HOME.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;

const loadTs = require('./load-ts.cjs');
const { TelemetryCollector } = loadTs('src/main/telemetry.ts');

const SID = '019f4a00-1111-7222-8333-444455556666';

function codexHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  const day = path.join(home, 'sessions', '2026', '10', '08');
  fs.mkdirSync(day, { recursive: true });
  const t = { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 300, reasoning_output_tokens: 50, total_tokens: 5300 };
  fs.writeFileSync(path.join(day, `rollout-2026-10-08T09-00-00-${SID}.jsonl`), [
    JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: t } } })
  ].join('\n') + '\n');
  return home;
}

test('a Codex agent gets a usage sample from its rollout', () => {
  const home = codexHome();
  const telemetry = new TelemetryCollector({
    resolveCwd: () => fs.mkdtempSync(path.join(os.tmpdir(), 'proj-')),
    resolveSessionId: () => SID,
    resolveCodexHome: () => home
  });
  const s = telemetry.getAgentUsage('codex-worker');
  assert.ok(s, 'expected a sample');
  assert.equal(s.input, 1000);
  assert.equal(s.cacheRead, 4000);
  assert.equal(s.output, 300);
  assert.equal(s.model, 'gpt-5');
  assert.ok(s.usd > 0);
  assert.equal(s.sessionId, '', 'fallback samples stay out of the cost-ledger dedup gate');
});

test('without a session id a Codex agent still reports no data', () => {
  const telemetry = new TelemetryCollector({
    resolveCwd: () => os.tmpdir(),
    resolveSessionId: () => undefined,
    resolveCodexHome: () => codexHome()
  });
  assert.equal(telemetry.getAgentUsage('codex-worker'), null);
});

test('an agent without a CODEX_HOME keeps the transcript path', () => {
  const telemetry = new TelemetryCollector({
    resolveCwd: () => fs.mkdtempSync(path.join(os.tmpdir(), 'proj-')),
    resolveSessionId: () => SID,
    resolveCodexHome: () => null
  });
  assert.equal(telemetry.getAgentUsage('other-worker'), null);
});

test('index.ts wires the hive\'s Codex home into the collector', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/index.ts'), 'utf8');
  assert.match(src, /resolveCodexHome: \(agentId\) => hive\.codexHome\(agentId\)/);
});
