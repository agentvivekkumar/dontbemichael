'use strict';

/**
 * Regression for the blank window after Reset & Restart under `npm run dev`.
 * electron-vite stops its dev server when the first Electron exits, so a
 * relaunched copy loads ELECTRON_RENDERER_URL from a dead server and shows
 * nothing. In dev the app exits without relaunching; built apps still relaunch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { restartApp } = loadTs('src/main/restart.ts');

function fakeApp() {
  const calls = [];
  return { calls, relaunch: () => calls.push('relaunch'), exit: (c) => calls.push(`exit:${c}`) };
}

test('dev mode exits without relaunching into a dead dev server', () => {
  const app = fakeApp();
  const lines = [];
  const out = restartApp(app, { ELECTRON_RENDERER_URL: 'http://localhost:5173' }, (l) => lines.push(l));
  assert.equal(out, 'exited-dev');
  assert.deepEqual(app.calls, ['exit:0']);
  assert.match(lines.join('\n'), /npm run dev/);
});

test('a built app relaunches, then exits', () => {
  const app = fakeApp();
  const out = restartApp(app, {}, () => {});
  assert.equal(out, 'relaunched');
  assert.deepEqual(app.calls, ['relaunch', 'exit:0']);
});
