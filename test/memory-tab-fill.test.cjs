'use strict';
/**
 * Michael's Memory tab: the memory file uses the whole tab (owner, 2026-09-25).
 * It was shown in the shared <Pre>, capped at 200px for search results, so the
 * file stopped a third of the way down and the rest of the panel sat empty.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/components/CommandCenterPanel.tsx'), 'utf8');

test('the memory file fills the tab; search results keep their cap', () => {
  const tab = src.slice(src.indexOf('function MemoryTab('), src.indexOf('// ─── Fleet telemetry bits'));
  assert.match(tab, /<Pre fill>\{mem \|\| t\('commandCenter\.noMemory'\)\}<\/Pre>/);
  assert.match(tab, /flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column'/, 'grows, with a floor');
  assert.doesNotMatch(tab, /<Scroll>/, 'a flex column, so the file can take the height left');
  assert.match(src, /\.\.\.\(fill \? \{ flex: 1, minHeight: 0 \} : \{ maxHeight: 200 \}\)/);
});
