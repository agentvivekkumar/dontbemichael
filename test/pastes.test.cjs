'use strict';

/**
 * Where a pasted screenshot is saved (src/main/pastes.ts).
 *
 * TODOS.md, Attachments: "Keep pasted screenshots somewhere durable." A
 * screenshot pasted into the composer used to land in the OS temp folder,
 * where it could be gone by the time a queued message was actually
 * delivered. This saves it under userData instead, and sweeps stale pastes
 * on the first save each run.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-pastes-'));
const scratch = [userData];
test.after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });

const { savePastedImage, sweepStalePastes, pastesDir, PASTE_MAX_AGE_MS } = loadTs('src/main/pastes.ts');

const dir = pastesDir(userData);
const now = Date.now();

// A paste left over from a week-old run, well past the retention window.
fs.mkdirSync(dir, { recursive: true });
const stale = path.join(dir, 'paste-old.png');
fs.writeFileSync(stale, 'old-bytes');
fs.utimesSync(stale, new Date(now - 8 * 24 * 60 * 60 * 1000), new Date(now - 8 * 24 * 60 * 60 * 1000));

test('a paste saves under userData, not the OS temp folder', () => {
  // Value: a message that references this path can still find it after the OS
  // clears its own temp folder; fails_when=the save goes back to app.getPath('temp'); why_new=TODOS "Keep pasted screenshots somewhere durable"; seam=none
  const file = savePastedImage(userData, Buffer.from('png-bytes'), now);
  assert.equal(file.path, path.join(dir, `paste-${now}.png`));
  assert.equal(file.name, `paste-${now}.png`);
  assert.equal(fs.readFileSync(file.path, 'utf8'), 'png-bytes');
  assert.ok(file.path.startsWith(userData), 'saved under the given userData root');
});

test('a paste from a past run is swept the first time a save happens', () => {
  // The save above already triggered the once-per-run sweep (using the same
  // `now`); the stale file from setup should be gone, the fresh one kept.
  assert.equal(fs.existsSync(stale), false, 'the week-old paste was removed');
  assert.equal(fs.existsSync(path.join(dir, `paste-${now}.png`)), true, 'the fresh paste was kept');
});

test('sweepStalePastes only removes files older than maxAgeMs, and tolerates a missing folder', () => {
  const fresh = path.join(dir, 'paste-fresh.png');
  fs.writeFileSync(fresh, 'x');
  const old = path.join(dir, 'paste-old2.png');
  fs.writeFileSync(old, 'x');
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
  fs.utimesSync(old, twoWeeksAgo, twoWeeksAgo);

  sweepStalePastes(dir, PASTE_MAX_AGE_MS, now);
  assert.equal(fs.existsSync(fresh), true, 'a fresh paste is left alone');
  assert.equal(fs.existsSync(old), false, 'a two-week-old paste is removed');

  // A folder that was never created (no paste saved yet this run) is not an error.
  assert.doesNotThrow(() => sweepStalePastes(path.join(userData, 'never-made'), PASTE_MAX_AGE_MS, now));
});
