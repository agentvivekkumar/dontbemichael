'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

test('messageCache bounds entries to MESSAGE_CACHE_MAX using LRU eviction', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-cache-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });

  const inboxDone = path.join(home, 'hive', 'agents', 'god', 'inbox', '.done');
  fs.mkdirSync(inboxDone, { recursive: true });

  // Generate files to exceed the MESSAGE_CACHE_MAX limit
  const max = HiveManager.MESSAGE_CACHE_MAX;
  const count = max + 50;
  for (let i = 0; i < count; i++) {
    const filename = `msg-${String(i).padStart(5, '0')}.json`;
    const content = JSON.stringify({
      id: `id-${i}`,
      from: 'worker',
      to: 'god',
      act: 'done',
      created_at: new Date(1700000000000 + i * 1000).toISOString()
    });
    fs.writeFileSync(path.join(inboxDone, filename), content, 'utf8');
  }

  // First call to refreshOwnerRequests populates the cache
  hive.refreshOwnerRequests();

  // Check private messageCache size via reflection
  const cache = hive.messageCache;
  assert.ok(cache instanceof Map, 'messageCache is a Map');
  assert.equal(cache.size, max, `messageCache is capped at exactly ${max} items`);

  // Verify that the oldest 50 files (0..49) were evicted from cache
  const oldestPath = path.join(inboxDone, `msg-${String(0).padStart(5, '0')}.json`);
  assert.equal(cache.has(oldestPath), false, 'oldest entry was evicted');

  const newestPath = path.join(inboxDone, `msg-${String(count - 1).padStart(5, '0')}.json`);
  assert.equal(cache.has(newestPath), true, 'newest entry is retained');
});
