'use strict';

/**
 * The studio lab (tools/studio-lab) stays buildable and self-contained
 * (owner, 2026-10-01: it is the demo and video tool, and must not be lost or
 * break silently when the studio changes).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('the studio lab builds into one self-contained HTML file', { timeout: 120_000 }, async () => {
  const { buildLab } = await import(pathToFileURL(path.resolve(__dirname, '../tools/studio-lab/build.mjs')).href);
  const html = await buildLab(null);
  assert.match(html, /<title>Don't Be Michael · Studio lab<\/title>/);
  assert.match(html, /Studio lab/);
  // Nothing loads from the network: no external scripts, styles or fonts.
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']?https?:/i);
  assert.doesNotMatch(html, /url\(["']?https?:/i);
  // A fictional office only (MoblizeIT is a reference office, never sample data).
  assert.doesNotMatch(html, /moblize/i);
  assert.ok(html.length < 8 * 1024 * 1024, `the lab is ${(html.length / 1048576).toFixed(1)} MB`);
});

test('in the lab every card stays folded until hovered or spotlit, one at a time (owner, 2026-10-01)', () => {
  const fs = require('node:fs');
  const lab = fs.readFileSync(path.resolve(__dirname, '../tools/studio-lab/lab.tsx'), 'utf8');
  assert.match(lab, /<StudioStage config=\{config\} quietCards \/>/);
  assert.match(lab, /new CustomEvent\('cth:demo-spotlight', \{ detail: agentId \}\)/);
  const stage = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/scene/studio/StudioStage.tsx'), 'utf8');
  // Quiet cards: work alone no longer opens a card; selection, hover and a spotlight do.
  assert.match(stage, /const awake = \(pod: PodPlan<Agent>\) => pod\.members\.some\(\(a\) => \(!quietCards && ACTIVE\.has\(a\.status\)\) \|\| a\.id === selected\);/);
  assert.match(stage, /window\.addEventListener\('cth:demo-spotlight', onSpot\);/);
});
