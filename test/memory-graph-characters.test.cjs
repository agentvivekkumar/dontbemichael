'use strict';

/** The memory graph draws each agent as its character, not a box (owner,
 *  2026-09-27). Other nodes (the owner, broadcast, topics) keep their tiles. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('agents are drawn as their characters', () => {
  const panel = read('src/renderer/src/components/MemoryGraphPanel.tsx');
  assert.match(panel, /\{n\.kind === 'agent' \? \([\s\S]{0,900}<image\s+href=\{portraitDataUrl\(n\.character\)\}/);
  assert.match(panel, /style=\{\{ imageRendering: 'pixelated' \}\}/);
  const graph = read('src/renderer/src/components/memoryGraph/buildGraph.ts');
  assert.match(graph, /character: a\.character,/);
  const sprite = read('src/renderer/src/components/SpritePortrait.tsx');
  assert.match(sprite, /export function portraitDataUrl\(character: OfficeCharacterName, scale = 4\): string \{/);
  assert.match(sprite, /portraitUrls\.set\(key, url\);/, 'painted once per character');
});
