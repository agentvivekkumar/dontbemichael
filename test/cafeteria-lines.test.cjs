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
const { pickSoloLine, pickExchange } = loadTs('src/renderer/src/scene/office/cafeteriaLines.ts');

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
