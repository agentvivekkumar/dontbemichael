'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  resolveModelForEngine,
  buildCodexExecArgs,
  buildGeminiHeadlessArgs,
  runHiddenModel,
} = loadTs('src/main/hiddenModel.ts');

test('resolveModelForEngine resolves model tiers per engine', () => {
  // Claude models
  assert.equal(resolveModelForEngine('claude', 'quick'), 'claude-haiku-4-5');
  assert.equal(resolveModelForEngine('claude', 'careful'), 'claude-sonnet-4-5');

  // Codex models
  assert.equal(resolveModelForEngine('codex', 'quick'), 'gpt-5-codex-mini');
  assert.equal(resolveModelForEngine('codex', 'careful'), 'gpt-5-codex');

  // Gemini models
  assert.equal(resolveModelForEngine('gemini', 'quick'), 'gemini-2.5-flash');
  assert.equal(resolveModelForEngine('gemini', 'careful'), 'gemini-2.5-pro');

  // Explicit override wins
  assert.equal(resolveModelForEngine('codex', 'quick', 'custom-model-slug'), 'custom-model-slug');
});

test('buildCodexExecArgs generates tool-stripped headless flags', () => {
  const prompt = 'check email standing approval fit';
  const tempDir = '/tmp/test-codex';
  const outputFile = '/tmp/test-codex/answer.txt';

  const fullArgs = buildCodexExecArgs(prompt, 'gpt-5-codex-mini', tempDir, outputFile, true);

  // Verifies baseline headless sandbox
  assert.equal(fullArgs[0], 'exec');
  assert.ok(fullArgs.includes('--ephemeral'));
  assert.ok(fullArgs.includes('--ignore-user-config'));
  assert.ok(fullArgs.includes('--skip-git-repo-check'));
  assert.ok(fullArgs.includes('-s') && fullArgs[fullArgs.indexOf('-s') + 1] === 'read-only');
  assert.ok(fullArgs.includes('-C') && fullArgs[fullArgs.indexOf('-C') + 1] === tempDir);
  assert.ok(fullArgs.includes('--model') && fullArgs[fullArgs.indexOf('--model') + 1] === 'gpt-5-codex-mini');

  // Verifies safety isolation (tools disabled for prompt injection prevention)
  assert.ok(fullArgs.includes('--disable') && fullArgs.includes('shell_tool'));
  assert.ok(fullArgs.includes('unified_exec'));
  assert.ok(fullArgs.includes('apps'));
  assert.ok(fullArgs.includes('browser_use'));
  assert.ok(fullArgs.includes('web_search=disabled'));

  // Output file and prompt as final args
  assert.ok(fullArgs.includes('-o') && fullArgs[fullArgs.indexOf('-o') + 1] === outputFile);
  assert.equal(fullArgs[fullArgs.length - 1], prompt);
});

test('buildGeminiHeadlessArgs formats non-interactive flags', () => {
  const prompt = 'distinct job check';
  const args = buildGeminiHeadlessArgs(prompt, 'gemini-2.5-flash', true);

  assert.ok(args.includes('--model') && args[args.indexOf('--model') + 1] === 'gemini-2.5-flash');
  assert.ok(args.includes('--approval-mode=yolo'));
  assert.ok(args.includes('-p') && args[args.indexOf('-p') + 1] === prompt);
});

test('runHiddenModel fails closed immediately on unsupported engine', async () => {
  const res = await runHiddenModel('test prompt', {
    engine: 'custom',
    cwd: process.cwd(),
  });

  assert.equal(res.ok, false);
  assert.equal(res.engine, 'custom');
  assert.match(res.error, /engine_unavailable/);
});
