'use strict';

/**
 * What the terminal keeps between looks at a printed path: the hover asks
 * whether a quoted match with a space is on disk, the ⌘-click asks before it
 * reveals. The stat and the clock are stubs, so every rule is checked without a
 * window or a disk.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { createPathStatCache, PATH_STAT_TTL_MS, MAX_HOVER_STAT_CHECKS, PATH_STAT_DEADLINE_MS, SLOW_PATH_MS } = loadTs('src/shared/pathStatCache.ts');

/** A stat whose answers the test hands out one at a time. */
function fakeDisk() {
  const calls = [];
  const pending = [];
  const stat = (abs) => {
    calls.push(abs);
    return new Promise((resolve, reject) => pending.push({ abs, resolve, reject }));
  };
  const answer = (abs, exists) => {
    const i = pending.findIndex((p) => p.abs === abs);
    assert.ok(i >= 0, `a check for ${abs} is running`);
    const [p] = pending.splice(i, 1);
    p.resolve({ exists, isFile: exists, path: abs });
  };
  const fail = (abs) => {
    const i = pending.findIndex((p) => p.abs === abs);
    assert.ok(i >= 0, `a check for ${abs} is running`);
    const [p] = pending.splice(i, 1);
    p.reject(new Error('ipc gone'));
  };
  return { calls, pending, stat, answer, fail };
}

const tick = () => new Promise((r) => setImmediate(r));

test('a hover answers from what is known and checks a new path once in the background', async () => {
  // Value: protects=the first hover on a quoted path links nothing and a later hover links it as the disk says (review of #687, items 4 and 5); fails_when=a hover waits on the disk, stats a path twice, or forgets the answer within ten seconds; why_new=the cache lived in terminalPool.ts with no test; seam=stat and clock are stubs; no_claim=xterm hover timing
  const disk = fakeDisk();
  let clock = 0;
  const cache = createPathStatCache({ stat: disk.stat, now: () => clock });

  assert.equal(cache.knownOnDisk('/srv/My Office/plan.md'), undefined, 'not checked yet');
  assert.deepEqual(disk.calls, ['/srv/My Office/plan.md'], 'one check starts');
  assert.equal(cache.knownOnDisk('/srv/My Office/plan.md'), undefined, 'still running');
  assert.equal(disk.calls.length, 1, 'hovering again does not stack another stat');

  disk.answer('/srv/My Office/plan.md', true);
  await tick();
  assert.equal(cache.knownOnDisk('/srv/My Office/plan.md'), true, 'a hit is kept');

  assert.equal(cache.knownOnDisk('/tmp is full, see notes.md'), undefined);
  disk.answer('/tmp is full, see notes.md', false);
  await tick();
  assert.equal(cache.knownOnDisk('/tmp is full, see notes.md'), false, 'a miss is kept for the hover too');
  assert.equal(disk.calls.length, 2, 'no stat while both answers are fresh');

  clock += PATH_STAT_TTL_MS - 1;
  assert.equal(cache.knownOnDisk('/srv/My Office/plan.md'), true, 'still fresh just before ten seconds');
  clock += 1;
  assert.equal(cache.knownOnDisk('/srv/My Office/plan.md'), undefined, 'gone after ten seconds');
  assert.equal(disk.calls.length, 3, 'and checked again');
});

test('a path that does not resolve is never on disk and never checked', () => {
  // Value: protects=no stat runs for a relative path before the agent has a folder (review of #687, item 4); fails_when=a null path reaches the stat or counts as unknown; why_new=quotedKnownOnDisk had no test; seam=stat is a stub
  const disk = fakeDisk();
  const cache = createPathStatCache({ stat: disk.stat, now: () => 0 });
  assert.equal(cache.knownOnDisk(null), false);
  assert.equal(cache.knownOnDisk(''), false);
  assert.deepEqual(disk.calls, []);
});

test('a hover starts a check only while fewer than two are running, and a click always looks', async () => {
  // Value: protects=hanging stats from hovers cannot fill the main process file thread pool (review of #687, item 1); fails_when=a third hover check starts while two run, a hover never retries once a slot frees, or a click is held back by the cap; why_new=hover checks were unbounded; seam=stat is a stub that never answers until told
  assert.equal(MAX_HOVER_STAT_CHECKS, 2);
  const disk = fakeDisk();
  const cache = createPathStatCache({ stat: disk.stat, now: () => 0 });

  cache.knownOnDisk('/a b/1.md');
  cache.knownOnDisk('/a b/2.md');
  assert.equal(cache.knownOnDisk('/a b/3.md'), undefined);
  assert.deepEqual(disk.calls, ['/a b/1.md', '/a b/2.md'], 'the third hover waits for a free slot');

  const click = cache.lookForClick('/a b/3.md');
  assert.deepEqual(disk.calls, ['/a b/1.md', '/a b/2.md', '/a b/3.md'], 'a click is not capped');
  disk.answer('/a b/3.md', true);
  assert.equal((await click).exists, true);

  disk.answer('/a b/1.md', false);
  await tick();
  assert.equal(cache.knownOnDisk('/a b/4.md'), undefined);
  assert.deepEqual(disk.calls.slice(3), ['/a b/4.md'], 'a freed slot lets the next hover check');
  assert.equal(cache.knownOnDisk('/a b/5.md'), undefined);
  assert.equal(disk.calls.length, 4, 'two running again, so no more');
});

test('a click trusts a kept hit but looks again after a miss', async () => {
  // Value: protects=a ⌘-click on a path printed just before its file was written works as soon as the file exists (review of #687, item 2); fails_when=a kept miss blocks the click for ten seconds or a kept hit is stat'ed again; why_new=the shared cache kept misses for the click too; seam=stat is a stub
  const disk = fakeDisk();
  const cache = createPathStatCache({ stat: disk.stat, now: () => 0 });

  const first = cache.lookForClick('/tmp/report.md');
  disk.answer('/tmp/report.md', false);
  assert.equal((await first).exists, false);

  // The file is written now; the next click looks again instead of trusting the miss.
  const second = cache.lookForClick('/tmp/report.md');
  assert.equal(disk.calls.length, 2, 'a kept miss does not stop the click');
  disk.answer('/tmp/report.md', true);
  assert.equal((await second).exists, true);

  const third = await cache.lookForClick('/tmp/report.md');
  assert.equal(third.exists, true);
  assert.equal(disk.calls.length, 2, 'a kept hit is trusted');
});

test('hover and click share a running check, and a failed check is never kept', async () => {
  // Value: protects=one stat per path at a time, and an IPC failure is retried instead of read as a miss for ten seconds (review of #687, items 2 and 4); fails_when=a click stacks a second stat on a hover's check, a failure is cached, or a stat that throws escapes; why_new=the old cache turned a failure into a kept null; seam=stat is a stub
  const disk = fakeDisk();
  const cache = createPathStatCache({ stat: disk.stat, now: () => 0 });

  assert.equal(cache.knownOnDisk('/x y/a.md'), undefined);
  const click = cache.lookForClick('/x y/a.md');
  assert.equal(disk.calls.length, 1, 'the click joins the hover check');
  disk.fail('/x y/a.md');
  assert.equal(await click, null, 'a failed check gives the click nothing');

  assert.equal(cache.knownOnDisk('/x y/a.md'), undefined, 'the failure is not kept');
  assert.equal(disk.calls.length, 2, 'so the next hover checks again');
  disk.answer('/x y/a.md', true);
  await tick();
  assert.equal(cache.knownOnDisk('/x y/a.md'), true);

  const throwing = createPathStatCache({ stat: () => { throw new Error('no bridge'); }, now: () => 0 });
  assert.equal(throwing.knownOnDisk('/x y/a.md'), undefined, 'a stat that throws is a failed check');
  assert.equal(await throwing.lookForClick('/x y/a.md'), null);
});

test('the cache empties itself when it holds too many paths', async () => {
  // Value: protects=a long session does not grow the cache without bound; fails_when=entries past the limit are kept; why_new=the limit moved with the cache; seam=stat answers at once
  const cache = createPathStatCache({
    stat: async (abs) => ({ exists: true, isFile: true, path: abs }),
    now: () => 0,
    maxEntries: 3
  });
  for (const p of ['/1.md', '/2.md', '/3.md']) await cache.lookForClick(p);
  assert.equal(cache.knownOnDisk('/1.md'), true, 'kept while under the limit');
  await cache.lookForClick('/4.md');
  assert.equal(cache.knownOnDisk('/1.md'), undefined, 'emptied once the limit is reached');
  assert.equal(cache.knownOnDisk('/4.md'), true, 'the newest answer is kept after the clear');
});

test('a hover check that never returns keeps its slot past the deadline, and its path counts as slow for a while', async () => {
  // Value: protects=a hung stat (a stale mounted share) keeps its hover slot while it holds a file thread, and its path is not stat'ed again by a hover for SLOW_PATH_MS (re-review of #687 at 49b13c14, item 1); fails_when=a hung hover check frees its slot at the deadline, a slow path is stat'ed again on every hover, the slow window is shorter than SLOW_PATH_MS, a click takes a hover slot, or a click stacks a second stat on a hung one; why_new=the slot was freed at the deadline while the stat kept its thread; seam=stat is a stub that never answers until told, clock is a stub
  assert.ok(PATH_STAT_DEADLINE_MS < PATH_STAT_TTL_MS && SLOW_PATH_MS > PATH_STAT_DEADLINE_MS);
  const disk = fakeDisk();
  let clock = 0;
  const cache = createPathStatCache({ stat: disk.stat, now: () => clock });

  cache.knownOnDisk('/Volumes/share/a b/1.md');
  cache.knownOnDisk('/Volumes/share/a b/2.md');
  assert.equal(cache.knownOnDisk('/Users/Jane/My Reports/3.md'), undefined);
  assert.equal(disk.calls.length, 2, 'both slots are taken by checks that never answer');

  clock += PATH_STAT_DEADLINE_MS;
  assert.equal(cache.knownOnDisk('/Users/Jane/My Reports/3.md'), undefined, 'not known yet');
  assert.equal(disk.calls.length, 2, 'past the deadline the hung checks still hold their slots');

  // A click joins the hung stat instead of stacking another, and takes no hover slot.
  const click = cache.lookForClick('/Volumes/share/a b/2.md');
  assert.equal(disk.calls.length, 2, 'the click joins the running stat');
  const other = cache.lookForClick('/Volumes/share/c d/9.md');
  assert.equal(disk.calls.length, 3, 'a click on a new path looks');
  disk.answer('/Volumes/share/c d/9.md', true);
  assert.equal((await other).exists, true);
  cache.knownOnDisk('/x y/5.md');
  assert.equal(disk.calls.length, 3, 'the click freed no hover slot and took none');

  // Only a settled stat frees its slot.
  disk.fail('/Volumes/share/a b/1.md');
  await tick();
  cache.knownOnDisk('/x y/5.md');
  assert.equal(disk.calls.at(-1), '/x y/5.md', 'a settled stat frees its slot');
  disk.answer('/Volumes/share/a b/2.md', false);
  assert.equal((await click).exists, false);
  disk.answer('/x y/5.md', false);
  await tick();

  // The path whose stat failed past the deadline stays slow for SLOW_PATH_MS from when it was marked.
  const before = disk.calls.length;
  clock += SLOW_PATH_MS - 1;
  assert.equal(cache.knownOnDisk('/Volumes/share/a b/1.md'), undefined, 'slow: no answer');
  assert.equal(disk.calls.length, before, 'still slow just before SLOW_PATH_MS');
  clock += 1;
  cache.knownOnDisk('/Volumes/share/a b/1.md');
  assert.equal(disk.calls.at(-1), '/Volumes/share/a b/1.md', 'checked again once no longer slow');
});

test('hovering many paths on a hung share never has more hover stats in flight than the cap', () => {
  // Value: protects=hung hover stats cannot take all of Node's four file threads and stall every file read and write in the main process (re-review of #687 at 49b13c14, item 1); fails_when=a hover starts a new stat while MAX_HOVER_STAT_CHECKS hover stats are still in flight, past the deadline or not; why_new=the previous test stopped at three started checks and could not see the pile up; seam=stat is a stub that never answers, clock is a stub
  const disk = fakeDisk();
  let clock = 0;
  const cache = createPathStatCache({ stat: disk.stat, now: () => clock });
  for (let i = 0; i < 20; i++) {
    assert.equal(cache.knownOnDisk(`/Volumes/stale/My Files/${i}.md`), undefined);
    assert.ok(disk.pending.length <= MAX_HOVER_STAT_CHECKS, `${disk.pending.length} stats in flight after hover ${i + 1}`);
    clock += PATH_STAT_DEADLINE_MS;
  }
  assert.equal(disk.calls.length, MAX_HOVER_STAT_CHECKS, 'no stat started past the cap');
});
