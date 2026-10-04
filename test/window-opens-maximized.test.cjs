'use strict';

/**
 * The office window opens filling the screen (owner, 2026-10-03: "office when
 * restarted always launched like 70% of screen size"). It came back at the
 * 1440 by 900 default, or the last smaller size, because a maximized window
 * never saved anything.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');
const win = main.slice(main.indexOf('function createWindow(): BrowserWindow {'));

test('the window opens maximized unless the owner last left it smaller, and remembers which', () => {
  // Value: protects=a restart fills the screen; fails_when=it opens at the default size, ignores a smaller size the owner chose, or stops saving the maximized state; why_new=new; seam=source pin
  assert.match(win, /try \{ openMaximized = persist\.getKv\('window\.maximized'\) !== false; \}/, 'maximized unless saved as not');
  assert.match(win, /win\.once\('ready-to-show', \(\) => \{\s*if \(openMaximized\) win\.maximize\(\);\s*win\.show\(\);/);
  assert.match(win, /persist\.setKv\('window\.maximized', win\.isMaximized\(\)\)/);
  assert.match(win, /win\.on\('maximize', saveMaximized\);\s*win\.on\('unmaximize', saveMaximized\);/);
  assert.match(win, /win\.on\('close', \(\) => \{\s*saveMaximized\(\);/);
  // The smaller size is still kept for when it is not maximized.
  assert.match(win, /persist\.setKv\('window\.bounds', win\.getBounds\(\)\)/);
});
