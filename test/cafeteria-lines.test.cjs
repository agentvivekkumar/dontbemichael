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
const { createIdleLines, createBanter } = loadTs('src/renderer/src/scene/office/cafeteriaLines.ts');

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
    const own = createIdleLines(() => 0);
    for (let i = 0; i < 20; i++) seen.add(own(c));
    for (const line of seen) {
      assert.ok(line.length <= 44, `${c}: "${line}" fits the bubble`);
      assert.doesNotMatch(line, /[–—]| - /, `${c}: "${line}"`);
    }
    assert.ok(createBanter(() => 0)(c, ['jim']).beats.length >= 2, `${c} opens with a bit of their own`);
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
  // Everyone takes a turn opening, with the rest of the office free to reply.
  for (let i = 0; i < 600; i++) {
    const opener = cast[i % cast.length];
    const ex = next(opener, cast.filter((c) => c !== opener)).beats;
    assert.ok(ex.length >= 2, 'at least a line and a reply');
    seen.add(ex.join(' / '));
    if (twss.includes(`['${ex[0]}', '${ex[1]}'`)) twssSeen++;
  }
  const pool = (src.slice(src.indexOf('const EXCHANGES'), src.indexOf('// Everything a pair can draw from')).match(/^  (?:bit\()?\['/gm) || []).length;
  assert.ok(pool >= 100, `${pool} exchanges in the file`);
  assert.ok(seen.size >= pool, `${seen.size} of ${pool} exchanges played`);
  assert.ok(twssSeen > 0, 'the that\'s what she said bits are in');
  // A signature opener plays once at most for the same person.
  const keyed = createBanter(() => 0);
  assert.deepEqual([...keyed('stanley', ['jim']).beats], ['is it Pretzel Day?', 'no, Stanley.', '...did I stutter?']);
  assert.notDeepEqual([...keyed('stanley', ['jim']).beats], ['is it Pretzel Day?', 'no, Stanley.', '...did I stutter?']);
});

/**
 * Each side of an exchange is said by someone who said it on the show
 * (owner, 2026-10-03: Pam was saying "that's what she said", and Pam never
 * did). "that's what she said" is Michael's alone.
 */
test('only Michael says that\'s what she said in a conversation', () => {
  const others = cast.filter((c) => c !== 'michael');
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const next = createBanter(random);
  let michaelSaid = 0;
  for (let i = 0; i < 2000; i++) {
    const opener = cast[i % cast.length];
    const partners = i % 3 ? others.filter((c) => c !== opener) : cast.filter((c) => c !== opener);
    const pick = next(opener, partners);
    if (!pick) continue;
    const partner = partners[pick.partner];
    assert.ok(partner, 'the partner is one of those offered');
    pick.beats.forEach((beat, j) => {
      const who = j % 2 ? partner : opener;
      if (/that.s what she said/i.test(beat.replace(/^\*[^*]+\*\s*/, '')) && !/^(you|why|nobody)/.test(beat)) {
        assert.equal(who, 'michael', `${who} said "${beat}" in ${JSON.stringify(pick.beats)}`);
        michaelSaid++;
      }
    });
  }
  assert.ok(michaelSaid > 0, 'Michael still says it');
});

test('signature lines go to their owner, whoever else is idle', () => {
  const next = createBanter(() => 0.5);
  const lines = new Map();
  for (let i = 0; i < 3000; i++) {
    const opener = cast[i % cast.length];
    const partners = cast.filter((c) => c !== opener);
    const pick = next(opener, partners);
    if (!pick) continue;
    pick.beats.forEach((beat, j) => lines.set(beat, (lines.get(beat) || new Set()).add(j % 2 ? partners[pick.partner] : opener)));
  }
  const only = (beat, who) => assert.deepEqual([...(lines.get(beat) || [])], [who], `"${beat}"`);
  only('I went to Cornell.', 'andy');
  only('Phyllis Vance.', 'phyllis');
  only('why few word when lot word?', 'kevin');
  only('victory. and beets.', 'dwight');
});

test('nobody can be paired when no partner fits, and Michael never warns about himself', () => {
  assert.equal(createBanter(() => 0.5)('pam', []), null);
  const shared = createIdleLines(() => 0.99);
  for (let i = 0; i < 60; i++) assert.doesNotMatch(shared('michael'), /michael/i);
});

/**
 * More of the show's small talk (owner, 2026-10-03: "lot of short small talk
 * that was funny"), from each character's running jokes, each line said by
 * someone who would say it.
 */
test('the running gags are in, short, and nobody says a line about themselves', () => {
  // Value: protects=the new exchanges play, fit the bubble, and never put a name in its own mouth; fails_when=the block is dropped from the pool, a beat is too long or has a dash, or Michael says "Michael's in the warehouse"; why_new=104 new exchanges and the not list; seam=none
  const block = src.slice(src.indexOf('const RUNNING_GAGS'), src.indexOf('// Everything a pair can draw from'));
  assert.ok((block.match(/^  (?:bit\()?\['/gm) || []).length >= 100, 'at least 100 running gags');
  assert.match(src, /\[\.\.\.EXCHANGES, \.\.\.RUNNING_GAGS, \.\.\.TWSS_EXCHANGES\]/);
  for (const m of block.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
    if (cast.includes(m[1])) continue;
    assert.ok(m[1].length <= 44, `"${m[1]}" fits the bubble`);
    assert.doesNotMatch(m[1], /[–—]| - /, m[1]);
  }
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const next = createBanter(random);
  // Saying your own name on purpose: an introduction, or the joke itself.
  const own = new Set(['Meredith.', 'hi. Nick. from IT.', '...Nick.', 'Phyllis Vance.', 'Creed isn’t my real name.', 'three-hole-punch Jim returns.', 'what Jim?', 'Dunder Mifflin, this is Pam.']);
  const gags = new Set();
  for (let i = 0; i < 20000; i++) {
    const opener = cast[i % cast.length];
    const partners = cast.filter((c) => c !== opener);
    const pick = next(opener, partners);
    if (!pick) continue;
    if (block.includes(pick.beats[0].replace(/'/g, "\\'"))) gags.add(pick.beats[0]);
    pick.beats.forEach((beat, j) => {
      const who = j % 2 ? partners[pick.partner] : opener;
      const name = who[0].toUpperCase() + who.slice(1);
      if (!own.has(beat)) assert.doesNotMatch(beat, new RegExp(`\\b${name}\\b`), `${who} says "${beat}"`);
    });
    if (pick.beats[0] === 'Michael’s in the warehouse.') assert.ok(opener !== 'michael' && partners[pick.partner] === 'darryl');
  }
  assert.ok(gags.size >= 95, `${gags.size} running gags played`);
});
