'use strict';

/**
 * Get Michael ready (docs/designs/get-michael-ready.md, owner 2026-10-07).
 *
 * A business owner on a brand new Mac finished setup and landed on an office
 * where nothing happened. Claude Code was missing, so the app ran Node's
 * installer inside Michael's own terminal: it waited for a Mac password in a
 * terminal the owner never sees, failed, and nothing said so. Sign in would
 * have been just as hidden. These checks keep the fix in place: Claude is
 * installed and signed in where the owner can see it (setup's Ready step, or
 * the Ask me card), with its own installer, and a missing Claude at start is
 * never silent.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const setup = loadTs('src/main/engineSetup.ts');
const { engineSetupPhase } = loadTs('src/shared/engineSetup.ts');

test('Claude installs with its own installer: no Node, no npm, no password', () => {
  const unix = setup.claudeInstallScript('darwin');
  assert.match(unix, /curl -fsSL https:\/\/claude\.ai\/install\.sh -o "\$__s"/);
  assert.match(unix, /bash "\$__s"/);
  assert.doesNotMatch(unix, /sudo|npm|nodejs\.org|installer -pkg/);
  // A failed download fails the script instead of piping nothing into bash.
  assert.match(unix, /\|\| \{ echo '  \[x\] Could not download the installer\.'; rm -f "\$__s"; exit 1; \}/);
  assert.doesNotMatch(unix, /\| bash/);
  const win = setup.claudeInstallScript('win32');
  assert.match(win, /install\.ps1/);
  assert.doesNotMatch(win, /"/, 'no double quotes: pty.ts wraps it in /d /s /c "..."');
});

test('a missing Claude at start installs nothing and says where to go', () => {
  for (const platform of ['darwin', 'win32']) {
    const s = setup.claudeMissingScript(platform);
    assert.match(s, /Get Michael ready/);
    assert.doesNotMatch(s, /curl|npm|sudo|install\.sh|install\.ps1|powershell/);
  }
  const main = read('src/main/index.ts');
  // The Claude branch comes before the old install ladder and returns.
  const claudeAt = main.indexOf('if (bin && claudeProvider && !ptyManager.isCommandAvailable(bin)) {');
  const ladderAt = main.indexOf('if (bin && !opts.noAutoInstall && !ptyManager.isCommandAvailable(bin)) {');
  assert.ok(claudeAt > 0 && ladderAt > claudeAt, 'Claude is handled before the install ladder');
  const branch = main.slice(claudeAt, ladderAt);
  assert.match(branch, /shellScript: claudeMissingScript\(process\.platform\)/);
  assert.match(branch, /send\('engineSetup:changed'/, 'Ask me hears at once');
  assert.match(branch, /return res;/);
  assert.doesNotMatch(branch, /pendingInstallRelaunch/, 'no relaunch is armed for a script that installs nothing');
});

test('the sign in state is read from claude auth status, and an unreadable one never blocks', () => {
  assert.deepEqual(setup.parseClaudeAuthStatus('{"loggedIn":true,"email":"owner@example.com"}'), { signedIn: true, email: 'owner@example.com' });
  assert.deepEqual(setup.parseClaudeAuthStatus('{"loggedIn":false}'), { signedIn: false });
  assert.equal(setup.parseClaudeAuthStatus('error: unknown command auth'), null);
  assert.equal(setup.parseClaudeAuthStatus('{"other":1}'), null);
  assert.equal(setup.engineSetupNeeded(false, null), true, 'not installed');
  assert.equal(setup.engineSetupNeeded(true, false), true, 'signed out');
  assert.equal(setup.engineSetupNeeded(true, true), false);
  assert.equal(setup.engineSetupNeeded(true, null), false, 'unknown sign in state does not lock the owner out');
});

test('the rows follow what main reports and what the step started', () => {
  const f = { installing: false, installFailed: false, browser: false };
  assert.equal(engineSetupPhase(undefined, f), 'checking');
  assert.equal(engineSetupPhase({ applies: true, installed: false, signedIn: false, needed: true }, { ...f, installing: true }), 'installing');
  assert.equal(engineSetupPhase({ applies: true, installed: false, signedIn: false, needed: true }, { ...f, installFailed: true }), 'installFailed');
  assert.equal(engineSetupPhase({ applies: true, installed: true, signedIn: false, needed: true }, f), 'signin');
  assert.equal(engineSetupPhase({ applies: true, installed: true, signedIn: false, needed: true }, { ...f, browser: true }), 'browser');
  assert.equal(engineSetupPhase({ applies: true, installed: true, signedIn: true, needed: false }, f), 'ready');
  assert.equal(engineSetupPhase({ applies: true, installed: true, signedIn: null, needed: false }, f), 'ready');
});

test('setup ends on the Ready step with Claude, and Open the office waits for it', () => {
  const w = read('src/renderer/src/components/OnboardingWizard.tsx');
  assert.match(w, /const withReady = isClaudeProvider\(godProvider\);/);
  assert.match(w, /const lastStep: Step = withReady \? 'ready' : 'permissions';/);
  assert.match(w, /: s === 'permissions' \? 'ready'/);
  assert.match(w, /\{step === 'ready' && <GetMichaelReady provider=\{godProvider\} onReadyChange=\{setEngineReady\} \/>\}/);
  assert.match(w, /onClick=\{finish\} disabled=\{busy \|\| !engineReady\}>\s*\{busy \? t\('common\.saving'\) : t\('engineSetup\.openOffice'\)\}/);
  assert.match(w, /\{step === 'ready' && !engineReady && \(\s*<PixelButton variant="ghost" size="md" onClick=\{finish\}/, 'Set up later still opens the office');
});

test('Ask me holds one card, counted, until Michael can start, and done restarts everyone on Claude', () => {
  const feed = read('src/renderer/src/shell/useNeedsYou.ts');
  assert.match(feed, /if \(merged\.engineSetup\?\.applies && merged\.engineSetup\.needed\) feed = \{ \.\.\.feed, count: feed\.count \+ 1 \};/);
  assert.match(feed, /onEngineSetupChanged\?\.\(\(\) => readEngine\(\)\)/);
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(ask, /<EngineSetupCard status=\{engineSetup\} \/>/);
  const card = read('src/renderer/src/components/EngineSetupCard.tsx');
  assert.match(card, /setPendingRestart\(a\.id, \{ at: Date\.now\(\), reason: 'engine', now: true \}\)/);
});

test('the setup terminals are not agents: their exit only tells the step to look again', () => {
  const main = read('src/main/index.ts');
  const at = main.indexOf('ptyManager.setExitHandler((id, exitCode, info) => {');
  const head = main.slice(at, at + 600);
  assert.match(head, /if \(isEngineSetupPty\(id\)\) \{[\s\S]*?send\('engineSetup:changed'[\s\S]*?return;/);
  assert.equal(setup.isEngineSetupPty('engine-setup-install'), true);
  assert.equal(setup.isEngineSetupPty('engine-setup-signin'), true);
  assert.equal(setup.isEngineSetupPty('god'), false);
});
