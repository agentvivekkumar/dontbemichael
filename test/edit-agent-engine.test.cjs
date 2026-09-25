'use strict';

/**
 * Edit Agent picks the engine from two lists instead of a wall of buttons
 * (owner, 2026-09-24): provider and model are dropdowns. The provider list is
 * the engines this build offers, like setup, plus the agent's own; the model
 * list always includes the agent's current model.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/components/EditAgentModal.tsx'), 'utf8');
const engine = src.slice(src.indexOf('<Section label="Engine"'), src.indexOf('<Section label="Briefing"'));

test('provider and model are dropdowns, not button grids', () => {
  assert.equal((engine.match(/<select\s*\n/g) || []).length, 2);
  assert.doesNotMatch(engine, /<button\b/, 'no buttons left in the engine section');
});

test('the provider list is this build\'s engines, plus the one the agent runs on', () => {
  assert.match(engine, /\.filter\(\(p\) => BUILD_ENGINES\.includes\(p\.id\) \|\| p\.id === provider\)/);
  assert.match(engine, /onChange=\{\(e\) => pickProvider\(e\.target\.value as AgentProvider\)\}/);
});

test('the model list always includes the current model', () => {
  assert.match(engine, /\[\.\.\.known, \{ id: model, label: `\$\{model\} \(current\)` \}\]/);
  assert.match(engine, /onChange=\{\(e\) => setModel\(e\.target\.value \|\| undefined\)\}/);
});
