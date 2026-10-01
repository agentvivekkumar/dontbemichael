'use strict';

/**
 * Every character has break-room lines of their own (owner, 2026-09-27: "add
 * some for everyone"), Darryl, Erin, Nick and Sadiq included.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/scene/office/cafeteriaLines.ts'), 'utf8');
const castSrc = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/scene/office/cast.ts'), 'utf8');
const cast = [...new Set([...castSrc.matchAll(/name: '([a-z]+)'/g)].map((m) => m[1]))];
const { pickSoloLine, pickExchange, createIdleLines } = loadTs('src/renderer/src/scene/office/cafeteriaLines.ts');

test('every character has at least fourteen lines of their own', () => {
  assert.match(src, /const BY_CHARACTER: Record<OfficeCharacterName, readonly string\[\]> = \{/, 'a full record: a new character fails to compile without lines');
  const block = src.slice(src.indexOf('const BY_CHARACTER'), src.indexOf('};', src.indexOf('const BY_CHARACTER')));
  for (const c of cast) {
    const m = new RegExp(`\\n  ${c}:\\s*\\[(.*)\\],`).exec(block);
    assert.ok(m, `${c} has lines`);
    const lines = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)];
    assert.ok(lines.length >= 14, `${c} has ${lines.length} lines`);
  }
});

test('the new characters speak in their own voice, briefly and without dashes', () => {
  for (const c of ['darryl', 'erin', 'nick', 'sadiq']) {
    const seen = new Set();
    for (let seed = 0; seed < 200; seed++) seen.add(pickSoloLine(c, 'coffee', seed * 5));
    for (const line of seen) {
      assert.ok(line.length <= 44, `${c}: "${line}" fits the bubble`);
      assert.doesNotMatch(line, /[–—]| - /, `${c}: "${line}"`);
    }
    assert.ok(pickExchange(c, 0).length >= 2, `${c} opens with a bit of their own`);
  }
});

/**
 * The studio's idle bubbles (owner, 2026-10-01: "there are not enough funny
 * one liners"): a big pool, each person's own voice most of the time, and no
 * line twice until its pool runs out.
 */
test('idle lines do not repeat until the pool runs out, and every one fits', () => {
  // A seeded generator, so the test is the same every run.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (const c of cast) {
    const next = createIdleLines(random);
    const said = [];
    for (let i = 0; i < 30; i++) said.push(next(c));
    for (let i = 1; i < said.length; i++) assert.notEqual(said[i], said[i - 1], `${c} says the same line twice running`);
    assert.ok(new Set(said).size >= 20, `${c}: ${new Set(said).size} different lines in 30`);
  }
  const next = createIdleLines(random);
  const all = new Set();
  for (let i = 0; i < 4000; i++) all.add(next(cast[i % cast.length]));
  assert.ok(all.size >= 200, `${all.size} lines in all`);
  for (const line of all) {
    assert.ok(line.length <= 44, `"${line}" fits the bubble`);
    assert.doesNotMatch(line, /[–—]| - /, `"${line}"`);
  }
});
