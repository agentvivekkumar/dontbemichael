'use strict';

/**
 * Where the model pickers' list comes from, and that a list cached from
 * somewhere else is never served as ours.
 *
 * The app refreshes its model list from a file on GitHub, and a provider named
 * there REPLACES the list compiled into the build. That file used to be the
 * upstream munder-difflin one, so another project decided which Claude models
 * our owners could pick (it had no Opus 5.5). It is now this repo's own file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { CATALOG_URL, loadModelCatalog } = loadTs('src/main/modelCatalog.ts');
const shipped = fs.readFileSync(path.resolve(__dirname, '../docs/model-catalog.json'), 'utf8');

const tmpCache = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dbm-catalog-')), 'catalog.json');
const claudeIds = (r) => r.catalog.providers.claude.map((m) => m.id);

test('the model list is fetched from this repo, not upstream', () => {
  assert.equal(CATALOG_URL, 'https://raw.githubusercontent.com/agentvivekkumar/dontbemichael/main/docs/model-catalog.json');
});

test('the published list offers Opus 5.5, the manager model setup recommends', () => {
  const ids = JSON.parse(shipped).providers.claude.map((m) => m.id);
  assert.ok(ids.includes('claude-opus-5-5'));
});

test('a fresh cache from this source is served without touching the network', async () => {
  const cache = tmpCache();
  const first = await loadModelCatalog(cache, { fetch: async () => shipped });
  assert.ok(claudeIds(first).includes('claude-opus-5-5'));
  const again = await loadModelCatalog(cache, { fetch: async () => { throw new Error('network must not be used'); } });
  assert.equal(again.stale, false);
  assert.deepEqual(claudeIds(again), claudeIds(first));
});

test('a cache written from another address is ignored, even while fresh', async () => {
  const cache = tmpCache();
  const upstream = JSON.parse(shipped);
  upstream.providers.claude = upstream.providers.claude.filter((m) => m.id !== 'claude-opus-5-5');
  // What an install that last fetched from upstream has on disk: fresh, no url.
  fs.writeFileSync(cache, JSON.stringify({ catalog: upstream, fetchedAt: Date.now() }));
  let fetched = 0;
  const r = await loadModelCatalog(cache, { fetch: async () => { fetched++; return shipped; } });
  assert.equal(fetched, 1, 'the foreign cache was not trusted as fresh');
  assert.ok(claudeIds(r).includes('claude-opus-5-5'));
  // Offline with only the foreign copy on disk: the build's own list, not upstream's.
  fs.writeFileSync(cache, JSON.stringify({ catalog: upstream, fetchedAt: Date.now() }));
  const offline = await loadModelCatalog(cache, { fetch: async () => { throw new Error('offline'); } });
  assert.equal(offline.catalog, null, 'null means "keep the catalog compiled into this build"');
});
