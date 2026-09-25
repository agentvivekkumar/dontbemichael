'use strict';

/**
 * Edge cases of the office record (src/shared/officeRecord.ts) and its file
 * (src/main/officeFile.ts) not covered by office-record.test.cjs: how the
 * team's shared folder is worked out, a record file with no team, and a save
 * that fails partway.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const rec = loadTs('src/shared/officeRecord.ts');
const file = loadTs('src/main/officeFile.ts');

test('the shared folder: one member, Windows paths, and members with nothing in common', () => {
  const one = rec.teamPlanFromRecord({ version: 1, team: [{ agentId: 'oscar', folder: '/Users/o/Documents/Biz/Finance' }] });
  assert.equal(one.ok, true);
  assert.equal(one.office, '/Users/o/Documents/Biz/Office', 'a lone member gets an Office beside it');
  assert.equal(rec.officeRecordFromRegistry({ oscar: { id: 'oscar', cwd: '/Users/o/Documents/Biz/Finance' } }).businessName, 'Biz');

  const win = [
    { agentId: 'oscar', folder: 'C:\\Users\\o\\Documents\\Biz\\Finance' },
    { agentId: 'pam', folder: 'C:\\Users\\o\\Documents\\Biz\\Admin' }
  ];
  const wplan = rec.teamPlanFromRecord({ version: 1, team: win });
  assert.equal(wplan.office, 'C:\\Users\\o\\Documents\\Biz\\Office', 'Windows separator is kept');
  assert.equal(rec.officeRecordFromRegistry({ oscar: { cwd: win[0].folder }, pam: { cwd: win[1].folder } }).businessName, 'Biz');

  const apart = [
    { agentId: 'oscar', folder: '/Volumes/Work/Finance' },
    { agentId: 'pam', folder: '/Users/o/Admin' }
  ];
  assert.deepEqual(rec.teamPlanFromRecord({ version: 1, team: apart }), { ok: false }, 'only the root in common: no Office is guessed');
  assert.equal(rec.officeRecordFromRegistry({ oscar: { cwd: apart[0].folder }, pam: { cwd: apart[1].folder } }).businessName, undefined);
  assert.deepEqual(
    rec.teamPlanFromRecord({ version: 1, team: [{ agentId: 'a', folder: 'C:\\A\\x' }, { agentId: 'b', folder: 'D:\\B\\y' }] }),
    { ok: false },
    'different drives share nothing'
  );
  const recorded = rec.teamPlanFromRecord({ version: 1, officeFolder: '/Users/o/Office', team: apart });
  assert.equal(recorded.ok, true, 'a recorded Office folder needs no guessing');
  assert.deepEqual(recorded.folders, ['/Users/o/Office', '/Volumes/Work/Finance', '/Users/o/Admin']);
});

function office(agents) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office-edge-'));
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents }));
  return home;
}

test('a record file with no team keeps its business details and takes the team from the registry', () => {
  const home = office({
    god: { id: 'god', cwd: '/x/hive/agents/god' },
    oscar: { id: 'oscar', cwd: '/Users/o/Documents/Guess/Finance' }
  });
  try {
    fs.writeFileSync(path.join(home, 'office.json'), JSON.stringify({
      version: 1, businessName: 'MoblizeIt', businessCity: 'Austin, TX',
      officeFolder: '/Users/o/Documents/Guess/Office', team: []
    }));
    const f = file.findOffice(home);
    assert.equal(f.source, 'registry');
    assert.equal(f.record.businessName, 'MoblizeIt', 'the file names the business, not the folder guess');
    assert.equal(f.record.businessCity, 'Austin, TX');
    assert.equal(f.record.officeFolder, '/Users/o/Documents/Guess/Office');
    assert.deepEqual(f.record.team, [{ agentId: 'oscar', folder: '/Users/o/Documents/Guess/Finance' }]);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a record file with no team and no registry team is returned as the file', () => {
  const home = office({ god: { id: 'god', cwd: '/x/god' } });
  try {
    fs.writeFileSync(path.join(home, 'office.json'), JSON.stringify({ version: 1, businessName: 'Solo', team: [] }));
    const f = file.findOffice(home);
    assert.equal(f.hasOffice, true);
    assert.equal(f.source, 'file');
    assert.equal(f.record.businessName, 'Solo');
    fs.rmSync(path.join(home, 'office.json'));
    assert.deepEqual(file.findOffice(home), { path: home, hasOffice: true, record: null, source: null });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('an unreadable office.json is ignored, and a failed save leaves no temp file and never throws from sync', () => {
  const home = office({ oscar: { id: 'oscar', cwd: '/Users/o/Documents/Biz/Finance' } });
  try {
    fs.writeFileSync(path.join(home, 'office.json'), '{ not json');
    assert.equal(file.readOfficeRecord(home), null);
    assert.equal(file.findOffice(home).source, 'registry', 'falls back to the registry');

    // office.json is a folder: the rename fails.
    fs.rmSync(path.join(home, 'office.json'));
    fs.mkdirSync(path.join(home, 'office.json', 'inner'), { recursive: true });
    assert.throws(() => file.writeOfficeRecord(home, { version: 1, team: [] }));
    assert.equal(fs.existsSync(path.join(home, 'office.json.tmp')), false, 'the temp file is cleaned up');

    const orig = console.error;
    console.error = () => {};
    try {
      assert.equal(file.syncOfficeRecord({
        onboardingComplete: true, harnessHome: home, businessName: 'Biz',
        businessTeam: [{ agentId: 'oscar', folder: '/Users/o/Documents/Biz/Finance' }]
      }), false, 'a record that cannot be saved does not break a config save');
    } finally {
      console.error = orig;
    }
    assert.equal(fs.existsSync(path.join(home, 'office.json.tmp')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
