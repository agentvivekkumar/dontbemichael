'use strict';
// Release candidates update like releases (docs/designs/windows-11-installer.md,
// R7 and G1): the Windows beta check installs rc.1, publishes rc.2 and expects
// the app to offer it. Only the update paths use the prerelease-aware order;
// isNewer keeps ignoring the suffix for CLI and model version checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const loadTs = require('./load-ts.cjs');

// updater.ts imports electron and electron-updater. Stand both in so the real
// runCheck and runDownload can be driven through their IPC handlers, and catch
// the releases/latest poll at node:https so no test reaches the network.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-update-rc-'));
const handlers = new Map();
const fakeApp = { isPackaged: false, version: '0.1.0', getVersion() { return this.version; }, getPath: () => userData };
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { app: fakeApp, ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, shell: { openExternal() {} } }
};
const native = { check: async () => null, download: async () => [] };
const updaterModule = require.resolve('electron-updater');
require.cache[updaterModule] = {
  id: updaterModule, filename: updaterModule, loaded: true,
  exports: { autoUpdater: { checkForUpdates: () => native.check(), downloadUpdate: () => native.download(), on() {} } }
};

const { isNewerRelease, isNewer, pendingVersion, reduceStatus } = loadTs('src/shared/updateState.ts');
const { isMissingChannelFile, initAutoUpdater } = loadTs('src/main/updater.ts');

const sent = [];
const polls = [];
let latestRelease = null;
const realRequest = https.request;
https.request = (opts, onResponse) => {
  polls.push(opts.path);
  const req = new EventEmitter();
  req.destroy = () => {};
  req.end = () => setImmediate(() => {
    const res = new EventEmitter();
    res.setEncoding = () => {};
    onResponse(res);
    res.emit('data', JSON.stringify(latestRelease));
    res.emit('end');
  });
  return req;
};
// A stamp for the first version, so boot does not fetch a release page.
fs.writeFileSync(path.join(userData, 'last-run-version'), `${fakeApp.version}\n`);
initAutoUpdater(() => ({ send: (_channel, status) => sent.push(status) }));
fakeApp.isPackaged = true;
test.after(() => {
  https.request = realRequest;
  fs.rmSync(userData, { recursive: true, force: true });
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
const last = () => sent[sent.length - 1];

test('rc builds order before their release and after earlier rcs', () => {
  // Value: protects=rc.1 offers rc.2 and rc.2 offers the release; fails_when=the suffix is ignored again or a downgrade counts as newer; why_new=isNewer drops -rc.N by design; seam=none
  const rows = [
    ['0.1.1-rc.2', '0.1.1-rc.1', true],
    ['0.1.1', '0.1.1-rc.2', true],
    ['0.1.2-rc.1', '0.1.1', true],
    ['v0.1.1-rc.10', '0.1.1-rc.9', true],
    ['0.1.1-rc.1', '0.1.1-rc.2', false],
    ['0.1.1-rc.2', '0.1.1', false],
    ['0.1.1', '0.1.1', false],
    ['0.1.0', '0.1.1-rc.1', false],
    ['garbage', '0.1.1', false]
  ];
  for (const [a, b, want] of rows) assert.equal(isNewerRelease(a, b), want, `${a} vs ${b}`);
  assert.equal(isNewer('0.1.1-rc.2', '0.1.1-rc.1'), false, 'isNewer is unchanged for CLI and model checks (G1)');
  assert.equal(pendingVersion({ state: 'available', version: '0.1.1-rc.2' }, '0.1.1-rc.1'), '0.1.1-rc.2');
  const next = { state: 'available', version: '0.1.1' };
  assert.equal(reduceStatus({ state: 'available', version: '0.1.1-rc.2' }, next), next);
});

test('a release without this platform\'s update file means no update, not an error', () => {
  // Value: protects=Windows users see Up to date when a release ships without Windows; fails_when=the missing channel file error is shown and retried every interval; why_new=R8; seam=none
  assert.equal(isMissingChannelFile({ code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', message: 'x' }), true);
  assert.equal(isMissingChannelFile(new Error('Cannot find latest.yml in the latest release artifacts (https://x): HttpError: 404')), true);
  assert.equal(isMissingChannelFile(new Error('net::ERR_INTERNET_DISCONNECTED')), false);
  const src = fs.readFileSync(path.resolve(__dirname, '../src/main/updater.ts'), 'utf8');
  assert.match(src, /if \(isMissingChannelFile\(err\)\) \{[\s\S]*?emit\(\{ state: 'not-available' \}\);[\s\S]*?return;/);
  assert.match(src, /const downloadUrl = pickDownloadAsset\(rel\.assets\);\n\s+if \(tag && downloadUrl && isNewerRelease\(tag, app\.getVersion\(\)\)\)/);
  assert.match(src, /if \(!result \|\| !isNewerRelease\(result\.updateInfo\.version, app\.getVersion\(\)\)\)/);
});

test('prerelease order follows semver for every suffix the release tools accept', () => {
  // Value: protects=a beta build is offered the rc and a bare prerelease is offered its numbered ones, never a downgrade; fails_when=prerelease ids compare as whole strings, a shorter id list ranks newer, or a numeric id ranks above a word; why_new=check-release-links now accepts alpha, beta and rc tags and only rc.N was ordered; seam=none
  const rows = [
    ['0.1.1-beta.2', '0.1.1-alpha.5', true],
    ['0.1.1-rc.1', '0.1.1-beta.9', true],
    ['0.1.1-beta.9', '0.1.1-rc.1', false],
    ['0.1.1-rc.1', '0.1.1-rc', true],
    ['0.1.1-rc', '0.1.1-rc.1', false],
    ['0.1.1-rc.1', '0.1.1-1', true],
    ['0.1.10', '0.1.9-rc.3', true],
    ['0.2.0-rc.1', '0.1.9', true],
    ['0.1.1-rc.1', 'v0.1.1-rc.1', false]
  ];
  for (const [a, b, want] of rows) assert.equal(isNewerRelease(a, b), want, `${a} vs ${b}`);
});

test('a missing update file ends the real check and download at not-available, with no error and no poll', async () => {
  // Value: protects=a release without this platform reads Up to date; fails_when=runCheck's catch shows an error and polls releases/latest after the error listener already said not-available (electron-updater emits error, then rethrows); why_new=R8 only covered the listener; seam=none
  const missing = Object.assign(new Error('Cannot find latest.yml in the latest release artifacts (https://x): HttpError: 404'), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' });
  native.check = async () => { throw missing; };
  native.download = async () => { throw missing; };
  sent.length = 0;
  assert.deepEqual(await handlers.get('update:checkNow')(), { ok: true });
  assert.deepEqual(await handlers.get('update:download')(), { ok: true });
  await settle();
  assert.deepEqual(last(), { state: 'not-available' });
  assert.equal(sent.some((s) => s.state === 'error'), false);
  assert.deepEqual(polls, []);
});

test('an rc build is offered the clean release through releases/latest; rc to rc stays native', async () => {
  // Value: protects=an rc tester is offered 0.1.1 after 0.1.1-rc.2; fails_when=GitHubProvider keeps an rc build in the rc channel and nothing else asks for the clean release; why_new=native rc updates never see it; seam=none
  const asset = (name) => ({ name, browser_download_url: `https://github.com/agentvivekkumar/dontbemichael/releases/download/v0.1.1/${name}` });
  latestRelease = {
    tag_name: 'v0.1.1', html_url: 'https://github.com/agentvivekkumar/dontbemichael/releases/tag/v0.1.1',
    assets: ['Dont-Be-Michael-0.1.1-mac-universal.dmg', 'Dont-Be-Michael-0.1.1-win-x64-setup.exe', 'Dont-Be-Michael-0.1.1-linux-x86_64.AppImage'].map(asset)
  };
  // A clean build that is up to date does not poll.
  fakeApp.version = '0.1.0';
  native.check = async () => ({ updateInfo: { version: '0.1.0' } });
  await handlers.get('update:checkNow')();
  await settle();
  assert.deepEqual(polls, []);
  // rc.1 seeing rc.2 natively leaves it to the native events.
  fakeApp.version = '0.1.1-rc.1';
  native.check = async () => ({ updateInfo: { version: '0.1.1-rc.2' } });
  sent.length = 0;
  await handlers.get('update:checkNow')();
  await settle();
  assert.deepEqual(sent, [{ state: 'checking' }]);
  assert.deepEqual(polls, []);
  // rc.2 with nothing newer in its channel asks releases/latest.
  fakeApp.version = '0.1.1-rc.2';
  native.check = async () => ({ updateInfo: { version: '0.1.1-rc.2' } });
  await handlers.get('update:checkNow')();
  await settle();
  await settle();
  assert.deepEqual(polls, ['/repos/agentvivekkumar/dontbemichael/releases/latest']);
  assert.equal(last().state, 'available-manual');
  assert.equal(last().version, '0.1.1');
  assert.match(last().downloadUrl, /releases\/download\/v0\.1\.1\//);
});
