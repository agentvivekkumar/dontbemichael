'use strict';

/**
 * Who talks to whom (owner, 2026-10-03: "agents definitely talk to each other
 * but chart seems to indicate that only michael and human talks to each agent
 * ... human does not directly talk to agents except michael"). Three causes:
 * the window was the last 200 log events, not messages; agents address
 * Michael by name ("michael"), which the chart dropped; and the app's own
 * notices sent in the owner's name drew the owner talking to everyone.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const { buildGraph } = loadTs('src/renderer/src/components/memoryGraph/buildGraph.ts');

const agent = (id, name, isGod = false) => ({ id, name, accent: 'blue', status: 'idle', isGod, character: 'jim' });
const team = [agent('god', 'Michael', true), agent('kelly', 'Kelly'), agent('sadiq', 'Sadiq'), agent('pam', 'Pam')];
const msg = (from, to, subject = 's', extra = {}) => ({ kind: 'message', from, to, subject, ...extra });
const pairs = (g) => g.edges.filter((e) => e.kind === 'message').map((e) => [e.source, e.target].sort().join('-')).sort();

test('a reply addressed to Michael by name is an edge to Michael', () => {
  const g = buildGraph(team, [msg('kelly', 'michael', 'Re: refund', { delivered: ['god'] }), msg('pam', 'Michael')]);
  assert.deepEqual(pairs(g), ['god-kelly', 'god-pam']);
});

test('an unknown address falls back to the one teammate the hive delivered it to', () => {
  const g = buildGraph(team, [msg('sadiq', 'the security lead', 's', { delivered: ['kelly'] })]);
  assert.deepEqual(pairs(g), ['kelly-sadiq']);
});

test('teammates talking to each other show as their own edge', () => {
  const g = buildGraph(team, [msg('sadiq', 'kelly'), msg('kelly', 'sadiq')]);
  assert.deepEqual(pairs(g), ['kelly-sadiq']);
  assert.equal(g.edges[0].dir, 'both');
});

test('the owner connects only to Michael; app notices in the owner\'s name are not conversation', () => {
  const g = buildGraph(team, [
    msg('human', 'kelly', 'Office open'),
    msg('human', 'pam', 'OWNER ANSWER to your question on "Refund"'),
    msg('human', 'broadcast', 'Closing time cancelled'),
    msg('human', 'god', 'OWNER ANSWER on card k1: Refund')
  ]);
  assert.deepEqual(pairs(g), ['god-human']);
  assert.ok(!g.nodes.some((n) => n.id === 'broadcast'), 'no broadcast node from an app notice');
});

test('senders that are not people (scheduler, breaker) draw nothing', () => {
  const g = buildGraph(team, [msg('scheduler', 'kelly', 'Check emails'), msg('breaker', 'kelly', 'Circuit breaker: steer')]);
  assert.deepEqual(pairs(g), []);
});

test('the chart reads the messages of a time range, picked from eight, Last 1 day by default', () => {
  const R = loadTs('src/renderer/src/components/memoryGraph/timeRanges.ts');
  assert.deepEqual(R.TIME_RANGES.map((r) => r.key), ['1h', '4h', '8h', '1d', '3d', '1w', '2w', '1m']);
  assert.equal(R.DEFAULT_RANGE, '1d');
  const now = Date.UTC(2026, 9, 4, 12);
  assert.equal(now - R.rangeStart('1h', now), 3600e3);
  assert.equal(now - R.rangeStart('1w', now), 7 * 864e5);
  assert.equal(now - R.rangeStart('1m', now), 30 * 864e5);
  assert.equal(R.isRangeKey('4h'), true);
  assert.equal(R.isRangeKey('200'), false);

  const panel = read('src/renderer/src/components/MemoryGraphPanel.tsx');
  assert.match(panel, /window\.cth\.hiveLog\(MAX_RANGE_MESSAGES, 'message', rangeStart\(range, Date\.now\(\)\)\)/);
  assert.match(panel, /TIME_RANGES\.map\(\(r\) => <option key=\{r\.key\} value=\{r\.key\}>\{t\(`memoryGraph\.range\.\$\{r\.key\}`\)\}<\/option>\)/);
  assert.match(panel, /const RANGE_KEY = 'cth\.graphRange';/);
  assert.doesNotMatch(panel, /lastN/);
  assert.match(read('src/preload/index.ts'), /hiveLog: \(n\?: number, kind\?: string, since\?: number\)[^\n]*ipcRenderer\.invoke\('hive:log', n \?\? 200, kind, since\)/);
  const hive = read('src/main/hive.ts');
  assert.match(hive, /logTail\(n = 200, kind\?: string, since\?: number\): unknown\[\]/);
  assert.match(hive, /if \(since !== undefined && typeof e\.ts === 'number' && e\.ts < since\) break;/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const g = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).memoryGraph;
    assert.deepEqual(Object.keys(g.range), R.TIME_RANGES.map((r) => r.key), loc);
    assert.equal(g.lastN, undefined, loc);
    assert.ok(g.rangeLabel && g.noMessagesInRange, loc);
  }
  assert.equal(JSON.parse(read('src/renderer/src/i18n/locales/en.json')).memoryGraph.range['1d'], 'Last 1 day');
});

test('there is no Topics layer: people and message lines only', () => {
  const panel = read('src/renderer/src/components/MemoryGraphPanel.tsx');
  assert.doesNotMatch(panel, /showTopics|V2Toggle|legendTopic|kind === 'topic'/);
  const g = buildGraph(team, [msg('kelly', 'god')]);
  assert.deepEqual(Object.keys(g).sort(), ['edges', 'nodes']);
  assert.ok(g.nodes.every((n) => n.kind === 'agent' || n.kind === 'pseudo'));
  assert.ok(!fs.existsSync(path.resolve(__dirname, '..', 'src/renderer/src/components/memoryGraph/extractTopics.ts')));
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const m = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).memoryGraph;
    for (const k of ['topics', 'readingMemory', 'knowsAbout', 'legendTopic']) assert.equal(m[k], undefined, `${loc} ${k}`);
  }
});

test('the hive log gives the messages of the range, newest last, without older or other entries', (t) => {
  // Value: protects=the chart reads every message in the range, not the last 200 log events; fails_when=kind or since is ignored or inverted, n counts other kinds, a broken line is dropped, or the order flips; why_new=logTail(kind, since) is only pinned by its source line; seam=none
  const os = require('node:os');
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-logtail-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  fs.mkdirSync(hive.root(), { recursive: true });
  const lines = [
    { kind: 'message', ts: 100, subject: 'too old' },
    { kind: 'spawn', ts: 150 },
    { kind: 'message', ts: 200, subject: 'a' },
    { kind: 'tool', ts: 210 },
    'not json',
    { kind: 'message', ts: 300, subject: 'b' },
    { kind: 'tool', ts: 310 },
    { kind: 'message', ts: 400, subject: 'c' }
  ].map((l) => (typeof l === 'string' ? l : JSON.stringify(l)));
  fs.writeFileSync(path.join(hive.root(), 'log.jsonl'), lines.join('\n') + '\n');
  const subjects = (out) => out.map((e) => e.subject);
  assert.deepEqual(subjects(hive.logTail(5000, 'message', 150)), ['a', 'b', 'c'], 'in time order, from the range start');
  assert.deepEqual(subjects(hive.logTail(2, 'message')), ['b', 'c'], 'n counts messages only');
  assert.deepEqual(subjects(hive.logTail(5000, 'message', 300)), ['b', 'c'], 'an entry at the start counts');
  assert.deepEqual(hive.logTail(5000, 'message', 500), [], 'nothing in the range');
  assert.deepEqual(hive.logTail(5000, undefined, 305).map((e) => e.ts), [310, 400], 'since alone keeps every kind');
  assert.equal(hive.logTail(3).length, 3, 'the plain tail is unchanged');
  assert.deepEqual(hive.logTail(4)[0], { raw: 'not json' }, 'a broken line is kept raw');
});

test('an unchanged log is not read again, and a new message is seen on the next poll', () => {
  // Value: protects=the 5 s chart poll reuses its last answer while log.jsonl is unchanged and still sees a new message at once; fails_when=the cache ignores a size change, or a later start returns older entries; why_new=ship review pass 2 performance finding; seam=none
  const os = require('node:os');
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-tail-'));
  try {
    fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
    const file = path.join(home, 'hive', 'log.jsonl');
    const line = (ts, s) => JSON.stringify({ ts, kind: 'message', from: 'kelly', to: 'god', subject: s }) + '\n';
    fs.writeFileSync(file, line(1000, 'a') + line(2000, 'b') + line(3000, 'c'));
    fs.utimesSync(file, 1e6, 1e6); // whole seconds: the stamp survives a reset below
    const hive = new HiveManager(() => home);
    assert.deepEqual(hive.logTail(10, 'message', 1500).map((e) => e.subject), ['b', 'c']);
    assert.deepEqual(hive.logTail(10, 'message', 2500).map((e) => e.subject), ['c'], 'a later start filters the cached answer');
    // Prove the cache is used: same size, same mtime, different words.
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"subject":"c"', '"subject":"z"'));
    fs.utimesSync(file, 1e6, 1e6);
    assert.deepEqual(hive.logTail(10, 'message', 2500).map((e) => e.subject), ['c'], 'unchanged size and time: the cached answer');
    assert.deepEqual(hive.logTail(10, 'message', 500).map((e) => e.subject), ['a', 'b', 'z'], 'an earlier start reads the file');
    fs.appendFileSync(file, line(4000, 'd'));
    assert.deepEqual(hive.logTail(10, 'message', 2500).map((e) => e.subject), ['z', 'd'], 'a grown log is read again');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});


test('an unknown range falls back to the default day', () => {
  // Value: protects=a stale or unknown saved range still shows Last 1 day; fails_when=the fallback picks a range by position; why_new=ship review pass 3; seam=none
  const R = loadTs('src/renderer/src/components/memoryGraph/timeRanges.ts');
  const now = Date.UTC(2026, 9, 3, 12);
  assert.equal(now - R.rangeStart('bogus', now), 864e5);
});
