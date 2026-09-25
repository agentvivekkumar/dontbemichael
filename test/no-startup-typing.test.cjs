'use strict';

/**
 * Nothing is typed into Michael's terminal when he starts (owner, 2026-09-25):
 * no /remote-control and no orientation prompt. His startup instructions and
 * the standup sent when the office opens give him his first turn. Only an
 * engine that takes its protocol by typing (Crush's seedPrompt) still has it
 * typed, on a fresh spawn.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/hooks/useHive.ts'), 'utf8');

test('Michael gets no remote-control command or orientation prompt at start', () => {
  assert.doesNotMatch(src, /remoteControlCommandForProvider/);
  assert.doesNotMatch(src, /INITIAL_GOD_PROMPT/);
});

test('a seed prompt is still typed on a fresh spawn only', () => {
  assert.match(src, /if \(res\.seedPrompt && !resumedGod\) \{/);
});
