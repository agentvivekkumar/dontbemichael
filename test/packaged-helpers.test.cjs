'use strict';

/**
 * The installed app ships every helper script it runs (eng review REG-1).
 *
 * Helpers like md-mail run under the bundled node OUTSIDE the asar, so each
 * .cjs must be copied by electron-builder.yml `extraResources`. A missing line
 * passes every dev run and every other test (dev resolves resources/ in the
 * repo) and breaks only the installed app. Two ways that happens:
 *   1. main starts a resources/*.cjs the list does not ship;
 *   2. a shipped helper require()s a sibling the list does not ship
 *      (md-mail-mcp.cjs → md-mcp-core.cjs).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** `from`/`to` pairs of extraResources, in file order. */
function extraResources(yml) {
  const start = yml.indexOf('\nextraResources:');
  assert.ok(start >= 0, 'electron-builder.yml has extraResources');
  const block = yml.slice(start + 1).split('\n').slice(1); // lines after "extraResources:"
  const out = [];
  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    if (/^\S/.test(line)) break; // next top-level key
    const from = /^\s*-\s*from:\s*(\S+)/.exec(line);
    if (from) {
      const to = /^\s*to:\s*(\S+)/.exec(block[i + 1] || '');
      out.push({ from: from[1], to: to ? to[1] : path.basename(from[1]) });
    }
  }
  return out;
}

/** Problems with a given electron-builder.yml text; empty means it ships everything. */
function missingHelpers(yml) {
  const entries = extraResources(yml);
  const shipped = new Set(entries.map((e) => e.to));
  const problems = [];

  // 1) Every resources/*.cjs that main code names is shipped.
  const helpers = fs.readdirSync(path.join(root, 'resources')).filter((f) => f.endsWith('.cjs'));
  const mainSrc = fs.readdirSync(path.join(root, 'src/main')).filter((f) => f.endsWith('.ts')).map((f) => read(`src/main/${f}`)).join('\n');
  for (const h of helpers) {
    if (mainSrc.includes(`'${h}'`) || mainSrc.includes(`"${h}"`)) {
      if (!shipped.has(h)) problems.push(`main starts resources/${h} but extraResources does not ship it`);
    }
  }

  // 2) Every sibling a shipped .cjs requires is shipped beside it.
  for (const e of entries) {
    if (!e.to.endsWith('.cjs') || !fs.existsSync(path.join(root, e.from))) continue;
    const src = read(e.from);
    for (const m of src.matchAll(/require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)) {
      if (!shipped.has(m[1])) problems.push(`${e.to} requires ./${m[1]} but extraResources does not ship it`);
    }
  }
  return problems;
}

test('every helper the app starts, and every sibling a helper requires, is in extraResources', () => {
  assert.deepEqual(missingHelpers(read('electron-builder.yml')), []);
});

test('the check catches a dropped md-mcp-core line (the packaged-only failure)', () => {
  const yml = read('electron-builder.yml').replace(/\n\s*- from: resources\/md-mcp-core\.cjs\n\s*to: md-mcp-core\.cjs/, '');
  assert.deepEqual(missingHelpers(yml), ['md-mail-mcp.cjs requires ./md-mcp-core.cjs but extraResources does not ship it']);
});

test('the check catches a dropped helper that main starts', () => {
  const yml = read('electron-builder.yml').replace(/\n\s*- from: resources\/md-mail-mcp\.cjs\n\s*to: md-mail-mcp\.cjs/, '');
  assert.ok(missingHelpers(yml).includes('main starts resources/md-mail-mcp.cjs but extraResources does not ship it'));
});
