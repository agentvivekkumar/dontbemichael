'use strict';

/**
 * Provider gate on the transcript fallback.
 *
 * TelemetryCollector.getAgentUsage() falls back to transcriptFallback() when an
 * agent has no live OTel data yet. That fallback picked a reader by a single
 * check: Codex home present -> read the Codex rollout, otherwise -> read
 * Claude Code's transcripts. So a Gemini (or Grok, Kimi, ...) agent working in
 * a repo whose Claude project directory already held history got Claude's
 * tokens attributed to it: wrong provider, wrong numbers, and the circuit
 * breaker + cost ledger then acted on someone else's spend.
 *
 * The fix resolves the agent's engine provider (wired to the hive registry in
 * index.ts) and reports no data for any provider the readers do not know,
 * instead of misreading Claude's history as that agent's own. This is the
 * same rule D11 established for shared cwds: no data beats someone else's
 * history. Behavior for claude, codex, and unknown-provider agents is
 * unchanged.
 *
 * Sandboxes HOME so projectDir() maps into a throwaway dir, never the real
 * ~/.claude/projects (mirrors test/transcript-usage.test.cjs).
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
const { projectDir } = loadTs('src/main/transcript.ts');

function assistantRecord(sessionId, outputTokens) {
  return JSON.stringify({
    type: 'assistant',
    sessionId,
    message: {
      model: 'claude-sonnet-5',
      usage: {
        input_tokens: 100,
        output_tokens: outputTokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0
      }
    }
  });
}

/** A cwd whose Claude project directory already carries a foreign session's
 *  history, the way a long-lived shared repo does. */
function makeProjectWithHistory() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  const dir = projectDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const foreignLines = Array.from({ length: 20 }, () => assistantRecord('foreign-session', 50_000));
  fs.writeFileSync(path.join(dir, 'foreign-session.jsonl'), `${foreignLines.join('\n')}\n`);
  return { cwd, dir };
}

function collectorFor(cwd, provider) {
  return new TelemetryCollector({
    resolveCwd: () => cwd,
    resolveSessionId: () => 'my-session',
    resolveProvider: () => provider
  });
}

test('a gemini agent reports no usage instead of Claude history from its cwd', () => {
  const { cwd } = makeProjectWithHistory();
  const telemetry = collectorFor(cwd, 'gemini');
  // Pre-fix this returned the foreign session's ~1,000,000 output tokens.
  assert.equal(telemetry.getAgentUsage('worker-x'), null);
});

test('every other non-reader provider is gated the same way', () => {
  const { cwd } = makeProjectWithHistory();
  for (const provider of ['grok', 'kimi', 'qwen', 'opencode', 'crush', 'copilot', 'cursor']) {
    const telemetry = collectorFor(cwd, provider);
    assert.equal(telemetry.getAgentUsage('worker-x'), null, `provider ${provider} must not read Claude transcripts`);
  }
});

test('a claude agent still reads its own session', () => {
  const { cwd, dir } = makeProjectWithHistory();
  fs.writeFileSync(path.join(dir, 'my-session.jsonl'), `${assistantRecord('my-session', 10)}\n`);
  const telemetry = collectorFor(cwd, 'claude');
  const sample = telemetry.getAgentUsage('worker-x');
  assert.ok(sample, 'expected a sample from the agent\'s own transcript');
  assert.equal(sample.output, 10, 'must not include the foreign session\'s tokens');
});

test('an unknown provider keeps the previous behavior', () => {
  const { cwd, dir } = makeProjectWithHistory();
  fs.writeFileSync(path.join(dir, 'my-session.jsonl'), `${assistantRecord('my-session', 10)}\n`);
  const telemetry = collectorFor(cwd, undefined);
  const sample = telemetry.getAgentUsage('worker-x');
  assert.ok(sample, 'an agent with no known provider must keep the old fallback');
  assert.equal(sample.output, 10);
});

test('a codex agent without a CODEX_HOME never falls back to Claude history', () => {
  const { cwd } = makeProjectWithHistory();
  const telemetry = new TelemetryCollector({
    resolveCwd: () => cwd,
    resolveSessionId: () => 'my-session',
    resolveProvider: () => 'codex',
    resolveCodexHome: () => null // e.g. no hive root: the rollout reader has nothing to read
  });
  // Pre-fix this fell through to readAgentUsage and returned the foreign
  // Claude session's ~1,000,000 output tokens as the Codex agent's own.
  assert.equal(telemetry.getAgentUsage('worker-x'), null);
});
