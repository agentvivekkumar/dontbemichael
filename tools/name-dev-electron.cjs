#!/usr/bin/env node
'use strict';

/**
 * Name the development build "My Office" on macOS.
 *
 * `npm run dev` runs Electron's own app bundle, so the Mac menu bar and every
 * notification said "Electron" (owner, 2026-09-24). macOS reads that name from
 * the bundle's Info.plist, which the app cannot change while running, so this
 * sets CFBundleName and CFBundleDisplayName in node_modules/electron's bundle
 * and re-signs it ad hoc (editing the plist breaks the bundle's signature, and
 * Electron's download is itself signed ad hoc, so nothing is lost).
 *
 * The installed app is untouched: it is named by electron-builder
 * (productName), and keeps "Don't Be Michael".
 *
 * Runs from postinstall and predev. It does nothing off macOS or when the name
 * is already set, and never fails an install: a dev build that says
 * "Electron" is a nuisance, not a broken build.
 *
 * Usage: node tools/name-dev-electron.cjs [path/to/Electron.app]
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEV_NAME = 'My Office';

function electronApp() {
  const dist = path.join(path.dirname(require.resolve('electron/package.json')), 'dist');
  return path.join(dist, 'Electron.app');
}

function read(plist, key) {
  try {
    return execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function nameDevBundle(app) {
  const plist = path.join(app, 'Contents', 'Info.plist');
  if (!fs.existsSync(plist)) return 'missing';
  if (read(plist, 'CFBundleName') === DEV_NAME && read(plist, 'CFBundleDisplayName') === DEV_NAME) {
    return 'already';
  }
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('/usr/bin/plutil', ['-replace', key, '-string', DEV_NAME, plist]);
  }
  if (!process.env.NAME_DEV_ELECTRON_SKIP_SIGN) {
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' });
  }
  return 'renamed';
}

if (require.main === module) {
  if (process.platform !== 'darwin') process.exit(0);
  try {
    const app = process.argv[2] || electronApp();
    const result = nameDevBundle(app);
    if (result === 'renamed') console.log(`[name-dev-electron] the dev build is now "${DEV_NAME}"`);
  } catch (e) {
    console.warn(`[name-dev-electron] left the dev build's name alone: ${e && e.message ? e.message : e}`);
  }
  process.exit(0);
}

module.exports = { nameDevBundle, DEV_NAME };
