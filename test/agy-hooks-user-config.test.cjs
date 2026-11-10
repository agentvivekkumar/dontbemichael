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

/** What installAgyHooks gave back: the owner's sentence, or the error it threw. */
const install = (hive) => { try { return { left: hive.installAgyHooks() }; } catch (e) { return { error: e }; } };

const ONE_LEFT = /^~\/\.gemini\/config\/hooks\.json couldn't be read as plain JSON, so it was left as it is\. Fix or remove that file, then restart$/;

const unparsable = {
  'a trailing comma': `{\n  ${USER_HOOK},\n}\n`,
  'a // comment': `// my hooks\n{\n  ${USER_HOOK}\n}\n`,
  'a half-saved file': `{\n  ${USER_HOOK.slice(0, 40)}`,
  'an array': `[ { ${USER_HOOK} } ]`,
  'null': 'null'
};

for (const [name, text] of Object.entries(unparsable)) {
  test(`a hooks file with ${name} is left byte for byte and the owner is told`, (t) => {
    const { hive, files } = setup(t);
    fs.writeFileSync(files[0], text);
    const out = install(hive);
    assert.equal(out.error, undefined, 'the user\'s file is their state, not a failure to report');
    assert.match(out.left, ONE_LEFT);
    assert.equal(fs.readFileSync(files[0], 'utf8'), text, 'the user\'s file was rewritten');
    // The other file is still set up.
    assert.ok(JSON.parse(fs.readFileSync(files[1], 'utf8'))['munder-hive']);
  });
}

test('a half-saved file is told again on the next start, and still left alone', (t) => {
  const { hive, files } = setup(t);
  const text = `{\n  ${USER_HOOK.slice(0, 40)}`;
  fs.writeFileSync(files[0], text);
  assert.match(install(hive).left, ONE_LEFT);
  assert.match(install(hive).left, ONE_LEFT, 'a later start went quiet');
  assert.equal(fs.readFileSync(files[0], 'utf8'), text);
});

test('both files left alone are named together', (t) => {
  const { hive, files } = setup(t);
  for (const f of files) fs.writeFileSync(f, '{,}');
  assert.match(install(hive).left, /config\/hooks\.json couldn't be read as plain JSON and ~\/\.gemini\/antigravity-cli\/hooks\.json couldn't be read as plain JSON, so they were left as they are\. Fix or remove those files, then restart$/);
});

test('a BOM is read through: the user\'s hook stays and ours is added', (t) => {
  const { hive, files } = setup(t);
  fs.writeFileSync(files[0], `﻿{\n  ${USER_HOOK}\n}\n`);
  assert.deepEqual(install(hive), { left: undefined });
  const after = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  assert.deepEqual(Object.keys(after), ['my-own', 'munder-hive']);
});

test('a valid file keeps every key, and a second install writes nothing', (t) => {
  const { hive, files } = setup(t);
  fs.writeFileSync(files[0], `{ ${USER_HOOK}, "other": 1 }`);
  assert.deepEqual(install(hive), { left: undefined });
  const once = fs.readFileSync(files[0], 'utf8');
  assert.deepEqual(Object.keys(JSON.parse(once)), ['my-own', 'other', 'munder-hive']);
  // An old mtime, so a rewrite shows even on a filesystem with coarse times.
  const old = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(files[0], old, old);
  const ino = fs.statSync(files[0]).ino;
  assert.deepEqual(install(hive), { left: undefined });
  assert.equal(fs.readFileSync(files[0], 'utf8'), once);
  assert.equal(fs.statSync(files[0]).ino, ino, 'an unchanged file was replaced');
  assert.equal(fs.statSync(files[0]).mtimeMs, old.getTime(), 'an unchanged file was written');
});

test('a stale group of ours is updated, and the user\'s hooks stay', (t) => {
  const { hive, files } = setup(t);
  fs.writeFileSync(files[0], `{ ${USER_HOOK}, "munder-hive": { "Stop": [ { "hooks": [ { "type": "command", "command": "node /old/agy-hook.cjs Stop" } ] } ] } }`);
  assert.deepEqual(install(hive), { left: undefined });
  const after = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  assert.deepEqual(Object.keys(after), ['my-own', 'munder-hive']);
  assert.equal(after['my-own'].Stop[0].hooks[0].command, 'notify-send done');
  assert.doesNotMatch(JSON.stringify(after['munder-hive']), /\/old\//);
  assert.ok(after['munder-hive'].PreToolUse, 'our group was not brought up to date');
});

test('an empty or missing file gets just our group', (t) => {
  const { hive, files } = setup(t);
  fs.writeFileSync(files[0], '  \n');
  assert.deepEqual(install(hive), { left: undefined });
  for (const f of files) assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))), ['munder-hive']);
});

test('a hooks file that is a link keeps its link and the real file is updated', posixOnly('symlinks'), (t) => {
  const { hive, files, base } = setup(t);
  const real = path.join(base, 'dotfiles-hooks.json');
  fs.writeFileSync(real, `{ ${USER_HOOK} }`);
  fs.symlinkSync(real, files[0]);
  assert.deepEqual(install(hive), { left: undefined });
  assert.ok(fs.lstatSync(files[0]).isSymbolicLink(), 'the dotfiles link was replaced by a plain file');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(real, 'utf8'))), ['my-own', 'munder-hive']);
});

test('a link to a dotfile that doesn\'t exist yet stays a link', posixOnly('symlinks'), (t) => {
  const { hive, files, base } = setup(t);
  const real = path.join(base, 'dotfiles-hooks.json');
  fs.symlinkSync(real, files[0]);
  assert.deepEqual(install(hive), { left: undefined });
  assert.ok(fs.lstatSync(files[0]).isSymbolicLink());
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(real, 'utf8'))), ['munder-hive']);
});

test('a read-only hooks file is left alone and the owner is told', posixOnly('file modes'), (t) => {
  if (process.getuid && process.getuid() === 0) { t.skip('root ignores file modes'); return; }
  const { hive, files } = setup(t);
  const text = `{ ${USER_HOOK} }`;
  fs.writeFileSync(files[0], text);
  fs.chmodSync(files[0], 0o444);
  t.after(() => { try { fs.chmodSync(files[0], 0o644); } catch { /* removed */ } });
  assert.match(install(hive).left, /config\/hooks\.json can't be written \((EACCES|EPERM)\), so it was left as it is/);
  assert.equal(fs.readFileSync(files[0], 'utf8'), text);
});

test('a hooks.json that is a folder is reported, and the other file is still set up', (t) => {
  const { hive, files } = setup(t);
  fs.mkdirSync(files[0]);
  assert.match(install(hive).left, /config\/hooks\.json is not a file, so it was left as it is/);
  assert.ok(JSON.parse(fs.readFileSync(files[1], 'utf8'))['munder-hive']);
});

test('a fault that isn\'t the user\'s is thrown as it came, code and all', (t) => {
  const { hive, files } = setup(t);
  const real = fs.writeFileSync;
  fs.writeFileSync = (p, ...rest) => {
    if (String(p).endsWith('hooks.json')) throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    return real(p, ...rest);
  };
  t.after(() => { fs.writeFileSync = real; });
  const out = install(hive);
  assert.equal(out.error?.code, 'ENOSPC', 'the code the failure reporter skips on was lost');
  assert.equal(fs.existsSync(files[0]), false);
});

test('the spawn tells the owner like a degraded bridge, and files no failure report', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hive.ts'), 'utf8');
  const at = src.indexOf("if (desc.shim === 'agy') {");
  assert.ok(at > 0);
  const block = src.slice(at, src.indexOf("else if (desc.shim === 'codex')", at));
  assert.match(block, /const left = this\.installAgyHooks\(\);/);
  assert.match(block, /degraded = `\$\{meta\.name\} is running without hive events: \$\{left\} \$\{meta\.name\}\.`;/);
  assert.match(block, /this\.emit\?\.\('hive:degraded', \{ agentId: meta\.id, name: meta\.name, reason: 'user-config', message: degraded \}\);/);
  assert.match(block, /appendLog\(\{ kind: 'agy-hooks-left'/);
  const { classifyLogEvent } = loadTs('src/shared/failureReport.ts');
  assert.equal(classifyLogEvent({ kind: 'agy-hooks-left', agentId: 'a1', name: 'A' }), null, 'a left-alone file was filed as a failure report');
});
