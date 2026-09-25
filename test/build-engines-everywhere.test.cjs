'use strict';

/**
 * Only the engines this build offers (BUILD_ENGINES, Claude Code today) can be
 * picked anywhere (owner, 2026-09-24). Setup and Edit Agent already used the
 * list; the hire dialog, Michael's engine picker, the per-agent model picker
 * and voice hiring still offered every engine, and the others are not wired to
 * run an office member end to end. Each list keeps the engine an agent (or an
 * imported hire) is already on, so nothing current disappears.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test('this build offers Claude Code only', () => {
  assert.deepEqual([...loadTs('src/shared/agentProvider.ts').BUILD_ENGINES], ['claude']);
});

test('the hire dialog lists this build\'s engines, plus an imported hire\'s', () => {
  assert.match(read('src/renderer/src/components/AddAgentModal.tsx'),
    /AGENT_PROVIDER_PRESETS\s*\.filter\(\(p\) => BUILD_ENGINES\.includes\(p\.id\) \|\| p\.id === provider\)/);
});

test("Michael's engine picker and the model picker list this build's engines, plus the current one", () => {
  const cc = read('src/renderer/src/components/CommandCenterPanel.tsx');
  assert.match(cc, /modelProvidersForAgent\(a\.isGod\)\s*\.filter\(\(preset\) => BUILD_ENGINES\.includes\(preset\.id\) \|\| preset\.id === agentProvider\)/);
  assert.match(cc, /canReceiveInbox\(p\.id\)\s*&& \(BUILD_ENGINES\.includes\(p\.id\) \|\| p\.id === agentProvider \|\| p\.id === engineProvider\)/);
  assert.doesNotMatch(cc, /AGENT_PROVIDER_PRESETS\.filter\(\(p\) => canReceiveInbox\(p\.id\)\)\.map/, 'no unfiltered engine list left');
});

test('voice hiring refuses an engine this build does not offer', () => {
  const rt = read('src/main/realtimeActions.ts');
  assert.match(rt, /if \(!BUILD_ENGINES\.includes\(provider as AgentProvider\)\) \{\s*return \{ ok: false, spoken:/);
  assert.match(read('src/renderer/src/realtime/actions.ts'), /provider: \{ type: 'string', description: 'Engine: claude\. It is the only engine this version offers\.' \}/);
});
