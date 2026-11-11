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
const github = loadTs('src/main/github.ts');
const { listIssues, listCIRuns } = github;

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
  // A real interactive zsh on a slow CI runner can take longer than the 3 s cap.
  shellEnv.__resetShellEnvForTest({ timeoutMs: 15_000 });
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

/** A stub gh in `binDir`. Its issue title reports GH_PROMPT_DISABLED, and
 *  `sleep` makes it hang. */
function stubGh(binDir, { title = 'prompt=$GH_PROMPT_DISABLED', sleep = 0 } = {}) {
  fs.mkdirSync(binDir, { recursive: true });
  const gh = path.join(binDir, 'gh');
  fs.writeFileSync(gh, [
    '#!/bin/sh',
    sleep ? `sleep ${sleep}` : '',
    'case "$1" in',
    `  issue) printf '[{"number":7,"title":"%s","body":"","url":"https://github.com/o/r/issues/7","labels":[],"assignees":[]}]' "${title}" ;;`,
    '  run) printf \'%s\' \'[{"name":"CI","status":"completed","conclusion":"success","url":"https://github.com/o/r/actions/runs/1","databaseId":1}]\' ;;',
    'esac',
    ''
  ].join('\n'));
  fs.chmodSync(gh, 0o755);
  return gh;
}

function repo(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gh repo '));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}

test('gh installed only on the login shell PATH is found from a Dock launch', needsZsh('login shell PATH'), async (t) => {
  const dir = dockLaunch(t, '$ZDOTDIR/brew bin:/usr/bin:/bin:/usr/sbin:/sbin');
  stubGh(path.join(dir, 'brew bin'));
  const cwd = repo(t);

  const issues = await listIssues(cwd);
  assert.equal(issues.error, undefined, 'gh was not found on the user\'s PATH');
  assert.deepEqual(issues.issues.map((i) => i.number), [7]);
  assert.equal(issues.issues[0].title, 'prompt=1', 'gh may stop to ask a question nobody sees');

  const runs = await listCIRuns(cwd);
  assert.equal(runs.error, undefined, 'gh was not found on the user\'s PATH');
  assert.deepEqual(runs.runs.map((r) => r.conclusion), ['success']);
});

test('a relative PATH entry never runs a gh the repo carries', needsZsh('login shell PATH'), async (t) => {
  // `bin` and an empty entry are both relative: looked up from inside the repo.
  const dir = dockLaunch(t, 'bin::$ZDOTDIR/brew bin:/usr/bin:/bin:/usr/sbin:/sbin');
  stubGh(path.join(dir, 'brew bin'));
  const cwd = repo(t);
  const marker = path.join(cwd, 'repo gh ran');
  for (const evil of [path.join(cwd, 'bin'), cwd]) {
    stubGh(evil, { title: 'repo' });
    fs.appendFileSync(path.join(evil, 'gh'), `touch "${marker}"\n`);
  }
  const issues = await listIssues(cwd);
  assert.equal(fs.existsSync(marker), false, 'the repo\'s own gh ran');
  assert.equal(issues.issues[0].title, 'prompt=1');
});

test('a project folder that is gone says so, not that gh is missing', async (t) => {
  const gone = path.join(repo(t), 'moved away');
  const out = await listIssues(gone);
  assert.equal(out.ok, false);
  assert.match(out.error, /project folder is gone/);
  assert.doesNotMatch(out.error, /gh\) not found/);
});

test('a gh that is truly missing says so in words', async (t) => {
  const real = shellEnv.resolveCommand;
  shellEnv.resolveCommand = () => path.join(os.tmpdir(), 'no such dir', 'gh');
  t.after(() => { shellEnv.resolveCommand = real; });
  const out = await listIssues(repo(t));
  assert.equal(out.ok, false);
  assert.match(out.error, /GitHub CLI \(gh\) not found/);
  assert.doesNotMatch(out.error, /ENOENT/);
});

test('a gh that hangs is stopped and reported', posixOnly('a shell script stub'), async (t) => {
  const bin = path.join(repo(t), 'tools');
  const gh = stubGh(bin, { sleep: 30 });
  const real = shellEnv.resolveCommand;
  shellEnv.resolveCommand = () => gh;
  github.__setGhTimeoutForTest(300);
  t.after(() => { shellEnv.resolveCommand = real; github.__setGhTimeoutForTest(); });
  const started = Date.now();
  const out = await listIssues(repo(t));
  assert.equal(out.ok, false);
  assert.match(out.error, /gh did not answer/);
  assert.ok(Date.now() - started < 5000);
});
