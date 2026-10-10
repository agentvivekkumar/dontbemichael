'use strict';

/**
 * Pop-ups were already denied, but nothing stopped the main window itself from
 * navigating away (a clicked link, a dropped file), which replaces the whole
 * app with that page. will-navigate now blocks it and sends web links to the
 * browser, while a reload of the app's own page still goes through.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/index.ts'), 'utf8');
const guard = src.slice(src.indexOf("win.webContents.on('will-navigate'"));

test('the main window cannot navigate away from the app', () => {
  assert.ok(guard.length < src.length, 'createWindow registers a will-navigate guard');
  const body = guard.slice(0, guard.indexOf('\n  });'));
  assert.match(body, /e\.preventDefault\(\)/);
  assert.match(body, /if \(\/\^https\?:\\\/\\\/\/i\.test\(url\)\) void shell\.openExternal\(url\)/, 'only http(s) goes to the browser');
  assert.match(body, /url\.split\('#'\)\[0\] === win\.webContents\.getURL\(\)\.split\('#'\)\[0\]\) return/, 'reloading the app itself is allowed');
  assert.ok(body.indexOf('return;') < body.indexOf('e.preventDefault()'), 'the allowed cases return before the block');
});
