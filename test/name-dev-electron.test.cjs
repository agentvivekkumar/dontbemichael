'use strict';

/**
 * The development build is named "My Office" on macOS instead of "Electron"
 * (owner, 2026-09-24): tools/name-dev-electron.cjs renames Electron's own
 * bundle, and runs after every install and before every dev run. The
 * installed app keeps its product name.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { nameDevBundle, DEV_NAME } = require('../tools/name-dev-electron.cjs');
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
const builder = fs.readFileSync(path.resolve(__dirname, '..', 'electron-builder.yml'), 'utf8');

test('the dev build is named My Office after install and before dev', () => {
  assert.equal(DEV_NAME, 'My Office');
  assert.match(pkg.scripts.postinstall, /node tools\/name-dev-electron\.cjs$/);
  assert.equal(pkg.scripts.predev, 'node tools/name-dev-electron.cjs');
  // The installed app is not renamed.
  assert.match(builder, /^productName: "Don't Be Michael"$/m);
});

test('it renames a bundle once, and leaves a missing one alone', { skip: process.platform !== 'darwin' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devname-'));
  const app = path.join(dir, 'Electron.app');
  fs.mkdirSync(path.join(app, 'Contents'), { recursive: true });
  const plist = path.join(app, 'Contents', 'Info.plist');
  fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Electron</string>
<key>CFBundleDisplayName</key><string>Electron</string>
<key>CFBundleIdentifier</key><string>com.github.Electron</string>
</dict></plist>`);
  const env = process.env.NAME_DEV_ELECTRON_SKIP_SIGN;
  process.env.NAME_DEV_ELECTRON_SKIP_SIGN = '1';
  try {
    assert.equal(nameDevBundle(app), 'renamed');
    const text = fs.readFileSync(plist, 'utf8');
    assert.equal((text.match(/<string>My Office<\/string>/g) || []).length, 2);
    assert.match(text, /com\.github\.Electron/, 'the bundle id is left alone');
    assert.equal(nameDevBundle(app), 'already');
    assert.equal(nameDevBundle(path.join(dir, 'Nope.app')), 'missing');
  } finally {
    if (env === undefined) delete process.env.NAME_DEV_ELECTRON_SKIP_SIGN; else process.env.NAME_DEV_ELECTRON_SKIP_SIGN = env;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
