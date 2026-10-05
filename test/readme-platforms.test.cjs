'use strict';

/**
 * README platforms.
 *
 * Windows 11 ships with every release, but the README kept its Mac only hero:
 * a macOS badge, a "Download for Mac" button and Mac only install steps, with
 * Windows reduced to one line after them. The repo page is where most people
 * land, so each place that tells a user what to download or install has to name
 * Windows too.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readme = read('README.md');

function section(heading) {
  const start = readme.indexOf(heading);
  assert.ok(start >= 0, `README has ${heading}`);
  const next = readme.indexOf('\n#', start + heading.length);
  return readme.slice(start, next < 0 ? undefined : next);
}

test('the platform badge names Windows', () => {
  const badge = readme.match(/<img alt="(Platform: [^"]*)" src="([^"]*)"/);
  assert.ok(badge, 'README has a platform badge');
  assert.match(badge[1], /Windows/);
  assert.match(decodeURIComponent(badge[2]), /Windows/, 'the badge image itself, not just its alt text');
});

test('the hero download links name Windows beside Mac', () => {
  const end = readme.indexOf('</div>');
  assert.ok(end > 0, 'README has a hero block');
  const hero = readme.slice(0, end);
  assert.match(hero, /\[Download for Mac\]/);
  assert.match(hero, /\[Download for Windows[^\]]*\]\(https:\/\/github\.com\/agentvivekkumar\/dontbemichael\/releases\/latest\)/);
});

test('What you need names a Windows PC', () => {
  assert.match(section('### What you need'), /Windows 11 PC/);
});

test('Install has Windows steps, not just the .dmg', () => {
  const install = section('### Install');
  assert.match(install, /\.dmg/);
  // The installer name comes from the build config, so a rename there fails here.
  const win = read('electron-builder.yml').match(/artifactName: \S*\$\{version\}(-win-\S+\.exe)/);
  assert.ok(win, 'electron-builder.yml names the Windows installer');
  assert.ok(!win[1].includes('${'), `installer suffix is fixed text, not ${win[1]}`);
  assert.ok(install.includes(win[1]), `Install names ${win[1]}`);
  assert.match(install, /Run anyway/);
});

test('secrets are not described as kept in a Mac keychain', () => {
  // Saved passwords use Electron safeStorage, which is the keychain on a Mac
  // and DPAPI on Windows, so the docs describe them for both.
  for (const file of ['README.md', 'docs/FEATURES.md']) {
    assert.doesNotMatch(read(file), /\b(Mac|macOS)(['’]s)?\s+keychain/i, file);
  }
});

// Current claims only: FEATURES Part 2 is release history and stays as written.
function current(file) {
  const text = read(file);
  const history = text.indexOf('## Part 2');
  return history < 0 ? text : text.slice(0, history);
}

// Mac only features must say so wherever README or FEATURES Part 1 names them.
// A wrapped paragraph is one claim, so match per paragraph, not per line.
for (const [feature, pattern] of [
  // Windows has no Claude Code sandbox (hive.ts spawns with failIfUnavailable
  // false), so the app's file tool checks are all that hold there.
  ['the sandbox', /\bsandbox\b/i],
  // Reading scans and photos uses the macOS Vision OCR (macOcr.ts).
  ['scans and photos', /\b(scans?|photos?)\b/i]
]) {
  test(`${feature} is described as Mac only`, () => {
    for (const file of ['README.md', 'docs/FEATURES.md']) {
      const found = current(file).split(/\n(?=- |\s*\n)/).filter((p) => pattern.test(p));
      assert.ok(found.length, `${file} mentions ${feature}`);
      for (const p of found) assert.match(p, /on a Mac/i, `${file}: ${p.trim()}`);
    }
  });
}

test('Windows folder privacy states its shell command limit', () => {
  for (const file of ['README.md', 'docs/FEATURES.md']) {
    assert.match(current(file).replace(/\s+/g, ' '), /On Windows, the app checks Claude's file tools, but shell commands are not limited yet\./, file);
  }
});
