'use strict';

// gh is usually a Homebrew install, and a Mac app opened from the Dock or
// Finder inherits launchd's bare PATH. github.ts spawned gh with that PATH, so
// the issues panel showed `spawn gh ENOENT` while the same gh worked in
// Terminal. These tests drive a real zsh whose rc file puts a stub gh on PATH,
// the way Homebrew's shellenv line does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { posixOnly } = require('./platform.cjs');

const shellEnv = loadTs('src/main/shellEnv.ts');
const { listIssues, listCIRuns } = loadTs('src/main/github.ts');

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => fs.existsSync(p));
const needsZsh = (reason) => {
  const opts = posixOnly(reason);
  return opts.skip ? opts : { skip: !ZSH && 'zsh is not installed' };
};

/** A Dock launch: launchd's PATH in the process, and a login shell whose
 *  .zshrc sets PATH to `shellPath` (with $ZDOTDIR expanded). */
function dockLaunch(t, shellPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh path '));
  fs.writeFileSync(path.join(dir, '.zshrc'), `export PATH="${shellPath}"\n`);
  const saved = { SHELL: process.env.SHELL, ZDOTDIR: process.env.ZDOTDIR, PATH: process.env.PATH };
  process.env.SHELL = ZSH;
  process.env.ZDOTDIR = dir;
  process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
  shellEnv.__resetShellEnvForTest();
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    shellEnv.__resetShellEnvForTest();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** A stub gh in `<dir>/brew bin` that answers issue list and run list. */
function stubGh(dir) {
  const bin = path.join(dir, 'brew bin');
  fs.mkdirSync(bin);
  const gh = path.join(bin, 'gh');
  fs.writeFileSync(gh, [
    '#!/bin/sh',
    'case "$1" in',
    '  issue) printf \'%s\' \'[{"number":7,"title":"Fix the login page","body":"","url":"https://github.com/o/r/issues/7","labels":[],"assignees":[]}]\' ;;',
    '  run) printf \'%s\' \'[{"name":"CI","status":"completed","conclusion":"success","url":"https://github.com/o/r/actions/runs/1","databaseId":1}]\' ;;',
    'esac',
    ''
  ].join('\n'));
  fs.chmodSync(gh, 0o755);
}

test('gh installed only on the login shell PATH is found from a Dock launch', needsZsh('login shell PATH'), async (t) => {
  const dir = dockLaunch(t, '$ZDOTDIR/brew bin:/usr/bin:/bin:/usr/sbin:/sbin');
  stubGh(dir);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gh repo '));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const issues = await listIssues(cwd);
  assert.equal(issues.error, undefined, 'gh was not found on the user\'s PATH');
  assert.equal(issues.ok, true);
  assert.deepEqual(issues.issues.map((i) => i.number), [7]);

  const runs = await listCIRuns(cwd);
  assert.equal(runs.error, undefined, 'gh was not found on the user\'s PATH');
  assert.deepEqual(runs.runs.map((r) => r.conclusion), ['success']);
});

test('a gh that is truly missing says so in words', needsZsh('login shell PATH'), async (t) => {
  dockLaunch(t, '$ZDOTDIR/empty');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gh repo '));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const out = await listIssues(cwd);
  assert.equal(out.ok, false);
  assert.match(out.error, /GitHub CLI \(gh\) not found/);
  assert.doesNotMatch(out.error, /ENOENT/);
});
