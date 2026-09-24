'use strict';

// The 0.0.1 release ships a Mac DMG only (owner, 2026-09-24), and without an
// Apple Developer ID the app must still be sealed ad hoc, or a copy downloaded
// from GitHub is reported as "damaged" with no way to open it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the release workflow builds the Mac installer only', () => {
  const yml = read('.github/workflows/release.yml');
  const live = yml.split('\n').filter((l) => !l.trim().startsWith('#'));
  const oses = live.map((l) => /^\s*- os:\s*(\S+)/.exec(l)).filter(Boolean).map((m) => m[1]);
  assert.deepEqual(oses, ['macos-latest']);
});

test('the release workflow unsets an empty signing cert before packaging', () => {
  // An empty CSC_LINK is read as a path to the repo folder ("not a file").
  const yml = read('.github/workflows/release.yml');
  const step = yml.slice(yml.indexOf('- name: Package installers'), yml.indexOf('- name: Generate checksums'));
  assert.match(step, /if \[ -z "\$CSC_LINK" \]; then unset CSC_LINK CSC_KEY_PASSWORD; fi\n\s*npx electron-builder/);
});

test('RELEASE.md advertises the Mac DMG and nothing else', () => {
  const md = read('RELEASE.md');
  const assets = [...md.matchAll(/`(Dont-Be-Michael-[^`]+)`/g)].map((m) => m[1]);
  assert.ok(assets.length > 0);
  for (const a of assets) assert.match(a, /-mac-universal\.dmg$/);
  assert.match(md, /Open Anyway/);
});

test('the afterSign hook seals an unsigned Mac app ad hoc, and only then', () => {
  const hook = read('build/notarize.cjs');
  assert.match(hook, /function sealAdHocIfUnsigned/);
  // Verify first, so a real Developer ID signature is never replaced.
  assert.match(hook, /'--verify', '--strict', appPath[\s\S]*return; \/\/ properly signed already/);
  assert.match(hook, /'--sign', '-'/);
  assert.match(hook, /'--options', 'runtime', '--entitlements'/);
  const builder = read('electron-builder.yml');
  assert.match(builder, /^afterSign: build\/notarize\.cjs$/m);
});
