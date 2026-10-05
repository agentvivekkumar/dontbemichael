#!/usr/bin/env node
'use strict';

/**
 * Release gate: every download link we advertise must actually resolve.
 *
 * WHY THIS EXISTS. RELEASE.md is published verbatim as the GitHub release body,
 * and its download table links to
 * `/releases/latest/download/Dont-Be-Michael-<version>-<platform>.<ext>`. That URL
 * form requires the EXACT filename present in whichever release is currently
 * "latest", and electron-builder bakes ${version} into every artifact name — so a
 * version string left behind in RELEASE.md turns all four download links into
 * hard 404s the moment the next release ships.
 *
 * That is not hypothetical. The table sat pinned at 0.3.2 from v0.3.4 through
 * v0.3.7, and mac DMG downloads fell from 118 and 76 on v0.3.2/v0.3.3 to single
 * digits on every release after. Nothing failed, nothing warned; the release
 * simply stopped being installable for anyone arriving through GitHub, and the
 * page even claimed the opposite ("stays correct across versions").
 *
 * Two modes:
 *   (default) offline — every advertised version string matches package.json.
 *             Run this BEFORE tagging, when the assets do not exist yet.
 *   --live    also HEADs each URL and requires 200. Run this AFTER publishing
 *             the release, which is the only moment the answer is meaningful.
 */

const fs = require('node:fs');
const path = require('node:path');
const { windowsSection } = require('./release-assets.cjs');

const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const releaseMd = fs.readFileSync(path.join(root, 'RELEASE.md'), 'utf8');

const problems = [];

// — 1. every pinned artifact name must carry the current version —
// A release candidate carries its suffix (0.1.1-rc.1) in asset names and tags.
const assetRe = /Dont-Be-Michael-(\d+\.\d+\.\d+(?:-(?:rc|beta|alpha)\.\d+)?)-([^\s`)]+)/g;
const assets = new Set();
for (const m of releaseMd.matchAll(assetRe)) {
  if (m[1] !== version) {
    problems.push(`RELEASE.md advertises Dont-Be-Michael-${m[1]}-${m[2]} but package.json says ${version}`);
  }
  assets.add(`Dont-Be-Michael-${m[1]}-${m[2]}`);
}
if (assets.size === 0) problems.push('RELEASE.md advertises no download assets at all — did the table move?');

// — 2. source tarball tags too; a stale tag silently ships last release's source —
for (const m of releaseMd.matchAll(/archive\/refs\/tags\/v(\d+\.\d+\.\d+(?:-(?:rc|beta|alpha)\.\d+)?)/g)) {
  if (m[1] !== version) {
    problems.push(`RELEASE.md links source for tag v${m[1]} but package.json says ${version}`);
  }
}

async function head(url, label) {
  let status = 0;
  try {
    // GitHub 302s asset downloads to a CDN, so follow it; HEAD is enough.
    status = (await fetch(url, { method: 'HEAD', redirect: 'follow' })).status;
  } catch (e) {
    problems.push(`${label} — request failed: ${e.message}`);
    return;
  }
  if (status !== 200) problems.push(`${label} — HTTP ${status} (advertised but not downloadable)`);
  else console.log(`  ok  ${label}`);
}

// The Windows section ships only when the owner turns Windows on
// (docs/designs/windows-11-installer.md, R10); until then its links are stripped
// from the published notes and are not checked live.
const windowsAssets = new Set([...windowsSection(releaseMd).matchAll(assetRe)].map((m) => `Dont-Be-Michael-${m[1]}-${m[2]}`));

async function checkLive() {
  // latest never points at a prerelease, so an rc's files (and its notes' links,
  // see release-assets.cjs) live under its own tag.
  const base = version.includes('-')
    ? `https://github.com/agentvivekkumar/dontbemichael/releases/download/v${version}/`
    : 'https://github.com/agentvivekkumar/dontbemichael/releases/latest/download/';
  for (const name of [...assets, 'SHA256SUMS.txt']) {
    if (windowsAssets.has(name)) {
      // An rc always carries Windows (R10); a clean release only once switched on.
      if (!version.includes('-') && process.env.WINDOWS_RELEASE !== 'on') continue;
      // Windows links are pinned to their tag, so a later release without Windows never breaks them.
      await head(`https://github.com/agentvivekkumar/dontbemichael/releases/download/v${version}/${name}`, name);
      continue;
    }
    await head(base + name, name);
  }
}

(async () => {
  if (process.argv.includes('--live')) {
    console.log(`Checking advertised downloads for v${version} against the live ${version.includes('-') ? `v${version}` : 'latest'} release…`);
    await checkLive();
  }
  if (problems.length) {
    console.error(`\n✗ release links are wrong (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nFix RELEASE.md to match package.json before releasing.');
    process.exit(1);
  }
  console.log(`✓ release links consistent at v${version}`);
})();
