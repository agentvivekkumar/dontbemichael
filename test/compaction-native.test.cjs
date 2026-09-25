'use strict';

/**
 * Compaction is Claude Code's own auto compact (owner, 2026-09-25). The app no
 * longer types /compact into idle terminals on a clock; it only sets where
 * Claude Code compacts, at spawn. The owner's optional auto-clear stays.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const { DEFAULT_CONTEXT_TRIGGER, AUTO_COMPACT_WINDOW_TOKENS } = loadTs('src/shared/triggers.ts');
const main = read('src/main/index.ts');

test('no context upkeep runs on a clock: not compaction, not clearing', () => {
  assert.equal(DEFAULT_CONTEXT_TRIGGER.compact.enabled, false);
  assert.equal(DEFAULT_CONTEXT_TRIGGER.clear.enabled, false);
  const at = main.indexOf('function syncContextTriggers(): void {');
  assert.match(main.slice(at, main.indexOf('\n}\n', at)), /^function syncContextTriggers\(\): void \{\s*\/\/[\s\S]*clearContextTimers\(\);$/);
  assert.doesNotMatch(main, /emitContextTrigger/);
  assert.doesNotMatch(main, /mission:autoCompact/);
  assert.doesNotMatch(read('src/preload/index.ts'), /onAutoCompact/);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../src/renderer/src/components/triggers/ContextSection.tsx')), false);
});

test('every Claude agent starts with Claude Code compacting at 300k, clamped to its window', () => {
  assert.equal(AUTO_COMPACT_WINDOW_TOKENS, 300000);
  assert.match(main, /CLAUDE_CODE_AUTO_COMPACT_WINDOW: String\(AUTO_COMPACT_WINDOW_TOKENS\)/);
  assert.match(main, /if \(!process\.env\.CLAUDE_CODE_AUTO_COMPACT_WINDOW && !opts\.env\?\.CLAUDE_CODE_AUTO_COMPACT_WINDOW\)/, 'the owner\'s own value wins');
});
