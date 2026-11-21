'use strict';

/**
 * A settings move, a switch between businesses and the first open of a new
 * business each write one line to the office log (log.jsonl) with the office
 * id and the app version, so a support case can see when an office moved or
 * switched, and on which version (docs/designs/separate-businesses.md).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/index.ts'), 'utf8');

test('the office log line holds the office id and the app version, nothing private', () => {
  // Value: protects=support sees the office and version, never a business name or folder; fails_when=the line drops the id or version, or gains a name or path; why_new=the events only reached the console; seam=source pin
  const fn = src.match(/function logOfficeEvent\([^)]*\): void \{\n([^\n]*)\n\}/);
  assert.ok(fn, 'logOfficeEvent is there');
  assert.match(fn[1], /hive\.appendLog\(\{ kind, officeId, appVersion: app\.getVersion\(\) \}\)/);
  assert.doesNotMatch(fn[1], /name|home|path/i);
});

test('each of the three events writes exactly one line', () => {
  // Value: protects=a move, a switch and a first open each reach the office log once; fails_when=an event writes no line or two; why_new=the events only reached the console; seam=source pin
  const count = (kind) => src.split(`logOfficeEvent('${kind}'`).length - 1;
  for (const kind of ['office-settings-moved', 'office-switch', 'office-first-open']) assert.equal(count(kind), 1, kind);
  assert.match(src, /settingsMovedThisLaunch = moved === 'done';/, 'only a move that finished');
  assert.match(src, /if \(settingsMovedThisLaunch\) logOfficeEvent\('office-settings-moved', currentOfficeId\(\)\);/);
  assert.match(src, /if \(firstOpen\) \{ try \{ adoptOpenOffice\(\); \}[^\n]*\n\s*if \(firstOpen\) logOfficeEvent\('office-first-open', currentOfficeId\(\)\);/, 'after the office takes its id');
  assert.match(src, /logOfficeEvent\('office-switch', currentOfficeId\(\)\);\n[^\n]*\n\s*switchingHome = true;\n\s*writeConfig\(/, 'the closing office, before config points away');
});
