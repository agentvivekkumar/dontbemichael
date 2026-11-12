'use strict';

/**
 * A path from agent text never makes the app reach another machine. statAbs
 * backs the terminal's ⌘-click and the reveal in Finder or Explorer, and the
 * path it gets is whatever an agent printed, which can carry an email or a web
 * page. Looking at a Windows share opens an SMB session that can send the
 * user's Windows sign-in hash; looking at a macOS or Linux automount makes the
 * computer contact that host (PR 687 review, 2026-11-06).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { isNetworkPath, statAbs } = loadTs('src/main/fs.ts');

test('Windows shares are network paths, in every spelling', () => {
  // Value: protects=a quoted share path in agent output never opens an SMB session; fails_when=a slash, backslash or device form of a share passes; why_new=PR 687 review; seam=none
  for (const p of ['\\\\host\\share\\a.md', '//host/share/My Docs/a.md', '\\/host/share/a.md', '\\\\.\\pipe\\x', '\\\\?\\UNC\\host\\share\\a.md', '  //host/share/a.md']) {
    assert.equal(isNetworkPath(p, 'win32'), true, p);
  }
  assert.equal(isNetworkPath('\\\\?\\C:\\Users\\Jane\\a.md', 'win32'), false, 'a local long path');
  assert.equal(isNetworkPath('C:\\Users\\Jane\\My Docs\\a.md', 'win32'), false);
  assert.equal(isNetworkPath('C:/Users/Jane/a.md', 'win32'), false);
});

test('macOS and Linux automounts are network paths, local folders are not', () => {
  // Value: protects=an automount path in agent output never makes the computer contact a host; fails_when=/net, /Network, a case change or a .. route passes, or a local folder is refused; why_new=PR 687 review; seam=none
  for (const p of ['/net/host/x/a b.md', '/Network/Servers/host/a.md', '/NET/host/a.md', '/tmp/../net/host/a.md', '//host/share/a.md', '/net']) {
    assert.equal(isNetworkPath(p, 'darwin'), true, p);
  }
  for (const p of ['/Users/Jane/Business Reports/summary.md', '/tmp/notes.md', '/network-notes/a.md', '/Users/Jane/net/a.md', '/Volumes/Backup/a.md', '~/net/a.md', '/System/Volumes/Data/Users/Jane/a.md', '/System/Volumes/Data', '/System/Volumes/Datanet/a.md']) {
    assert.equal(isNetworkPath(p, 'darwin'), false, p);
  }
  assert.equal(isNetworkPath('/net/host/a.md', 'linux'), true);
});

test('the same automounts spelled through the Mac data volume are network paths', () => {
  // Value: protects=hovering agent text such as "/System/Volumes/Data/net/host/Q3 Docs/a.md" never makes the Mac contact that host; fails_when=the data volume spelling of /net or /Network passes, in any case or through ..; why_new=PR 687 review, 2026-11-12 (hover now stats quoted paths); seam=none
  for (const p of ['/System/Volumes/Data/net/host/Q3 Docs/a.md', '/system/volumes/data/NET/host/a.md', '/System/Volumes/Data/Network/Servers/host/a.md', '/System/Volumes/Data/net', '/tmp/../System/Volumes/Data/net/host/a.md', '/System/Volumes/Data/./net/host/a.md']) {
    assert.equal(isNetworkPath(p, 'darwin'), true, p);
  }
});

test('statAbs never looks at a network path and still finds a local file', async () => {
  // Value: protects=⌘-click and reveal refuse a share or automount before any stat, and a real file still opens; fails_when=statAbs stats a network path or stops finding local files; why_new=PR 687 review; seam=none
  const share = process.platform === 'win32' ? '\\\\host.invalid\\share\\a.md' : '/net/host.invalid/share/a.md';
  assert.deepEqual(await statAbs(share), { exists: false, isFile: false, path: share });
  assert.deepEqual(await statAbs('//host.invalid/share/a.md'), { exists: false, isFile: false, path: '//host.invalid/share/a.md' });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-net-'));
  const file = path.join(dir, 'My Docs a.md');
  fs.writeFileSync(file, 'x');
  const hit = await statAbs(file);
  assert.equal(hit.exists, true);
  assert.equal(hit.isFile, true);
  fs.rmSync(dir, { recursive: true, force: true });
});
