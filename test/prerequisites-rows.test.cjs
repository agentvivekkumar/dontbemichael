'use strict';

/**
 * Settings → Prerequisites shows only what this build uses (owner, 2026-09-25):
 * the engines it offers (BUILD_ENGINES), uv and MemPalace. The developer rows
 * (git, Node.js, every other engine) hide behind SHOW_DEV_TOOLS. The full
 * catalog still feeds tools:status, because onboarding checks every engine.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { toolCatalog, prerequisiteRows } = loadTs('src/shared/toolCatalog.ts');
const { SHOW_DEV_TOOLS } = loadTs('src/shared/buildFeatures.ts');

test('the page shows Claude Code, uv and MemPalace, nothing else', () => {
  assert.equal(SHOW_DEV_TOOLS, false);
  const ids = prerequisiteRows(toolCatalog()).map((t) => t.id).sort();
  assert.deepEqual(ids, ['engine:claude', 'mempalace', 'uv']);
});

test('the switch brings every row back, and the catalog itself is untouched', () => {
  const all = toolCatalog();
  assert.equal(prerequisiteRows(all, true).length, all.length);
  assert.ok(all.some((t) => t.id === 'git') && all.some((t) => t.id === 'engine:codex'), 'onboarding still sees every engine');
});

test('the panel filters what it shows, not what main reports', () => {
  const panel = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/components/SetupPanel.tsx'), 'utf8');
  assert.match(panel, /setTools\(prerequisiteRows\(await window\.cth\.toolsStatus\(\)\)\)/);
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.match(main, /return toolCatalog\(\)\.map\(/, 'tools:status keeps the full catalog');
});

test('Agents & Models hides the API keys panel while no offered engine reads it', () => {
  const { showByokSettings, BUILD_ENGINES } = loadTs('src/shared/agentProvider.ts');
  assert.deepEqual([...BUILD_ENGINES], ['claude']);
  assert.equal(showByokSettings(), false, 'Claude Code uses its own login');
  assert.equal(showByokSettings(['claude', 'opencode']), true, 'it comes back when a build offers OpenCode');
  const modal = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/components/SettingsModal.tsx'), 'utf8');
  assert.match(modal, /\{showByokSettings\(\) && \(\s*<>\s*<AiEnginesSettings config=\{config\} \/>/);
  assert.match(modal, /settings\.agentsModels\.maxTurns/, 'Max turns stays (owner, 2026-09-25)');
});
