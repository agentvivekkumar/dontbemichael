'use strict';

/**
 * "Claude Code updated underneath the team" (src/shared/cliUpdate.ts) and the
 * closing-time reopen it hands off to (src/main/closingTime.ts).
 *
 * Claude Code updates itself on disk; a running agent keeps its old version and
 * says so only in a terminal footer the owner never reads. What would hurt: a
 * false alarm (a failed probe read as "behind", nagging the owner to close the
 * office for nothing), a missed update, or the owner's "close office & reopen"
 * click closing the office and never coming back.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { cliUpdateStatus, cliUpdateToastVisible } = loadTs('src/shared/cliUpdate.ts');
const { ClosingTimeController } = loadTs('src/main/closingTime.ts');

test('nothing to offer: no agents, or every agent already on the installed version', () => {
  assert.equal(cliUpdateStatus([]), null);
  assert.equal(cliUpdateStatus([
    { started: '2.1.284', installed: '2.1.284' },
    { started: '2.1.284', installed: '2.1.284' }
  ]), null);
});

test('agents on an older version than the one installed are counted as behind', () => {
  assert.deepEqual(cliUpdateStatus([
    { started: '2.1.283', installed: '2.1.284' },
    { started: '2.1.283', installed: '2.1.284' },
    { started: '2.1.284', installed: '2.1.284' }
  ]), { installed: '2.1.284', behind: 2, live: 3 });
});

test('versions compare numerically, not as text', () => {
  assert.deepEqual(cliUpdateStatus([{ started: '2.1.99', installed: '2.1.100' }]),
    { installed: '2.1.100', behind: 1, live: 1 });
});

test('a failed probe is never a false alarm', () => {
  assert.equal(cliUpdateStatus([{ started: '2.1.283', installed: null }]), null);
  assert.deepEqual(cliUpdateStatus([
    { started: '2.1.283', installed: null },
    { started: '2.1.283', installed: '2.1.284' }
  ]), { installed: '2.1.284', behind: 1, live: 2 });
});

test('a downgrade on disk is not an update', () => {
  assert.equal(cliUpdateStatus([{ started: '2.1.284', installed: '2.1.283' }]), null);
});

test('the notice names the newest installed version across binaries', () => {
  assert.equal(cliUpdateStatus([
    { started: '2.1.280', installed: '2.1.284' },
    { started: '2.1.280', installed: '2.1.290' }
  ]).installed, '2.1.290');
});

/** A god and one worker, with the router traffic driven by hand. */
function office() {
  const events = [];
  const concluded = [];
  const hive = {
    registry: () => ({ godId: 'god', agents: { god: { isGod: true, name: 'Michael' }, w1: { name: 'Jim' } } }),
    send: () => {}
  };
  const ct = new ClosingTimeController(
    hive,
    () => ['god', 'w1'],
    () => ({ send: (_ch, ev) => events.push(ev) }),
    (relaunch) => concluded.push(relaunch)
  );
  const finish = () => {
    ct.onRouted({ from: 'w1', subject: 'CLOSING-TIME-ACK' }, ['god']);
    ct.onRouted({ from: 'god', subject: 'CLOSING-TIME-COMPLETE' }, ['human']);
  };
  return { ct, events, concluded, finish };
}

test('closing time started for an update reopens the app when it concludes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const o = office();
  assert.equal(o.ct.start({ relaunch: true }).ok, true);
  assert.ok(o.events.every((e) => e.relaunch === true), 'the dialog knows it will reopen');
  o.finish();
  t.mock.timers.tick(3000);
  assert.deepEqual(o.concluded, [true]);
});

test('ordinary closing time still just quits', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const o = office();
  o.ct.start();
  o.finish();
  t.mock.timers.tick(3000);
  assert.deepEqual(o.concluded, [false]);
  assert.ok(o.events.every((e) => e.relaunch === false));
});

test('asking to reopen while closing time is already running still reopens', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const o = office();
  o.ct.start();
  o.ct.start({ relaunch: true });
  o.finish();
  t.mock.timers.tick(3000);
  assert.deepEqual(o.concluded, [true]);
});

test('"later" hides the toast for that version only; a newer one shows it again', () => {
  // Value: protects=the owner is asked again when a newer Claude Code lands, never nagged for the same one; fails_when=later is kept per app start or ignores the version; why_new=ship review: the rule was inline in the component; seam=none
  const st = { installed: '2.1.300', behind: 1, live: 2 };
  assert.equal(cliUpdateToastVisible(null, null), false, 'nothing waiting');
  assert.equal(cliUpdateToastVisible(st, null), true);
  assert.equal(cliUpdateToastVisible(st, '2.1.300'), false, 'later for this version');
  assert.equal(cliUpdateToastVisible({ ...st, installed: '2.1.301' }, '2.1.300'), true, 'a newer version asks again');
});

test('an agent counts toward the upgrade only once its terminal really started', () => {
  // Value: protects=a failed spawn never shows a phantom agent to upgrade, and a duplicate id never overwrites a live agent's version; fails_when=the version probe runs before ptyManager.spawn succeeds; why_new=ship review; seam=source (index.ts needs Electron)
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const spawn = src.indexOf('const res = ptyManager.spawn(opts, owner);');
  const record = src.indexOf('ptyCli.set(opts.id');
  assert.ok(spawn > 0 && record > spawn, 'recorded after the spawn');
  assert.match(src.slice(spawn, record), /if \(res\.ok && opts\.hive\?\.id && claudeProvider\)/);
  assert.match(src, /if \(run !== cliUpdateRun\) return;/, 'only the latest refresh reports');
});
