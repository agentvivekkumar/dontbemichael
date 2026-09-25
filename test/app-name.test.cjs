'use strict';

/**
 * The app is "Don't Be Michael" everywhere people see its name (owner,
 * 2026-09-24): the macOS menu and its About / Hide / Quit items, window titles,
 * the packaged app, and the privacy prompts macOS shows. Its data folder is
 * pinned to its own name, so a later rename never moves it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { APP_NAME, APP_DATA_DIR } = loadTs('src/shared/appName.ts');
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const builder = read('electron-builder.yml');
const main = read('src/main/index.ts');

test('the name', () => {
  assert.equal(APP_NAME, "Don't Be Michael");
});

test('the packaged app carries the same name', () => {
  assert.match(builder, /^productName: "Don't Be Michael"$/m);
});

test('the packaged app ships LICENSE, keeping the original MIT notice beside the owner\'s', () => {
  assert.match(builder, /^extraResources:\n(?:\s+#.*\n)*\s+- from: LICENSE\n\s+to: LICENSE$/m);
  const license = read('LICENSE');
  assert.match(license, /^Copyright \(c\) 2026 Vivek Kumar$/m);
  assert.match(license, /^Copyright \(c\) 2026 Chaitanya Giri$/m, 'MIT requires the original notice to stay');
  assert.match(builder, /^copyright: Copyright © 2026 Vivek Kumar$/m);
});

test('the data folder is pinned before the app is renamed, and before anything else runs', () => {
  assert.equal(APP_DATA_DIR, 'dontbemichael');
  const pin = main.indexOf("app.setPath('userData', join(app.getPath('appData'), APP_DATA_DIR));");
  const rename = main.indexOf('app.setName(APP_NAME);');
  assert.ok(pin > 0 && rename > pin, 'pin first, then rename');
  const firstStatement = main.indexOf('\nconst isDev');
  assert.ok(pin - firstStatement < 600, 'right at the top of the main process');
});

test('window titles use the name', () => {
  assert.match(main, /title: isFloor \? `\$\{APP_NAME\} · Floor` : APP_NAME,/);
});

test('the privacy prompts macOS shows say the new name, with no dashes', () => {
  const prompts = [...builder.matchAll(/^\s+NS\w+UsageDescription: "(.*)"$/gm)].map((m) => m[1]);
  assert.ok(prompts.length >= 6);
  for (const p of prompts) {
    assert.ok(p.includes(APP_NAME), p);
    assert.doesNotMatch(p, /Munder Difflin|[-–—]/, p);
  }
});

/**
 * Quit reads "Close Office" (owner, 2026-09-24): "Quit Don't Be Michael" put
 * "Quit" and "Don't" together. It stays the quit role, so Cmd+Q and the quit
 * guard are unchanged.
 */
test('the quit item reads Close Office and is still the quit role', () => {
  assert.match(main, /const QUIT_LABEL = 'Close Office';/);
  assert.match(main, /const quitItem = \{ role: 'quit' as const, label: QUIT_LABEL \};/);
  const menu = main.slice(main.indexOf('function installAppMenu()'), main.indexOf('Menu.setApplicationMenu('));
  assert.doesNotMatch(menu, /\{ role: 'appMenu' as const \}/, 'the default app menu would bring back "Quit <app name>"');
  assert.doesNotMatch(menu, /\{ role: 'quit' as const \}/, 'no quit item without the label');
  assert.equal((menu.match(/quitItem/g) || []).length, 3, 'defined once, used in the Mac app menu and the File menu');
});
