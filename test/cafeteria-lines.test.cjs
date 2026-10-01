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
const { pickSoloLine, pickExchange, createIdleLines, createBanter } = loadTs('src/renderer/src/scene/office/cafeteriaLines.ts');

test('every character has at least four lines of their own', () => {
  assert.match(src, /const BY_CHARACTER: Record<OfficeCharacterName, readonly string\[\]> = \{/, 'a full record: a new character fails to compile without lines');
  const block = src.slice(src.indexOf('const BY_CHARACTER'), src.indexOf('};', src.indexOf('const BY_CHARACTER')));
  for (const c of cast) {
    const m = new RegExp(`\\n  ${c}:\\s*\\[(.*)\\],`).exec(block);
    assert.ok(m, `${c} has lines`);
    const lines = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)];
    assert.ok(lines.length >= 4, `${c} has ${lines.length} lines`);
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
 * The studio uses only these Office lines (owner, 2026-10-01: "dont show made
 * up lines. use everything from the office"), dealt like a deck so nothing
 * repeats until its pool runs out, and conversations from the exchanges.
 */
test('studio idle lines come from this file and never repeat before their pool runs out', () => {
  // Always the shared pool (random never under 0.6): every break-room line once, then again.
  const shared = createIdleLines(() => 0.99);
  const first = [];
  for (let i = 0; i < 23; i++) first.push(shared('pam'));
  assert.equal(new Set(first).size, 23, 'all 23 break-room lines before any repeat');
  // Always their own (random 0): each of Dwight's lines once before any repeat.
  const own = createIdleLines(() => 0);
  const d = [];
  for (let i = 0; i < 7; i++) d.push(own('dwight'));
  assert.equal(new Set(d).size, 7);
  for (const line of [...first, ...d]) assert.ok(src.includes(line.replace(/'/g, "\\'")) || src.includes(line), `"${line}" is one of the file's lines`);
});

test('studio conversations are the full set of Office exchanges', () => {
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const twss = src.slice(src.indexOf('const TWSS_EXCHANGES'), src.indexOf('const PAIR_POOL'));
  const next = createBanter(random);
  const seen = new Set();
  let twssSeen = 0;
  for (let i = 0; i < 120; i++) {
    const ex = next('ryan');
    assert.ok(ex.length >= 2, 'at least a line and a reply');
    seen.add(ex.join(' / '));
    if (twss.includes(`['${ex[0]}', '${ex[1]}'`)) twssSeen++;
  }
  assert.ok(seen.size >= 100, `${seen.size} different exchanges`);
  assert.ok(twssSeen > 0, 'the that\'s what she said bits are in');
  // A signature opener plays once at most for the same person.
  const keyed = createBanter(() => 0);
  assert.deepEqual([...keyed('stanley')], ['is it Pretzel Day?', 'no, Stanley.', '...did I stutter?']);
  assert.notDeepEqual([...keyed('stanley')], ['is it Pretzel Day?', 'no, Stanley.', '...did I stutter?']);
});
