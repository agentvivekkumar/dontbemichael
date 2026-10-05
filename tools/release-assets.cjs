#!/usr/bin/env node
'use strict';

/**
 * What a release publishes (docs/designs/windows-11-installer.md, R1, R8, R10).
 *
 * Windows is a beta. Its files go out on every prerelease tag (vX.Y.Z-rc.N), so
 * the owner can test on a real PC, but on a clean tag only once the repository
 * variable WINDOWS_RELEASE is "on". A release that does not carry Windows (the
 * switch is off, or the Windows build failed) drops every Windows file, drops
 * their lines from SHA256SUMS, and strips the Windows section from the notes,
 * so nothing advertises a file that is not there.
 *
 * On a prerelease tag the notes' `releases/latest/download/` links are pinned to
 * the tag instead: GitHub's latest never points at a prerelease, so on an rc
 * release page those links would fetch the last clean release's file names and
 * 404.
 *
 * Only Windows files are ever dropped. `latest-mac.yml` feeds every Mac auto
 * update and is always kept; a `latest*.yml` filter would stop them all.
 *
 * Usage: node tools/release-assets.cjs <artifactsDir> <releaseDir> <notesIn> <notesOut>
 *   env TAG (e.g. v0.1.1 or v0.1.1-rc.1), WINDOWS_RELEASE ("on" to ship Windows on clean tags)
 */

const fs = require('node:fs');
const path = require('node:path');

const PUBLISHED = /\.(dmg|zip|exe|AppImage|blockmap)$|^latest(-mac|-linux)?\.yml$/;
const WINDOWS = /\.exe$|\.exe\.blockmap$|^latest\.yml$/;
const WINDOWS_BLOCK = /<!-- windows -->[\s\S]*?<!-- \/windows -->\n?/g;

/** True when this tag publishes Windows files, given the files that were built. */
function shipsWindows(names, tag, windowsSwitch) {
  const built = names.some((n) => /-win-x64-setup\.exe$/.test(n)) && names.includes('latest.yml');
  const allowed = String(tag).includes('-') || windowsSwitch === 'on';
  return built && allowed;
}

/** The file names to publish, out of everything the build jobs uploaded. */
function selectAssets(names, tag, windowsSwitch) {
  const windows = shipsWindows(names, tag, windowsSwitch);
  return { windows, files: names.filter((n) => PUBLISHED.test(n) && (windows || !WINDOWS.test(n))).sort() };
}

/** SHA256SUMS lines for the published files only. */
function filterSums(text, keep) {
  const set = new Set(keep);
  return String(text).split('\n').filter((line) => {
    const name = line.trim().split(/\s+\*?/).pop();
    return line.trim() && set.has(name);
  }).join('\n') + '\n';
}

/** The Windows sections of the notes, joined; empty when there are none.
 *  check-release-links.cjs reads the same markers. */
function windowsSection(markdown) {
  return (String(markdown).match(WINDOWS_BLOCK) ?? []).join('\n');
}

/** The release notes with the Windows section removed when Windows is not
 *  shipped, and on a prerelease tag every latest download link pinned to it. */
function releaseNotes(markdown, windows, tag = '') {
  const notes = windows ? String(markdown) : String(markdown).replace(WINDOWS_BLOCK, '');
  return String(tag).includes('-') ? notes.split('releases/latest/download/').join(`releases/download/${tag}/`) : notes;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

if (require.main === module) {
  const [src, out, notesIn, notesOut] = process.argv.slice(2);
  if (!src || !out || !notesIn || !notesOut) {
    console.error('usage: release-assets.cjs <artifactsDir> <releaseDir> <notesIn> <notesOut>');
    process.exit(2);
  }
  const all = walk(src);
  const byName = new Map(all.map((p) => [path.basename(p), p]));
  const { windows, files } = selectAssets([...byName.keys()], process.env.TAG || '', process.env.WINDOWS_RELEASE || '');
  fs.mkdirSync(out, { recursive: true });
  for (const f of files) fs.copyFileSync(byName.get(f), path.join(out, f));
  const sums = all.filter((p) => /SHA256SUMS-.*\.txt$/.test(p)).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), filterSums(sums, files));
  fs.writeFileSync(notesOut, releaseNotes(fs.readFileSync(notesIn, 'utf8'), windows, process.env.TAG || ''));
  console.log(`Windows ${windows ? 'included' : 'not included'}; publishing ${files.length} files:\n  ${files.join('\n  ')}`);
}

module.exports = { selectAssets, shipsWindows, filterSums, releaseNotes, windowsSection };
