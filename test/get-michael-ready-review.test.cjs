'use strict';

/**
 * Get Michael ready, after the 2026-10-07 pre-landing review
 * (docs/designs/get-michael-ready.md). The review found ways the first run
 * still left an owner stuck: the key check ignored the system proxy, Windows
 * .cmd shims could not report their sign in, change notices were dropped, a
 * Windows PATH was searched wrong, and Claude turning ready restarted agents
 * that were already at work. These checks keep those fixes in place.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const setup = loadTs('src/main/engineSetup.ts');

test('checking a key asks Anthropic once, the right way, and a dead network or timeout reads as unreachable', async () => {
  // Value: protects=the key goes only to api.anthropic.com in a header, the check never hangs setup, and a network failure is never reported as a bad key; fails_when=checkAnthropicKey changes the URL, method or headers, drops the timeout signal, or maps an error or timeout to anything but unreachable; why_new=the check now runs on Electron's fetch, which production uses; seam=none (fetch injected, no network)
  const key = 'sk-ant-api03-' + 'q'.repeat(40);
  const calls = [];
  const answer = (status) => async (url, init) => { calls.push({ url, init }); return { status }; };
  for (const [status, want] of [[200, 'ok'], [401, 'rejected'], [403, 'rejected'], [429, 'unreachable'], [503, 'unreachable']]) {
    assert.equal(await setup.checkAnthropicKey(key, answer(status)), want, `HTTP ${status}`);
  }
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/models?limit=1');
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual(calls[0].init.headers, { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
  assert.ok(calls[0].init.signal instanceof AbortSignal, 'a timeout signal rides along');
  assert.equal(await setup.checkAnthropicKey(key, async () => { throw new TypeError('fetch failed'); }), 'unreachable', 'a network error');
  const hang = (_url, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
  assert.equal(await setup.checkAnthropicKey(key, hang, 20), 'unreachable', 'a fetch that never answers is cut off');
  const main = read('src/main/index.ts');
  assert.match(main, /const verdict = await checkAnthropicKey\(key, net\.fetch as unknown as KeyCheckFetch\);/, 'production uses Electron fetch, which follows the system proxy');
  assert.doesNotMatch(main, /const netRequest =/, 'no hand-made request adapter');
});

test('auth status on Windows goes through cmd.exe for a .cmd shim, quoted for paths with spaces', () => {
  // Value: protects=an npm-installed Claude on Windows reads its sign in instead of failing with EINVAL into "could not check"; fails_when=the .cmd/.bat test, the ComSpec fallback, the /s quoting or verbatim arguments change; why_new=review cycle 2; seam=none
  const c = setup.claudeAuthStatusCommand;
  const npm = String.raw`C:\Users\Ann Lee\AppData\Roaming\npm\claude.cmd`;
  assert.deepEqual(c('win32', npm, String.raw`C:\Windows\system32\cmd.exe`),
    { file: String.raw`C:\Windows\system32\cmd.exe`, args: ['/d', '/s', '/c', `""${npm}" auth status --json"`], verbatim: true });
  assert.equal(c('win32', String.raw`C:\x\CLAUDE.CMD`).file, 'cmd.exe', 'any case, and cmd.exe when ComSpec is unset');
  assert.equal(c('win32', String.raw`C:\x\claude.bat`).verbatim, true);
  const exe = String.raw`C:\Users\o\.local\bin\claude.exe`;
  assert.deepEqual(c('win32', exe), { file: exe, args: ['auth', 'status', '--json'], verbatim: false });
  assert.deepEqual(c('darwin', '/Users/o/.local/bin/claude'), { file: '/Users/o/.local/bin/claude', args: ['auth', 'status', '--json'], verbatim: false });
  assert.match(read('src/main/index.ts'), /const cmd = claudeAuthStatusCommand\(process\.platform, path, process\.env\.ComSpec\);/);
});

test('change notices: the first goes at once, a burst sends one more at the end of the window, none is dropped', () => {
  // Value: protects=a team restore sends a few notices, not one per member, and a key cleared right after still reaches the card; fails_when=the window stops coalescing, or a notice inside it is dropped instead of sent at its end; why_new=review cycle 2 (leading edge only dropped later notices); seam=none (clock injected)
  let now = 0; const timers = []; const sent = [];
  const notice = setup.makeNoticeCoalescer((id) => sent.push(id), 2000, { now: () => now, setTimeout: (fn, ms) => timers.push({ fn, at: now + ms }) });
  notice('a'); notice('b'); notice('c');
  assert.deepEqual(sent, ['a'], 'the first at once');
  assert.equal(timers.length, 1, 'one timer for the burst');
  now = timers[0].at; timers[0].fn();
  assert.deepEqual(sent, ['a', 'c'], 'the latest of the burst at the end of the window');
  now += 2500; notice('d');
  assert.deepEqual(sent, ['a', 'c', 'd'], 'after a quiet window, at once again');
});

test('the fast Claude lookup searches a Windows PATH right, never builds folders from unset variables, and matches the PTY', () => {
  // Value: protects=a claude.exe found only on a Windows PATH is found, an unset APPDATA never points at a drive-root folder another user could plant, and status never says ready where the spawn would fail; fails_when=the Windows PATH is split on ':', a trailing separator doubles, empty variables become '\npm', or a trusted folder is missing from pty.ts; why_new=review cycle 2; seam=none (exists injected)
  const find = (platform, pathEnv, have, extra = {}) =>
    setup.findClaudeFast({ platform, pathEnv, home: platform === 'win32' ? String.raw`C:\Users\o` : '/Users/o', exists: (p) => have.includes(p), ...extra });
  assert.equal(find('win32', String.raw`C:\Windows;C:\Tools\ `.trim(), [String.raw`C:\Tools\claude.exe`]), String.raw`C:\Tools\claude.exe`, 'several Windows PATH entries, one ending in a backslash');
  assert.equal(find('darwin', '/usr/bin:/opt/c/', ['/opt/c/claude']), '/opt/c/claude', 'a PATH entry ending in a slash');
  const asked = [];
  setup.findClaudeFast({ platform: 'win32', pathEnv: '', home: String.raw`C:\Users\o`, exists: (p) => { asked.push(p); return false; } });
  assert.ok(asked.length > 0 && asked.every((p) => p.startsWith(String.raw`C:\Users\o`)), 'unset APPDATA and LOCALAPPDATA add no folders');
  const pty = read('src/main/pty.ts');
  for (const dir of ['/.local/bin/', '/.claude/local/', '/opt/homebrew/bin/', '/usr/local/bin/', '/.volta/bin/']) assert.ok(pty.includes(dir), `pty.ts looks in ${dir}`);
  for (const dir of [String.raw`\\.local\\bin\\`, String.raw`\\Programs\\claude\\`, String.raw`\\npm\\`, String.raw`\\.claude\\local\\`]) assert.ok(pty.includes(dir), `pty.ts looks in ${dir}`);
});

test('Claude turning ready restarts only the members that could not start, and a slow read never fakes ready', () => {
  // Value: protects=agents already at work are never killed when a key is replaced or a read flaps, and a signed out owner is not shown as ready after one slow check; fails_when=status stops naming the blocked terminals, the feed fires without them, or a failed auth read drops what was known; why_new=review cycle 2 red team; seam=none (source pins for main and the feed, no IPC or DOM harness)
  const main = read('src/main/index.ts');
  assert.match(main, /if \(status\.applies && !status\.needed && claudeBlocked\.size\) return \{ \.\.\.status, restart: \[\.\.\.claudeBlocked\.keys\(\)\] \};/);
  assert.match(main, /const teamNeedsClaude = \[\.\.\.claudeBlocked\.values\(\)\]\.some\(\(b\) => !b\.god\);/, "Michael's own blocked start never makes the card speak for the team");
  assert.match(main, /authStatus: \(path\) => claudeAuth\.read\(path\)/, 'status reads through the shared reader');
  assert.match(main, /if \(isEngineSetupPty\(id\)\) \{\s*\/\/[^\n]*\n\s*claudeAuth\.invalidate\(\);/, 'a finished sign in or install makes the next read fresh');
  assert.match(main, /if \(signedOutStart\) claudeBlocked\.set\(opts\.id, \{ god: !!opts\.hive\?\.isGod \}\);\s*else if \(!claudeMissing\) claudeBlocked\.delete\(opts\.id\);/, 'a signed out start restarts once signed in; any other start leaves the list');
  assert.match(main, /try \{ if \(approveClaudeApiKey\(key\)\) hiddenApprovedKey = key; \}/, 'a failed approval is tried again');
  const feed = read('src/renderer/src/shell/useNeedsYou.ts');
  assert.match(feed, /if \(wasNeeded && merged\.engineSetup\?\.applies && !merged\.engineSetup\.needed && restart\.length/, 'no edge for another engine or with nobody to restart');
  assert.match(feed, /new CustomEvent\(ENGINE_READY_EVENT, \{ detail: \{ restart \} \}\)/);
  const ready = read('src/renderer/src/components/GetMichaelReady.tsx');
  assert.match(ready, /if \(e\.id === ENGINE_SIGNIN_PTY\) \{\s*setBrowser\(false\);\s*setSignInStuck\(s\.signedIn === false\);/, 'a finished sign in never leaves the step waiting on the browser');
  const pty = read('src/main/pty.ts');
  assert.match(pty, /const resolved = typeof opts\.shellScript === 'string' \? opts\.command : this\.resolveCommand\(opts\.command\)\.path;/, 'a script spawn never looks its command up');
});

test('the sign in reader: one read at a time, never joins a read from before a sign in ended, keeps the last known state', async () => {
  // Value: protects=a finished sign in is seen as signed in, overlapping callers share one claude auth status, and a slow read never turns a signed out owner into "could not check"; fails_when=the in-flight slot is never cleared, invalidate stops forcing a fresh read, the last known state is not kept, or non-JSON output stops reading as unknown; why_new=review cycle 3; seam=none (exec and clock injected)
  let now = 0; const runs = [];
  const reader = setup.makeClaudeAuthReader((_p, done) => runs.push(done), () => now);
  const a = reader.read('/c'); const b = reader.read('/c');
  assert.equal(runs.length, 1, 'two callers, one claude auth status');
  runs[0](null, '{"loggedIn":false}');
  assert.deepEqual(await a, { signedIn: false }); assert.deepEqual(await b, { signedIn: false });
  // A read in flight, then the sign in ends: the next caller gets a fresh read after it.
  now = 10; const c = reader.read('/c');
  now = 20; reader.invalidate();
  const d = reader.read('/c');
  runs[1](null, '{"loggedIn":false}');
  assert.deepEqual(await c, { signedIn: false });
  await new Promise((r) => setImmediate(r));
  assert.equal(runs.length, 3, 'the read asked for after the sign in did not join the older one');
  runs[2](null, '{"loggedIn":true,"email":"owner@example.com"}');
  assert.deepEqual(await d, { signedIn: true, email: 'owner@example.com' });
  // Timed out with nothing printed: the last known state.
  now = 30; const e = reader.read('/c'); runs[3](Object.assign(new Error('timeout'), { killed: true }), '');
  assert.deepEqual(await e, { signedIn: true, email: 'owner@example.com' });
  // Printed something that is not the JSON: a Claude without the command.
  now = 40; const f = reader.read('/c'); runs[4](new Error('exit 1'), "error: unknown command 'auth'");
  assert.equal(await f, null);
  // The slot clears after each read.
  now = 50; reader.read('/c'); assert.equal(runs.length, 6);
});

test('a key Claude would stop to ask about is never saved, the first start checks sign in, and a closed member leaves the list', () => {
  // Value: protects=setup never reports ready on a key ~/.claude.json does not approve, a fresh launch never starts a signed out team blind, and a member the owner closed never keeps the team card up; fails_when=the key is saved before or without a confirmed approval, the first account start skips the sign in read, or pty:kill stops clearing the blocked entry; why_new=Codex adversarial pass 3; seam=none (source pins, main has no IPC harness)
  const main = read('src/main/index.ts');
  const h = main.slice(main.indexOf("ipcMain.handle('engineSetup:useApiKey'"));
  const handler = h.slice(0, h.indexOf('\n});') + 4);
  assert.match(handler, /try \{ approved = approveClaudeApiKey\(key\); \} catch \{ approved = false; \}\s*if \(!approved\) return \{ ok: false, error: 'store' \};/);
  assert.ok(handler.indexOf('approveClaudeApiKey(key)') < handler.indexOf("integrations.setSecret(providerKeyRef('anthropic'), key)"), 'approved before it is saved');
  assert.ok(handler.indexOf("integrations.setSecret(providerKeyRef('anthropic'), key)") < handler.indexOf("writeConfig({ claudeAuth: 'apiKey' })"), 'saved before the team switches to it');
  assert.match(main, /readConfig\(\)\.claudeAuth !== 'apiKey' && claudeAuth\.last\(\) === null\) \{\s*const path = claudePathFast\(\);\s*if \(path\) \{ try \{ await claudeAuth\.read\(path\); \}/, 'the first account start reads sign in once');
  const kill = main.slice(main.indexOf("ipcMain.handle('pty:kill'"));
  assert.match(kill.slice(0, kill.indexOf('\n});')), /claudeBlocked\.delete\(id\);/, 'a closed member no longer waits on Claude');
});
