'use strict';

/**
 * An office is recognised by its folder, never by the business name typed into
 * setup (owner, 2026-09-24).
 *
 * After the 0.0.2 data folder rename, setup ran again. The team's folders are
 * `~/Documents/<Business name>/<Folder>`, so a name typed differently would have
 * pointed the team at new, empty folders while the real office sat in the home
 * folder. Now the office records itself in `<home>/office.json` (or is read from
 * its hive registry), setup offers to continue it, and team start brings back a
 * member the registry knows but the floor lost, in the folder it really uses.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const rec = loadTs('src/shared/officeRecord.ts');
const file = loadTs('src/main/officeFile.ts');
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

const DOCS = '/Users/owner/Documents/MoblizeIt';
const team = [
  { agentId: 'oscar', folder: `${DOCS}/Finance` },
  { agentId: 'pam', folder: `${DOCS}/Admin` }
];
const cfg = {
  onboardingComplete: true,
  harnessHome: '/Users/owner/HarnessAgents',
  businessName: 'MoblizeIt',
  businessCity: 'Mountain View, CA',
  businessType: 'saas-consulting',
  officeFolder: `${DOCS}/Office`,
  businessTeam: team
};

// --- the record, as plain data ---------------------------------------------

test('the config describes the office once setup has finished, and not before', () => {
  assert.equal(rec.officeRecordFromConfig({ ...cfg, onboardingComplete: false }), null);
  assert.equal(rec.officeRecordFromConfig({ ...cfg, harnessHome: null }), null);
  assert.deepEqual(rec.officeRecordFromConfig(cfg), {
    version: 1,
    businessName: 'MoblizeIt',
    businessCity: 'Mountain View, CA',
    businessType: 'saas-consulting',
    officeFolder: `${DOCS}/Office`,
    team
  });
});

test('a record read from disk is checked, and junk is dropped rather than trusted', () => {
  assert.equal(rec.parseOfficeRecord(null), null);
  assert.equal(rec.parseOfficeRecord({ version: 2, team }), null);
  const parsed = rec.parseOfficeRecord({
    version: 1,
    businessName: '  ',
    team: [...team, { agentId: 'pam', folder: '/dup' }, { agentId: '', folder: '/x' }, 'nope']
  });
  assert.equal(parsed.businessName, undefined);
  assert.deepEqual(parsed.team, team, 'duplicates, blanks and non-objects are dropped');
});

test('an older office is described from its registry: every member with a folder, never Michael', () => {
  const r = rec.officeRecordFromRegistry({
    god: { id: 'god', cwd: '/Users/owner/HarnessAgents/hive/agents/god' },
    oscar: { id: 'oscar', cwd: `${DOCS}/Finance` },
    pam: { id: 'pam', cwd: `${DOCS}/Admin` },
    toby: { id: 'toby', cwd: `${DOCS}/HR`, archived: true },
    ghost: { id: 'ghost' }
  });
  // archived in the registry means its terminal closed (every agent, on quit),
  // not that the owner removed it, so Toby is still on the team.
  assert.deepEqual(r.team, [...team, { agentId: 'toby', folder: `${DOCS}/HR` }]);
  assert.equal(r.businessName, 'MoblizeIt', 'best guess: the folder the team shares');
  assert.equal(rec.officeRecordFromRegistry({ god: { id: 'god', cwd: '/x' } }), null, 'no team, nothing to continue');
});

test('continuing an office keeps its recorded folders, whatever name is typed this time', () => {
  const plan = rec.teamPlanFromRecord(rec.officeRecordFromConfig({ ...cfg, businessName: 'Moblize It' }));
  assert.equal(plan.ok, true);
  assert.equal(plan.office, `${DOCS}/Office`);
  assert.deepEqual(plan.team, team);
  assert.deepEqual(plan.folders, [`${DOCS}/Office`, `${DOCS}/Finance`, `${DOCS}/Admin`]);
});

test('an office with no recorded Office folder gets one beside the team', () => {
  const plan = rec.teamPlanFromRecord({ version: 1, team });
  assert.equal(plan.office, `${DOCS}/Office`);
  assert.deepEqual(rec.teamPlanFromRecord({ version: 1, team: [] }), { ok: false });
  assert.deepEqual(rec.teamPlanFromRecord(null), { ok: false });
});

// --- the file, on disk -------------------------------------------------------

function office() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office-'));
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({
    godId: 'god',
    agents: {
      god: { id: 'god', cwd: path.join(home, 'hive', 'agents', 'god') },
      oscar: { id: 'oscar', cwd: `${DOCS}/Finance` },
      pam: { id: 'pam', cwd: `${DOCS}/Admin` }
    }
  }));
  return home;
}

test('a config save writes office.json, and an unchanged one is not rewritten', () => {
  const home = office();
  try {
    assert.equal(file.syncOfficeRecord({ ...cfg, harnessHome: home }), true);
    assert.equal(file.readOfficeRecord(home).businessName, 'MoblizeIt');
    assert.equal(file.syncOfficeRecord({ ...cfg, harnessHome: home }), false, 'same record, no write');
    assert.equal(file.syncOfficeRecord({ ...cfg, harnessHome: home, businessCity: 'Austin, TX' }), true);
    assert.equal(file.syncOfficeRecord({ ...cfg, harnessHome: path.join(home, 'gone') }), false, 'a missing office is never recreated');
    assert.equal(file.syncOfficeRecord({ ...cfg, onboardingComplete: false, harnessHome: home }), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('finding an office: its own record first, its registry for an older office, nothing for an empty folder', () => {
  const home = office();
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));
  try {
    const older = file.findOffice(home);
    assert.equal(older.hasOffice, true);
    assert.equal(older.source, 'registry');
    assert.deepEqual(older.record.team, team);

    file.syncOfficeRecord({ ...cfg, harnessHome: home });
    const recorded = file.findOffice(home);
    assert.equal(recorded.source, 'file');
    assert.equal(recorded.record.businessType, 'saas-consulting');

    assert.deepEqual(file.findOffice(empty), { path: empty, hasOffice: false, record: null, source: null });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

// --- wiring ------------------------------------------------------------------

test('main keeps office.json current on every config save and backfills it at launch', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /onConfigWritten\(\(config\) => \{[\s\S]{0,300}syncOfficeRecord\(config\);/);
  assert.match(main, /bootstrapHiveServices\(\);\s*\/\/[^\n]*\n\s*syncOfficeRecord\(readConfig\(\)\);/);
  assert.match(main, /ipcMain\.handle\('office:find'/);
});

test('setup opens on the office it found, and continuing uses the recorded team and folders', () => {
  const wiz = read('src/renderer/src/components/OnboardingWizard.tsx');
  assert.match(wiz, /window\.cth\.officeFind\(DEFAULT_HOME\)/);
  assert.match(wiz, /setStep\(\(s\) => \(s === 'business' \? 'resume' : s\)\)/);
  // Offered only when the office can really be continued, so Finish can't dead-end.
  assert.match(wiz, /!f\.record \|\| !teamPlanFromRecord\(f\.record\)\.ok\) return;/);
  assert.match(wiz, /const finishPlan = resuming && foundPlan \? foundPlan : plan;/);
  // The owner sees the folders before continuing.
  assert.match(wiz, /foundPlan\?\.ok && foundPlan\.folders\.map/);
  // A new office never lands in the folder of the one it found: the first free
  // "~/HarnessAgents N", or an empty field (the home step then asks) when none is.
  assert.match(wiz, /if \(!st\.exists\) \{ free = candidate; break; \}/);
  assert.match(wiz, /setHome\(free\);/);
});

test('team start brings back a member the registry knows but the floor lost, in its real folder', () => {
  const hive = read('src/renderer/src/hooks/useHive.ts');
  assert.doesNotMatch(hive, /if \(reg\?\.agents\?\.\[id\]\) continue;/, 'no more skipping on the hope the roster restores it');
  assert.match(hive, /\[\.\.\.floor\.agents, \.\.\.floor\.archivedAgents, \.\.\.floor\.restorableAgents\]\.map\(\(a\) => a\.id\)/);
  assert.match(hive, /const decision = teamMemberStart\(id, member\.folder, floorIds, reg\?\.agents\?\.\[id\]\?\.cwd\);/);
  assert.doesNotMatch(hive, /\.archived\) continue/, 'the registry archived flag is not a removal');
});

// --- which members team start starts ------------------------------------------

const { teamMemberStart } = loadTs('src/shared/teamPlan.ts');

test('team start leaves the floor alone and brings a lost member back in its real folder', () => {
  const floor = new Set(['oscar']);
  assert.deepEqual(teamMemberStart('oscar', `${DOCS}/Finance`, floor, `${DOCS}/Finance`), { start: false }, 'already on the floor');
  assert.deepEqual(teamMemberStart('pam', '/Users/owner/Documents/Moblize It/Admin', floor, `${DOCS}/Admin`),
    { start: true, cwd: `${DOCS}/Admin` }, 'the registry folder wins over a name typed differently');
  assert.deepEqual(teamMemberStart('toby', `${DOCS}/HR`, floor, undefined), { start: true, cwd: `${DOCS}/HR` }, 'new member: setup folder');
  assert.deepEqual(teamMemberStart('toby', `${DOCS}/HR`, floor, '  '), { start: true, cwd: `${DOCS}/HR` });
});

// --- folders a record may name ------------------------------------------------

test('a record never sends agents to the disk root, the home folder, or key and settings folders', () => {
  const home = office();
  const h = os.homedir();
  try {
    fs.writeFileSync(path.join(home, 'office.json'), JSON.stringify({
      version: 1,
      officeFolder: h,
      team: [
        { agentId: 'oscar', folder: `${DOCS}/Finance` },
        { agentId: 'root', folder: '/' },
        { agentId: 'home', folder: h },
        { agentId: 'ssh', folder: path.join(h, '.ssh') },
        { agentId: 'claude', folder: path.join(h, '.claude', 'x') },
        { agentId: 'lib', folder: path.join(h, 'Library', 'Keychains') },
        { agentId: 'rel', folder: 'Documents/Finance' }
      ]
    }));
    const found = file.findOffice(home);
    assert.deepEqual(found.record.team.map((m) => m.agentId), ['oscar']);
    assert.notEqual(found.record.officeFolder, h, 'the home folder is not an Office');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('an older office uses the Office folder already beside its team', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office-'));
  const biz = fs.mkdtempSync(path.join(os.tmpdir(), 'biz-'));
  try {
    for (const f of ['Finance', 'Admin', 'Office']) fs.mkdirSync(path.join(biz, f));
    fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
    fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({
      agents: {
        oscar: { id: 'oscar', cwd: path.join(biz, 'Finance'), archived: true },
        pam: { id: 'pam', cwd: path.join(biz, 'Admin'), archived: true }
      }
    }));
    const found = file.findOffice(home);
    assert.equal(found.record.officeFolder, path.join(biz, 'Office'));
    assert.equal(found.record.team.length, 2, 'archived in the registry is still on the team');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(biz, { recursive: true, force: true });
  }
});
