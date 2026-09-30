'use strict';

/** The memory graph draws each agent as its character, not a box (owner,
 *  2026-09-27). Other nodes (the owner, broadcast, topics) keep their tiles. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

// Design v2 (branding/DESIGN.md 7.22): a person is an avatar in their
// department's colors with an accent ring, Michael in ink; no pixel sprites.
test('agents are drawn as department avatars, Michael in ink', () => {
  const panel = read('src/renderer/src/components/MemoryGraphPanel.tsx');
  assert.match(panel, /family\(departmentOf\(a\), dark\)/);
  assert.match(panel, /fill=\{n\.isGod \? 'var\(--cth-ink\)' : fam\?\.l \?\? 'var\(--cth-neutral-soft\)'\}/);
  assert.doesNotMatch(panel, /portraitDataUrl|imageRendering: 'pixelated'/);
  const graph = read('src/renderer/src/components/memoryGraph/buildGraph.ts');
  assert.match(graph, /character: a\.character,/);
});
