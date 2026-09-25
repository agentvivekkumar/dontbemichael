'use strict';

/** The header shows the brand kit's horizontal lockup (owner, 2026-09-25):
 *  ink on the light theme, cream on the dark one. It used to show the old
 *  Michael portrait from docs/logo.png. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the header uses the brand kit lockup, one per theme', () => {
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /import lockupLight from '@brandkit\/logo\/lockup\/dbm-lockup-horizontal-light\.svg\?url';/);
  assert.match(app, /import lockupDark from '@brandkit\/logo\/lockup\/dbm-lockup-horizontal-dark\.svg\?url';/);
  assert.doesNotMatch(app, /@brand\/logo\.png/);
  for (const f of ['light', 'dark']) {
    assert.ok(fs.existsSync(path.resolve(__dirname, `../branding/logo/lockup/dbm-lockup-horizontal-${f}.svg`)), f);
  }
  const css = read('src/renderer/src/design/tokens.css');
  assert.match(css, /:root\[data-cth-theme='dark'\] \.cth-lockup-light \{ display: none; \}/);
  assert.match(css, /:root\[data-cth-theme='dark'\] \.cth-lockup-dark \{ display: block; \}/);
  assert.match(read('electron.vite.config.ts'), /'@brandkit': resolve\(__dirname, 'branding'\)/);
});

test('the window icon, loading screen and app icon come from the brand kit', () => {
  const main = read('src/renderer/src/main.tsx');
  assert.match(main, /import brandMark from '@brandkit\/logo\/mark\/struck-m-light\.svg\?url';/);
  assert.match(main, /favicon\.href = brandMark;/);
  assert.match(main, /img\.src = brandMark;/);
  assert.doesNotMatch(main, /@brand\/logo\.png/);
  assert.doesNotMatch(read('src/renderer/index.html'), /DBM|#6E1423/);
  for (const f of ['icon.icns', 'icon.ico', 'icon.svg']) {
    assert.ok(fs.readFileSync(path.resolve(__dirname, '../build', f)).equals(fs.readFileSync(path.resolve(__dirname, '../branding/app-icon', f))), f);
  }
  assert.ok(fs.readFileSync(path.resolve(__dirname, '../build/icon.png')).equals(fs.readFileSync(path.resolve(__dirname, '../branding/app-icon/icon-1024.png'))));
});
