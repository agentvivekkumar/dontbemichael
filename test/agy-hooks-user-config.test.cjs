'use strict';

// installAgyHooks writes our hook group into ~/.gemini/config/hooks.json and
// ~/.gemini/antigravity-cli/hooks.json. Those files are the user's: they may
// hold their own agy hooks. When one didn't parse as strict JSON (a comment or
// trailing comma from a hand edit, a BOM, a file agy was halfway through
// saving), the installer started from {} and wrote over it, so the user's own
// hooks were gone without a word.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { posixOnly } = require('./platform.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

const USER_HOOK = '"my-own": { "Stop": [ { "hooks": [ { "type": "command", "command": "notify-send done" } ] } ] }';

/** A HiveManager with HOME pointed at a temp folder; returns both hooks paths. */
function setup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-user-'));
  const home = path.join(base, 'user');
  fs.mkdirSync(home);
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    fs.rmSync(base, { recursive: true, force: true });
  });
  assert.equal(os.homedir(), home, 'home redirect failed — aborting before touching the real home');
  const hive = new HiveManager(() => path.join(base, 'harness'));
  hive.ensureHive();
  const files = [
    path.join(home, '.gemini', 'config', 'hooks.json'),
    path.join(home, '.gemini', 'antigravity-cli', 'hooks.json')
  ];
  for (const f of files) fs.mkdirSync(path.dirname(f), { recursive: true });
  return { hive, files, base };
}

const install = (hive) => { try { hive.installAgyHooks(); return null; } catch (e) { return e.message; } };

const unparsable = {
  'a trailing comma': `{\n  ${USER_HOOK},\n}\n`,
  'a // comment': `// my hooks\n{\n  ${USER_HOOK}\n}\n`,
  'a half-saved file': `{\n  ${USER_HOOK.slice(0, 40)}`,
  'an array': `[ { ${USER_HOOK} } ]`,
  'null': 'null'
};

for (const [name, text] of Object.entries(unparsable)) {
  test(`a hooks file with ${name} is left byte for byte and the failure is reported`, (t) => {
    const { hive, files } = setup(t);
    fs.writeFileSync(files[0], text);
    const err = install(hive);
    assert.equal(fs.readFileSync(files[0], 'utf8'), text, 'the user\'s file was rewritten');
    assert.match(err ?? '', /agy hooks not installed: left .*hooks\.json as it is: it is not plain JSON/);
    // The other file is still set up.
    assert.ok(JSON.parse(fs.readFileSync(files[1], 'utf8'))['munder-hive']);
  });
}

test('a BOM is read through: the user\'s hook stays and ours is added', (t) => {
  const { hive, files } = setup(t);
  fs.writeFileSync(files[0], `﻿{\n  ${USER_HOOK}\n}\n`);
  assert.equal(install(hive), null);
  const after = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  assert.deepEqual(Object.keys(after), ['my-own', 'munder-hive']);
});

test('a valid file keeps every key, and a second install writes nothing', (t) => {
  const { hive, files } = setup(t);
  fs.writeFileSync(files[0], `{ ${USER_HOOK}, "other": 1 }`);
  assert.equal(install(hive), null);
  const once = fs.readFileSync(files[0], 'utf8');
  assert.deepEqual(Object.keys(JSON.parse(once)), ['my-own', 'other', 'munder-hive']);
  const before = fs.statSync(files[0]).mtimeMs;
  const ino = fs.statSync(files[0]).ino;
  assert.equal(install(hive), null);
  assert.equal(fs.readFileSync(files[0], 'utf8'), once);
  assert.equal(fs.statSync(files[0]).ino, ino, 'an unchanged file was replaced');
  assert.equal(fs.statSync(files[0]).mtimeMs, before);
});

test('an empty or missing file gets just our group', (t) => {
  const { hive, files } = setup(t);
  fs.writeFileSync(files[0], '  \n');
  assert.equal(install(hive), null);
  for (const f of files) assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))), ['munder-hive']);
});

test('a hooks file that is a link keeps its link and the real file is updated', posixOnly('symlinks'), (t) => {
  const { hive, files, base } = setup(t);
  const real = path.join(base, 'dotfiles-hooks.json');
  fs.writeFileSync(real, `{ ${USER_HOOK} }`);
  fs.symlinkSync(real, files[0]);
  assert.equal(install(hive), null);
  assert.ok(fs.lstatSync(files[0]).isSymbolicLink(), 'the dotfiles link was replaced by a plain file');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(real, 'utf8'))), ['my-own', 'munder-hive']);
});

test('a link to a dotfile that doesn\'t exist yet stays a link', posixOnly('symlinks'), (t) => {
  const { hive, files, base } = setup(t);
  const real = path.join(base, 'dotfiles-hooks.json');
  fs.symlinkSync(real, files[0]);
  assert.equal(install(hive), null);
  assert.ok(fs.lstatSync(files[0]).isSymbolicLink());
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(real, 'utf8'))), ['munder-hive']);
});

test('a read-only hooks file is left alone and reported', posixOnly('file modes'), (t) => {
  const { hive, files } = setup(t);
  const text = `{ ${USER_HOOK} }`;
  fs.writeFileSync(files[0], text);
  fs.chmodSync(files[0], 0o444);
  t.after(() => { try { fs.chmodSync(files[0], 0o644); } catch { /* removed */ } });
  if (process.getuid && process.getuid() === 0) return; // root can write anything
  assert.match(install(hive) ?? '', /agy hooks not installed: .*(EACCES|EPERM)/);
  assert.equal(fs.readFileSync(files[0], 'utf8'), text);
});
