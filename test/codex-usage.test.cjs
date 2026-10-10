'use strict';

/**
 * readCodexUsage: a Codex agent's token usage from its rollout transcripts.
 * Records below are trimmed from a real Codex CLI rollout (token_count events
 * carry the session's running total; input includes cached tokens).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { readCodexUsage, findRollout } = loadTs('src/main/codexUsage.ts');

const SID = '019f389f-690d-7e41-9fc2-dbf46e83b18a';

function tokenCount(input, cached, output, reasoning) {
  const t = { input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output };
  return JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: t, last_token_usage: t } } });
}
const turnContext = (model) => JSON.stringify({ type: 'turn_context', payload: { model, cwd: '/tmp/x' } });
const meta = JSON.stringify({ type: 'session_meta', payload: { id: SID } });

function makeHome(lines, sid = SID) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  const day = path.join(home, 'sessions', '2026', '07', '06');
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, `rollout-2026-07-06T14-10-02-${sid}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => `${l}\n`).join(''));
  return { home, file };
}

test('the last running total wins, with cached input split out', () => {
  const { home } = makeHome([
    meta,
    turnContext('gpt-5'),
    tokenCount(12811, 9600, 231, 0),
    tokenCount(29879, 19200, 642, 108)
  ]);
  const u = readCodexUsage(home, SID);
  assert.equal(u.inputTokens, 29879 - 19200);
  assert.equal(u.cacheReadTokens, 19200);
  assert.equal(u.outputTokens, 642);
  assert.equal(u.cacheWriteTokens, 0);
  assert.equal(u.model, 'gpt-5');
  const expected = (10679 * 1.25 + 642 * 10 + 19200 * 0.125) / 1_000_000;
  assert.ok(Math.abs(u.estimatedCostUsd - expected) < 1e-12);
});

test('appended turns are picked up on the next read', () => {
  const { home, file } = makeHome([turnContext('gpt-5'), tokenCount(100, 0, 10, 0)]);
  assert.equal(readCodexUsage(home, SID).outputTokens, 10);
  fs.appendFileSync(file, `${tokenCount(300, 100, 40, 0)}\n`);
  const u = readCodexUsage(home, SID);
  assert.equal(u.outputTokens, 40);
  assert.equal(u.cacheReadTokens, 100);
});

test('a torn last line is not counted until it is complete', () => {
  const { home, file } = makeHome([turnContext('gpt-5'), tokenCount(100, 0, 10, 0)]);
  const next = tokenCount(500, 0, 99, 0);
  fs.appendFileSync(file, next.slice(0, 30));
  assert.equal(readCodexUsage(home, SID).outputTokens, 10);
  fs.appendFileSync(file, `${next.slice(30)}\n`);
  assert.equal(readCodexUsage(home, SID).outputTokens, 99);
});

test('rate-limit-only updates (info: null) leave the totals alone', () => {
  const { home } = makeHome([
    turnContext('gpt-5'),
    tokenCount(100, 0, 10, 0),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: null } })
  ]);
  assert.equal(readCodexUsage(home, SID).outputTokens, 10);
});

test('another session in the same home is not counted', () => {
  const { home } = makeHome([turnContext('gpt-5'), tokenCount(100, 0, 10, 0)]);
  const u = readCodexUsage(home, '019f0000-0000-7000-8000-000000000000');
  assert.equal(u.outputTokens, 0);
  assert.equal(u.estimatedCostUsd, 0);
});

test('a missing home or a path-like session id reads as zero', () => {
  assert.equal(readCodexUsage(path.join(os.tmpdir(), 'no-such-codex-home'), SID).inputTokens, 0);
  const { home } = makeHome([tokenCount(100, 0, 10, 0)]);
  assert.equal(findRollout(home, '../../etc'), null);
});
