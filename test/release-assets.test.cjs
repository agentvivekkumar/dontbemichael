'use strict';
// The Windows beta's release gate (docs/designs/windows-11-installer.md, R1, R8,
// R10): Windows files ship on rc tags, and on clean tags only once the owner
// sets WINDOWS_RELEASE=on; a release without Windows drops every Windows file,
// its checksum lines and the Windows section of the notes. Mac files always ship.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { selectAssets, filterSums, releaseNotes, windowsSection } = require('../tools/release-assets.cjs');

const mac = ['Dont-Be-Michael-0.1.1-mac-universal.dmg', 'Dont-Be-Michael-0.1.1-mac-universal.zip', 'Dont-Be-Michael-0.1.1-mac-universal.zip.blockmap', 'latest-mac.yml'];
const win = ['Dont-Be-Michael-0.1.1-win-x64-setup.exe', 'Dont-Be-Michael-0.1.1-win-x64-setup.exe.blockmap', 'latest.yml'];
const junk = ['SHA256SUMS-macos-latest.txt', 'builder-debug.yml'];

test('Windows ships on rc tags, and on clean tags only with the switch on', () => {
  // Value: protects=no untested Windows build reaches users and Mac auto update always works; fails_when=the gate ignores the switch, or drops latest-mac.yml; why_new=R10; seam=none
  const all = [...mac, ...win, ...junk];
  assert.deepEqual(selectAssets(all, 'v0.1.1-rc.1', '').files, [...mac, ...win].sort());
  assert.equal(selectAssets(all, 'v0.1.1-rc.1', '').windows, true);
  const off = selectAssets(all, 'v0.1.1', '');
  assert.equal(off.windows, false);
  assert.deepEqual(off.files, [...mac].sort(), 'only Mac files, latest-mac.yml kept');
  assert.deepEqual(selectAssets(all, 'v0.1.1', 'on').files, [...mac, ...win].sort());
});

test('a failed Windows build ships the release without any Windows file', () => {
  // Value: protects=no dangling latest.yml or blockmap when the exe is missing; fails_when=leftover Windows files are published; why_new=R1, R8; seam=none
  const partial = selectAssets([...mac, 'latest.yml'], 'v0.1.1', 'on');
  assert.equal(partial.windows, false);
  assert.deepEqual(partial.files, [...mac].sort());
});

test('checksums and notes match what was published', () => {
  // Value: protects=SHA256SUMS and the release page never mention a missing file; fails_when=Windows lines or the Windows section survive a Mac only release; why_new=R8; seam=none
  const sums = 'aaa  Dont-Be-Michael-0.1.1-mac-universal.dmg\nbbb  Dont-Be-Michael-0.1.1-win-x64-setup.exe\n';
  assert.equal(filterSums(sums, mac), 'aaa  Dont-Be-Michael-0.1.1-mac-universal.dmg\n');
  const md = 'Mac\n<!-- windows -->\nWindows row\n<!-- /windows -->\nLinux will follow.\n';
  assert.equal(releaseNotes(md, false), 'Mac\nLinux will follow.\n');
  assert.equal(releaseNotes(md, true), md);
  assert.match(fs.readFileSync(path.resolve(__dirname, '../RELEASE.md'), 'utf8'), /<!-- windows -->[\s\S]+win-x64-setup\.exe[\s\S]+<!-- \/windows -->/, 'RELEASE.md keeps its Windows section between the markers');
});

test('the release workflow builds Windows as a beta leg and publishes through the gate', () => {
  const wf = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/release.yml'), 'utf8');
  assert.match(wf, /- os: windows-2022\n\s+args: --win/);
  assert.match(wf, /continue-on-error: \$\{\{ matrix\.os == 'windows-2022' \}\}/, 'only the Windows leg may fail (R1)');
  assert.match(wf, /- name: Package installers\n\s+shell: bash/, 'bash on the pwsh default Windows runner');
  assert.match(wf, /node tools\/release-assets\.cjs artifacts release RELEASE\.md release-notes\.md/);
  assert.match(wf, /WINDOWS_RELEASE: \$\{\{ vars\.WINDOWS_RELEASE \}\}/);
  assert.match(wf, /body_path: release-notes\.md/);
  const builder = fs.readFileSync(path.resolve(__dirname, '../electron-builder.yml'), 'utf8');
  assert.doesNotMatch(builder, /target: portable/, 'installer only (R2)');
});

test('the publish step copies only the gated files from both build legs, with one merged checksum file and matching notes', (t) => {
  // Value: protects=the release job publishes exactly the gated files with checksums and notes that match them; fails_when=the CLI stops walking the per leg artifact folders, merges only one leg's SHA256SUMS, copies a dropped Windows file, or writes the unstripped notes; why_new=only the pure helpers were tested, never the script the workflow runs; seam=none
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-release-cli-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  // actions/download-artifact lays out one folder per build leg.
  const legs = { 'macos-latest-dist': [...mac, 'SHA256SUMS-macos-latest.txt'], 'windows-2022-dist': [...win, 'SHA256SUMS-windows-2022.txt'] };
  for (const [leg, files] of Object.entries(legs)) {
    fs.mkdirSync(path.join(base, 'artifacts', leg), { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(base, 'artifacts', leg, f), `content of ${f}`);
  }
  fs.writeFileSync(path.join(base, 'artifacts', 'macos-latest-dist', 'SHA256SUMS-macos-latest.txt'), 'aaa  Dont-Be-Michael-0.1.1-mac-universal.dmg\nbbb  Dont-Be-Michael-0.1.1-mac-universal.zip\n');
  fs.writeFileSync(path.join(base, 'artifacts', 'windows-2022-dist', 'SHA256SUMS-windows-2022.txt'), 'ccc  Dont-Be-Michael-0.1.1-win-x64-setup.exe\n');
  fs.writeFileSync(path.join(base, 'artifacts', 'macos-latest-dist', 'builder-debug.yml'), 'x');
  const notes = path.join(base, 'RELEASE.md');
  fs.writeFileSync(notes, 'Mac\n<!-- windows -->\nWindows row\n<!-- /windows -->\nLinux will follow.\n');
  const run = (tag, out, notesOut) => spawnSync(process.execPath, [path.resolve(__dirname, '../tools/release-assets.cjs'), path.join(base, 'artifacts'), path.join(base, out), notes, path.join(base, notesOut)], {
    encoding: 'utf8', env: { ...process.env, TAG: tag, WINDOWS_RELEASE: '' }
  });

  const clean = run('v0.1.1', 'clean', 'clean-notes.md');
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(fs.readdirSync(path.join(base, 'clean')).sort(), [...mac, 'SHA256SUMS.txt'].sort(), 'a clean tag without the switch publishes Mac only');
  assert.equal(fs.readFileSync(path.join(base, 'clean', 'Dont-Be-Michael-0.1.1-mac-universal.dmg'), 'utf8'), 'content of Dont-Be-Michael-0.1.1-mac-universal.dmg');
  assert.equal(fs.readFileSync(path.join(base, 'clean', 'SHA256SUMS.txt'), 'utf8'), 'aaa  Dont-Be-Michael-0.1.1-mac-universal.dmg\nbbb  Dont-Be-Michael-0.1.1-mac-universal.zip\n');
  assert.equal(fs.readFileSync(path.join(base, 'clean-notes.md'), 'utf8'), 'Mac\nLinux will follow.\n');

  fs.appendFileSync(notes, 'https://github.com/agentvivekkumar/dontbemichael/releases/latest/download/Dont-Be-Michael-0.1.1-mac-universal.dmg\n');
  const rc = run('v0.1.1-rc.1', 'rc', 'rc-notes.md');
  assert.equal(rc.status, 0, rc.stderr);
  assert.deepEqual(fs.readdirSync(path.join(base, 'rc')).sort(), [...mac, ...win, 'SHA256SUMS.txt'].sort(), 'an rc tag publishes Windows too');
  const sums = fs.readFileSync(path.join(base, 'rc', 'SHA256SUMS.txt'), 'utf8');
  assert.match(sums, /aaa {2}Dont-Be-Michael-0\.1\.1-mac-universal\.dmg/);
  assert.match(sums, /ccc {2}Dont-Be-Michael-0\.1\.1-win-x64-setup\.exe/, 'both legs\' checksums are merged');
  const rcNotes = fs.readFileSync(path.join(base, 'rc-notes.md'), 'utf8');
  assert.match(rcNotes, /Windows row/);
  assert.match(rcNotes, /releases\/download\/v0\.1\.1-rc\.1\/Dont-Be-Michael-0\.1\.1-mac-universal\.dmg/, 'the CLI pins an rc page\'s links to its tag');

  const usage = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/release-assets.cjs')], { encoding: 'utf8' });
  assert.equal(usage.status, 2, 'missing arguments stop the release instead of publishing nothing');
});

test('the link check accepts a release candidate version and catches an rc name left behind after the release', (t) => {
  // Value: protects=RELEASE.md links match the version being tagged, rc suffix included; fails_when=the asset pattern drops the -rc.N suffix, so an rc build fails the check or a leftover rc link passes a clean release and 404s; why_new=check-release-links had no test, and rc versions are new; seam=none
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-links-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(base, 'tools'));
  for (const f of ['check-release-links.cjs', 'release-assets.cjs']) fs.copyFileSync(path.resolve(__dirname, '../tools', f), path.join(base, 'tools', f));
  const md = (v) => `[\`Dont-Be-Michael-${v}-mac-universal.dmg\`](https://github.com/agentvivekkumar/dontbemichael/releases/latest/download/Dont-Be-Michael-${v}-mac-universal.dmg)\n`
    + `<!-- windows -->\n[\`Dont-Be-Michael-${v}-win-x64-setup.exe\`](https://github.com/agentvivekkumar/dontbemichael/releases/download/v${v}/Dont-Be-Michael-${v}-win-x64-setup.exe)\n<!-- /windows -->\n`
    + `[Source code](https://github.com/agentvivekkumar/dontbemichael/archive/refs/tags/v${v}.zip)\n`;
  const check = (pkgVersion, mdVersion) => {
    fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify({ version: pkgVersion }));
    fs.writeFileSync(path.join(base, 'RELEASE.md'), md(mdVersion));
    return spawnSync(process.execPath, [path.join(base, 'tools', 'check-release-links.cjs')], { encoding: 'utf8' });
  };
  const rc = check('0.1.1-rc.1', '0.1.1-rc.1');
  assert.equal(rc.status, 0, rc.stderr);
  const leftover = check('0.1.1', '0.1.1-rc.1');
  assert.equal(leftover.status, 1, 'an rc name left in RELEASE.md fails the clean release');
  assert.match(leftover.stderr, /advertises Dont-Be-Michael-0\.1\.1-rc\.1-mac-universal\.dmg but package\.json says 0\.1\.1/);
  assert.match(leftover.stderr, /links source for tag v0\.1\.1-rc\.1 but package\.json says 0\.1\.1/);
  assert.equal(check('0.1.1', '0.1.1').status, 0);
});

test('an rc release page links to its own tag, never to latest, and both tools read one Windows marker', () => {
  // Value: protects=the Mac link on an rc release page downloads the rc; fails_when=latest links survive on a prerelease page (latest skips prereleases, so they 404), or the link check keeps its own copy of the Windows marker and drifts; why_new=pre-landing review; seam=none
  const latest = 'https://github.com/agentvivekkumar/dontbemichael/releases/latest/download/Dont-Be-Michael-0.1.1-rc.1-mac-universal.dmg';
  const pinned = 'https://github.com/agentvivekkumar/dontbemichael/releases/download/v0.1.1-rc.1/Dont-Be-Michael-0.1.1-rc.1-mac-universal.dmg';
  const md = `[Mac](${latest})\n[Mac again](${latest})\n<!-- windows -->\nWindows row\n<!-- /windows -->\n`;
  assert.equal(releaseNotes(md, true, 'v0.1.1-rc.1'), `[Mac](${pinned})\n[Mac again](${pinned})\n<!-- windows -->\nWindows row\n<!-- /windows -->\n`);
  assert.equal(releaseNotes(md, false, 'v0.1.1-rc.1'), `[Mac](${pinned})\n[Mac again](${pinned})\n`);
  assert.equal(releaseNotes(md, true, 'v0.1.1'), md, 'a clean release keeps latest links');
  assert.equal(windowsSection(md), '<!-- windows -->\nWindows row\n<!-- /windows -->\n');
  assert.equal(windowsSection('no markers'), '');
  const links = fs.readFileSync(path.resolve(__dirname, '../tools/check-release-links.cjs'), 'utf8');
  assert.match(links, /const \{ windowsSection \} = require\('\.\/release-assets\.cjs'\);/);
  assert.doesNotMatch(links, /<!-- windows -->\[/, 'no second copy of the marker pattern');
  assert.match(links, /version\.includes\('-'\)\n\s+\? `https:\/\/github\.com\/agentvivekkumar\/dontbemichael\/releases\/download\/v\$\{version\}\/`/, 'the live check reads an rc from its tag');
});
