'use strict';

/**
 * Setup asks for Michael's engine and model only (owner, 2026-09-26: "what is
 * picked for michael should become default for all agents"). It used to save
 * godProvider/godModel and nothing else, so the starter team and every later
 * hire started on the stock default (Claude, claude-fable-5) whatever Michael
 * ran on. Finishing setup now also writes the team's defaults: defaultCommand
 * for the engine, and defaultModel (Claude) or providerDefaultModels (others).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { teamDefaultsFromMichael } = loadTs('src/renderer/src/store/config.ts');
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test('a Claude pick sets the team default model and keeps the command', () => {
  const patch = teamDefaultsFromMichael({ defaultCommand: 'claude --verbose' }, 'claude', 'claude-opus-5-5');
  assert.deepEqual(patch, { defaultModel: 'claude-opus-5-5' });
});

test('another engine switches the team command and sets that engine model', () => {
  const patch = teamDefaultsFromMichael({ defaultCommand: 'claude', providerDefaultModels: { qwen: 'old' } }, 'codex', 'gpt-6');
  assert.equal(patch.defaultCommand, 'codex');
  assert.deepEqual(patch.providerDefaultModels, { qwen: 'old', codex: 'gpt-6' });
  assert.equal(patch.defaultModel, undefined);
});

test("the engine's own default model leaves the model alone", () => {
  assert.deepEqual(teamDefaultsFromMichael({ defaultCommand: 'claude' }, 'claude', undefined), {});
});

test('setup saves the team defaults with Michael, and the starter team reads them', () => {
  const wizard = read('src/renderer/src/components/OnboardingWizard.tsx');
  assert.match(wizard, /\.\.\.teamDefaultsFromMichael\(config, godProvider, godModel\)/);
  const hive = read('src/renderer/src/hooks/useHive.ts');
  assert.match(hive, /const model = isClaudeProvider\(provider\) \? config\.defaultModel : config\.providerDefaultModels\?\.\[provider\];/);
});
