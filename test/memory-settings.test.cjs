'use strict';

/**
 * The floating "hive memory" panel on the office floor is gone (owner,
 * 2026-09-24). Nothing in it was about the floor: its on/off duplicated
 * Settings → Memory & Knowledge, searching memory is on Michael's Memory tab,
 * and its one unique control, the search language, moved into Settings.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test('the office floor no longer carries the memory panel', () => {
  assert.doesNotMatch(read('src/renderer/src/App.tsx'), /MemoryPanel/);
  assert.ok(!fs.existsSync(path.resolve(__dirname, '../src/renderer/src/components/MemoryPanel.tsx')));
});

test('Settings → Memory & Knowledge has the switch, the status and the search language', () => {
  const s = read('src/renderer/src/components/SettingsModal.tsx');
  const start = s.indexOf("activeSection === 'Memory & Knowledge'");
  const section = s.slice(start, start + 7000);
  assert.match(section, /onClick=\{toggleSemMem\}/);
  assert.match(section, /t\('memoryPanel\.onReady'\)/);
  assert.match(section, /onClick=\{\(\) => pickEmbeddingModel\(id\)\}/);
  // Saved with the rest of Settings, not instantly like the old panel.
  assert.match(s, /stage\(\{ embeddingModel: m \} as Partial<HarnessConfig>\);/);
  // Not installed: straight to the setup that installs it.
  assert.match(section, /setActiveSection\('Prerequisites'\)/);
});

test('searching memory still has a home: Michael\'s Memory tab', () => {
  assert.match(read('src/renderer/src/components/CommandCenterPanel.tsx'), /window\.cth\.searchMemory\(query\.trim\(\)\)/);
});
