'use strict';

/**
 * Regression for the reset crash. `app:resetAll` wipes the hive and calls
 * resetConfig() (harnessHome back to null) before app.exit takes effect. The
 * renderer's inbox poll keeps firing in that window, and `hive:inbox` reached
 * agentDir(), which did join(this.root()!, ...) with root() === null:
 * TypeError [ERR_INVALID_ARG_TYPE] "path" must be of type string. Received null.
 *
 * With no home there is no hive, so every per-agent read answers "nothing"
 * instead of throwing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

test('per-agent reads with no home return empty instead of throwing', () => {
  const hive = new HiveManager(() => null);
  assert.equal(hive.enabled(), false);
  assert.deepEqual(hive.inbox('jim-1'), []);
  assert.deepEqual(hive.outbox('jim-1'), []);
  assert.equal(hive.memory('jim-1'), '');
  assert.equal(hive.hasMemory('jim-1'), false);
  assert.equal(hive.memoryIndexFor('jim-1'), null);
  assert.equal(hive.inboxBacklog('jim-1'), 0);
  assert.equal(hive.clearedState('jim-1'), null);
  assert.deepEqual(hive.memoryDetail('jim-1'), { index: '', waiting: 0 });
  assert.deepEqual(hive.drainForStop('jim-1'), { block: false });
});

test('the home going away mid-session (reset) does not crash the inbox poll', () => {
  let home = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'md-nohome-'));
  const dir = home;
  const hive = new HiveManager(() => home);
  assert.deepEqual(hive.inbox('jim-1'), []);
  home = null; // resetConfig() cleared harnessHome
  assert.deepEqual(hive.inbox('jim-1'), []);
  require('node:fs').rmSync(dir, { recursive: true, force: true });
});
