'use strict';

/**
 * Whether Claude Code's shell sandbox starts on this computer
 * (src/main/osSandbox.ts), and what the spawn settings do when it does not.
 *
 * Where the sandbox cannot start, the shell lock (`allowUnsandboxedCommands:
 * false`) makes Claude Code refuse every shell command. Windows has no sandbox
 * at all, so it goes without the lock (owner 2026-10-09). Linux can be in that
 * state too (no bubblewrap or socat, or AppArmor blocking bubblewrap on Ubuntu
 * 24.04 and later), but the owner can fix it, so Linux keeps the lock and fails
 * closed (owner 2026-10-18), and the log says what to install.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const sb = loadTs('src/main/osSandbox.ts');
const { folderPolicy } = loadTs('src/shared/folderAccess.ts');
const W = loadTs('src/shared/webAccess.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

/** Facts for a Linux machine; override what a case changes. */
const linux = (over = {}) => ({
  platform: 'linux',
  has: () => true,
  apparmorRestrictsUserns: () => null,
  bwrapStarts: () => ({ ok: true }),
  ...over
});

test('a Mac always has the sandbox and Windows never does, without probing', () => {
  const never = () => { throw new Error('must not probe'); };
  const facts = { has: never, apparmorRestrictsUserns: never, bwrapStarts: never };
  assert.deepEqual(sb.classifyOsSandbox({ platform: 'darwin', ...facts }), { state: 'ready', holds: true, missing: [], fix: [] });
  assert.deepEqual(sb.classifyOsSandbox({ platform: 'win32', ...facts }), { state: 'no-sandbox-on-windows', holds: false, missing: [], fix: [] });
});

test('a Linux with bubblewrap that starts holds the sandbox', () => {
  const s = sb.classifyOsSandbox(linux());
  assert.equal(s.state, 'ready');
  assert.equal(s.holds, true);
});

test('a Linux missing bubblewrap or socat does not hold it, and names what to install', () => {
  // Value: protects=a stock Linux desktop (neither tool installed) gets team members who can run commands, and the owner is told what to install; fails_when=missing tools read as a working sandbox; why_new=the settings keyed on the OS name, so Linux always got the lock; seam=SandboxFacts.has
  let started = false;
  const s = sb.classifyOsSandbox(linux({ has: (c) => c === 'socat', bwrapStarts: () => { started = true; return { ok: true }; } }));
  assert.equal(s.state, 'missing-tools');
  assert.equal(s.holds, false);
  assert.deepEqual(s.missing, ['bubblewrap']);
  assert.ok(s.fix.some((c) => c.startsWith('sudo apt-get install bubblewrap')), s.fix.join('\n'));
  assert.equal(started, false, 'no point starting a tool that is not there');
  const both = sb.classifyOsSandbox(linux({ has: () => false }));
  assert.deepEqual(both.missing, ['bubblewrap', 'socat']);
  assert.match(sb.osSandboxReason(both), /missing bubblewrap and socat/);
});

test('Ubuntu 24.04 with AppArmor blocking bubblewrap does not hold it, and gives the profile fix', () => {
  // Value: protects=the default Ubuntu 24.04 desktop, where bwrap is installed but cannot create user namespaces; fails_when=an installed bwrap is taken as a working sandbox; why_new=Claude Code docs name this case, the app never checked; seam=SandboxFacts.bwrapStarts and apparmorRestrictsUserns
  const s = sb.classifyOsSandbox(linux({
    apparmorRestrictsUserns: () => true,
    bwrapStarts: () => ({ ok: false, error: 'bwrap: setting up uid map: Permission denied\n' })
  }));
  assert.equal(s.state, 'blocked-by-apparmor');
  assert.equal(s.holds, false);
  assert.equal(s.detail, 'bwrap: setting up uid map: Permission denied');
  assert.ok(s.fix.some((l) => l.includes('/etc/apparmor.d/bwrap')), 'the fix writes a profile for bwrap');
  assert.ok(s.fix.includes('sudo systemctl reload apparmor'));
});

test('AppArmor restricting namespaces is not a failure when bubblewrap still starts', () => {
  // A machine that already has the bwrap profile reads 1 and works.
  const s = sb.classifyOsSandbox(linux({ apparmorRestrictsUserns: () => true }));
  assert.equal(s.state, 'ready');
});

test('bubblewrap failing for another reason does not hold it, and keeps the reason', () => {
  const s = sb.classifyOsSandbox(linux({ bwrapStarts: () => ({ ok: false, error: "bwrap: Can't mount proc on /newroot/proc: Operation not permitted" }) }));
  assert.equal(s.state, 'cannot-start');
  assert.equal(s.holds, false);
  assert.match(s.detail, /mount proc/);
  assert.deepEqual(s.fix, []);
});

test('every state has a plain reason for the owner', () => {
  for (const state of ['ready', 'no-sandbox-on-windows', 'missing-tools', 'blocked-by-apparmor', 'cannot-start']) {
    const text = sb.osSandboxReason({ state, holds: state === 'ready', missing: ['bubblewrap'], fix: [] });
    assert.ok(typeof text === 'string' && text.length > 20, state);
  }
});

// --- What the spawn settings do with the answer ------------------------------

const abs = (p) => path.resolve(p);
const B = abs('/Users/me/Documents/Pho');
const layout = { business: B, teamFolders: [path.join(B, 'Finance'), path.join(B, 'Admin')] };
const oscar = { isGod: false, cwd: path.join(B, 'Finance') };
const ruleFor = (tool, folder) => `${tool}(//${folder.replace(/\\/g, '/').replace(/^\//, '')}/**)`;

async function settingsWith(t, status) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-sandbox-'));
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); sb.setOsSandboxProbe(null); });
  sb.setOsSandboxProbe(() => status);
  const inj = await new HiveManager(() => home).ensureAgent(
    { id: 'oscar', name: 'Oscar', provider: 'claude', cwd: oscar.cwd },
    { folderPolicy: folderPolicy(oscar, layout, true), network: W.sandboxNetwork() }
  );
  return JSON.parse(fs.readFileSync(inj.args[inj.args.indexOf('--settings') + 1], 'utf8'));
}

test('where the sandbox starts, a member is locked to it and kept off the internet', async (t) => {
  const s = await settingsWith(t, sb.classifyOsSandbox(linux()));
  assert.equal(s.sandbox.allowUnsandboxedCommands, false);
  assert.deepEqual(s.sandbox.network, { allowedDomains: [], strictAllowlist: true });
});

test('on a Linux where the sandbox cannot start, a member keeps the lock and the network list, so its shell fails closed', async (t) => {
  // Value: protects=only Research reaches the internet, in every office, even on a Linux without a working bubblewrap; fails_when=the lock or network list is dropped where the owner can still fix the sandbox, so shell commands run open; why_new=owner review of #423 (fail closed on Linux); seam=setOsSandboxProbe
  for (const status of [
    sb.classifyOsSandbox(linux({ has: () => false })),
    sb.classifyOsSandbox(linux({ apparmorRestrictsUserns: () => true, bwrapStarts: () => ({ ok: false, error: 'denied' }) })),
    sb.classifyOsSandbox(linux({ bwrapStarts: () => ({ ok: false, error: 'mount proc' }) }))
  ]) {
    const s = await settingsWith(t, status);
    assert.equal(s.sandbox.allowUnsandboxedCommands, false, `${status.state}: the lock stays`);
    assert.deepEqual(s.sandbox.network, { allowedDomains: [], strictAllowlist: true }, `${status.state}: the network list stays`);
    assert.ok(s.permissions.deny.includes(ruleFor('Read', path.join(B, 'Admin'))), `${status.state}: the file tools stay held`);
    assert.match(sb.osSandboxReason(status), /can't run shell commands on this computer/, `${status.state}: the reason says commands are refused`);
  }
});

test('Windows alone goes without the lock and the network list, and its file tools stay held', async (t) => {
  // Value: protects=a Windows member can still run commands (no sandbox exists there, #187); fails_when=the Windows state gets the lock; why_new=the lock now keys on the sandbox state; seam=setOsSandboxProbe
  const status = sb.classifyOsSandbox({ platform: 'win32', has: () => true, apparmorRestrictsUserns: () => null, bwrapStarts: () => ({ ok: true }) });
  const s = await settingsWith(t, status);
  assert.equal(s.sandbox.allowUnsandboxedCommands, undefined);
  assert.equal(s.sandbox.network, undefined);
  assert.ok(s.permissions.deny.includes(ruleFor('Read', path.join(B, 'Admin'))));
});

test('the real probe on Linux answers quickly with a known state', { skip: process.platform !== 'linux' && 'Linux only: runs bubblewrap' }, () => {
  sb.setOsSandboxProbe(null);
  const started = Date.now();
  const s = sb.osSandboxStatus();
  assert.ok(['ready', 'missing-tools', 'blocked-by-apparmor', 'cannot-start'].includes(s.state), s.state);
  assert.equal(s.holds, s.state === 'ready');
  assert.ok(Date.now() - started < 6_000, 'the probe is bounded by its timeout');
  assert.equal(sb.osSandboxStatus(), s, 'answered once and cached');
});
