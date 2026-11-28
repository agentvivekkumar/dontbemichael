'use strict';

/**
 * Add a business (docs/designs/separate-businesses.md, DT3; D19, D4).
 *
 * Protects: the setup wizard runs over the open business, which keeps working
 * until Open the office; its answers go to the new business's own entry and
 * never touch the open one's; Back to office keeps what was typed as Setup not
 * finished, to go on where it stopped; the Ready step chooses the Claude
 * account.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

let userDataNow = os.tmpdir();
const electronPath = require.resolve('electron');
require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: { app: { getPath: () => userDataNow } } };
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function scene(t) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'add-business-'));
  userDataNow = userData;
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const file = loadTs('src/main/officeFile.ts');
  const settings = loadTs('src/main/officeSettings.ts');
  const bakery = path.join(userData, 'bakery');
  fs.mkdirSync(path.join(bakery, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(bakery, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  const bakeryId = file.ensureOfficeId(bakery);
  const bakerySettings = { businessName: 'Harbor & Pine Bakery', onboardingComplete: true, mailboxes: [{ id: 'mb1', address: 'orders@bakery.example' }] };
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
    harnessHome: bakery, officesMigrated: 1, autoMode: true, offices: { [bakeryId]: { home: bakery, settings: bakerySettings } }
  }));
  const stored = () => JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  return { userData, file, settings, bakery, bakeryId, bakerySettings, stored };
}

test('the new business gets its own entry; the open one keeps running on its own', (t) => {
  const s = scene(t);
  const realty = path.join(s.userData, 'HarnessAgents 2');
  const res = s.settings.addBusiness({
    home: realty,
    settings: { businessName: 'Northgate Realty', businessType: 'services', claudeLogin: 'own', autoMode: false, onboardingComplete: false },
    install: { autoMode: false, harnessHome: realty, businessName: 'never at the top' }
  });
  assert.equal(res.ok, true);
  const cfg = s.stored();
  const mine = cfg.offices[res.id];
  assert.equal(mine.home, realty);
  assert.equal(mine.settings.businessName, 'Northgate Realty');
  assert.equal(mine.settings.onboardingComplete, true, 'its setup is done');
  assert.equal(mine.settings.claudeLogin, 'own', 'the Ready step\'s choice');
  assert.equal('autoMode' in mine.settings, false, 'install settings never go in a business');
  assert.equal(cfg.autoMode, false, 'they are install settings');
  assert.equal(cfg.harnessHome, s.bakery, 'the open office is still open: the switch comes after');
  assert.equal(cfg.businessName, undefined, 'nothing at the top');
  assert.deepEqual(cfg.offices[s.bakeryId].settings, s.bakerySettings, 'the open business untouched');
});

test('never the open office\'s folder, never over a business that finished setup', (t) => {
  const s = scene(t);
  assert.deepEqual(s.settings.addBusiness({ home: s.bakery, settings: { businessName: 'X' } }), { ok: false, error: 'isOpen' });
  const realty = path.join(s.userData, 'realty');
  const first = s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty' } });
  // Its office now exists there (it opened once).
  fs.mkdirSync(path.join(realty, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(realty, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  s.file.ensureOfficeId(realty, first.id);
  assert.deepEqual(s.settings.addBusiness({ home: realty, settings: { businessName: 'Someone Else' } }), { ok: false, error: 'exists' });
  assert.equal(s.stored().offices[first.id].settings.businessName, 'Northgate Realty');
});

test('Back to office keeps it as Setup not finished, and finishing goes on from the same entry', (t) => {
  const s = scene(t);
  const where = path.join(s.userData, 'HarnessAgents 3');
  const id = s.settings.saveBusinessDraft({ home: where, step: 'team', settings: { businessName: 'Corner Florist', businessType: 'retail' } });
  assert.ok(id);
  const row = s.settings.listBusinesses().businesses.find((b) => b.id === id);
  assert.equal(row.state, 'setup');
  assert.equal(row.name, 'Corner Florist');
  assert.deepEqual(s.settings.businessDraft(id), { id, home: where, step: 'team', settings: { businessName: 'Corner Florist', businessType: 'retail', onboardingComplete: false } });

  assert.equal(s.settings.saveBusinessDraft({ id, home: where, step: 'orchestrator', settings: { businessName: 'Corner Florist' } }), id, 'the same entry each time');
  assert.equal(s.settings.businessDraft(id).step, 'orchestrator');

  const done = s.settings.addBusiness({ id, home: where, settings: { businessName: 'Corner Florist' } });
  assert.deepEqual(done, { ok: true, id });
  assert.equal(s.stored().offices[id].draft, undefined, 'no draft once its setup is done');
  assert.equal(s.settings.businessDraft(id), null);
  assert.equal(s.settings.saveBusinessDraft({ home: s.bakery, step: 'business', settings: {} }), null, 'never the open office\'s folder');
});

test('the wizard over the floor: the open office runs until Open the office, then the switch', () => {
  const wiz = read('src/renderer/src/components/OnboardingWizard.tsx');
  const finish = wiz.slice(wiz.indexOf('if (add) {\n        // The new business'), wiz.indexOf('const next = await window.cth.updateConfig(patch);'));
  assert.ok(finish.length > 0, 'add mode has its own finish');
  const saved = finish.indexOf('window.cth.addBusiness(');
  const sw = finish.indexOf("window.cth.changeHome(harnessHome, 'fresh')");
  assert.ok(saved > 0 && sw > saved, 'saved into its own entry, then the switch (closing time first)');
  assert.doesNotMatch(finish, /updateConfig/, 'never saved through the open business');
  assert.match(finish, /settings: \{ \.\.\.patch, claudeLogin \}/);
  // Back to office keeps a draft; adding never takes over the open office's folder.
  assert.match(wiz, /const id = await window\.cth\.saveBusinessDraft\(\{/);
  assert.match(wiz, /\/\/ Adding a business never takes over the open office's folder\.\n\s*if \(add\) return;/);
  // A free folder from the start; named after the business once it has a name.
  assert.match(wiz, /if \(add\) \{\s*void firstFreeHome\(\)\.then/);
  // The Ready step: the account choice, and no sign in wait for a different account.
  assert.match(wiz, /\{step === 'ready' && add && \(\n\s*<ClaudeAccountChoice/);
  assert.match(wiz, /\{step === 'ready' && !\(add && claudeLogin === 'own'\) && <GetMichaelReady/);
  assert.match(wiz, /role="radiogroup"/);

  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /\{addBusiness && \(\n\s*<OnboardingWizard\n\s*onComplete=\{\(\) => setAddBusiness\(null\)\}\n\s*add=\{\{/, 'over the floor, which stays mounted');
  assert.match(app, /window\.addEventListener\('cth:add-business', onAdd\);/);
  assert.match(read('src/renderer/src/shell/BusinessMenu.tsx'), /if \(action === 'resume'\) \{ close\(false\); openAddBusiness\(row\.id\); return; \}/);
  assert.match(read('src/renderer/src/components/YourBusinesses.tsx'), /onClick=\{\(\) => openAddBusiness\(row\.id\)\}/);
  assert.match(read('src/main/index.ts'), /ipcMain\.handle\('office:addBusiness'/);
});

test('the words: present, no dashes, no hardcoded name', () => {
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).addBusiness;
  assert.equal(en.backToOffice, 'Back to the office');
  assert.equal(en.claudeOwn, 'A different Claude account');
  for (const [k, v] of Object.entries(en)) assert.doesNotMatch(v, /[–—]| - |Michael/, k);
});

// Owner, 2026-11-19: finishing Add a business switched to the new business,
// and it opened on "we can't find your office": its folder was made, its office
// was not, and launch takes an empty folder for a lost office.
test('a business just added opens on its first launch; a lost office still does not', (t) => {
  const s = scene(t);
  const { homeReadyAtLaunch } = loadTs('src/main/homeFolder.ts');
  const realty = path.join(s.userData, 'HarnessAgents 2');
  fs.mkdirSync(realty);
  const res = s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty', onboardingComplete: true } });
  assert.equal(res.ok, true);
  // The switch: the bakery closes and the new folder is the open one.
  const cfg = s.stored();
  cfg.offices[s.bakeryId].closedAt = 1;
  cfg.harnessHome = realty;
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  assert.equal(s.settings.neverOpenedBusiness(s.stored()), true);
  assert.equal(homeReadyAtLaunch({ onboardingComplete: true, harnessHome: realty }, s.settings.neverOpenedBusiness(s.stored())), true, 'launch makes its office');

  // Made, the office takes the business's own id, so its settings follow.
  fs.mkdirSync(path.join(realty, 'hive'));
  fs.writeFileSync(path.join(realty, 'hive', 'registry.json'), JSON.stringify({ godId: null, agents: {} }));
  assert.equal(s.settings.adoptOpenOffice(), res.id);
  assert.equal(s.file.readOfficeId(realty), res.id);

  // Once it has run (its team started, or it closed), an empty folder is a lost office.
  for (const ran of [{ settings: { onboardingComplete: true, businessTeamStarted: true } }, { closedAt: 5 }]) {
    const c = s.stored();
    c.offices[res.id] = { ...c.offices[res.id], ...ran, settings: { ...c.offices[res.id].settings, ...(ran.settings ?? {}) } };
    fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(c));
    assert.equal(s.settings.neverOpenedBusiness(s.stored()), false, JSON.stringify(ran));
  }
  // Nor a draft, nor the business that was open before.
  const back = s.stored(); back.harnessHome = s.bakery;
  assert.equal(s.settings.neverOpenedBusiness(back), false);
  assert.equal(s.settings.neverOpenedBusiness({ ...back, harnessHome: realty, offices: { x: { home: realty, settings: {}, draft: { step: 'team' } } } }), false);
});

// Value: protects=a draft id names only an unfinished business: the id of one that finished setup never lets Add a business or Back to office write over it, and nothing is added before the move; fails_when=the onboardingComplete check on p.id goes, or the officesMigrated guard goes; why_new=the tests above pass only draft ids or none; seam=none; no_claim=what the renderer sends (main side only)
test('a finished business\'s id is never taken as a draft, and nothing is added before the move', (t) => {
  const s = scene(t);
  const other = path.join(s.userData, 'HarnessAgents 4');
  const added = s.settings.addBusiness({ id: s.bakeryId, home: other, settings: { businessName: 'Corner Florist' } });
  assert.equal(added.ok, true);
  assert.notEqual(added.id, s.bakeryId, 'a new entry of its own');
  const draft = s.settings.saveBusinessDraft({ id: s.bakeryId, home: path.join(s.userData, 'HarnessAgents 5'), step: 'team', settings: { businessName: 'Northgate Realty' } });
  assert.ok(draft && draft !== s.bakeryId);
  assert.equal(s.settings.businessDraft(s.bakeryId), null, 'a finished business has no draft');
  assert.deepEqual(s.stored().offices[s.bakeryId], { home: s.bakery, settings: s.bakerySettings }, 'the finished business untouched');

  const cfg = s.stored();
  delete cfg.officesMigrated;
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  assert.deepEqual(s.settings.addBusiness({ home: other, settings: { businessName: 'X' } }), { ok: false, error: 'notPerOffice' });
  assert.equal(s.settings.saveBusinessDraft({ home: other, step: 'business', settings: {} }), null);
});

// Value: protects=a business added from setup starts under the open business's spend caps unless setup chose its own; fails_when=addBusiness saves only the wizard's fields; why_new=pre-landing review (targeted money reader); seam=none; no_claim=the wizard UI
test('a business added from setup starts under the open business\'s spend caps', (t) => {
  const s = scene(t);
  const cfg = s.stored();
  cfg.offices[s.bakeryId].settings = { ...cfg.offices[s.bakeryId].settings, costCapTokens: 750000, costCapUsd: 25, agentTokenCaps: { pam: 1000 } };
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  const realty = path.join(s.userData, 'realty');
  const res = s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty' } });
  assert.equal(res.ok, true);
  const added = s.stored().offices[res.id].settings;
  assert.deepEqual([added.costCapTokens, added.costCapUsd], [750000, 25]);
  assert.equal(added.agentTokenCaps, undefined, 'a cap set for another business\'s member stays there');
  const own = s.settings.addBusiness({ home: path.join(s.userData, 'cafe'), settings: { businessName: 'Contoso Cafe', costCapUsd: 5 } });
  assert.equal(s.stored().offices[own.id].settings.costCapUsd, 5, 'its own cap wins');
});

// Value: protects=two businesses never share one business folder, from Add a business or from a save of the open business; fails_when=addBusiness or businessFolderTakenBy stop checking the other entries' businessFolder, or compare raw strings; why_new=the folder checks above are about the office folder only; seam=none; no_claim=the wizard UI
test('never another business\'s business folder, from Add a business or a save in Settings', (t) => {
  const s = scene(t);
  const bakeryDocs = path.join(s.userData, 'Documents', 'Harbor & Pine Bakery');
  const cfg = s.stored();
  cfg.offices[s.bakeryId].settings.businessFolder = bakeryDocs;
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  const realty = path.join(s.userData, 'realty');
  const taken = { ok: false, error: 'folderTaken', name: 'Harbor & Pine Bakery' };
  assert.deepEqual(s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty', businessFolder: bakeryDocs } }), taken);
  assert.deepEqual(s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty', businessFolder: bakeryDocs + path.sep } }), taken, 'a trailing separator is the same folder');
  assert.deepEqual(Object.keys(s.stored().offices), [s.bakeryId], 'nothing saved when refused');

  const realtyDocs = path.join(s.userData, 'Documents', 'Northgate Realty');
  const added = s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty', businessFolder: realtyDocs } });
  assert.equal(added.ok, true, 'a folder of its own is fine');

  // Settings: the open bakery's business folder changing.
  assert.deepEqual(s.settings.businessFolderTakenBy(realtyDocs), { id: added.id, name: 'Northgate Realty' });
  assert.deepEqual(s.settings.businessFolderTakenBy(realtyDocs + path.sep), { id: added.id, name: 'Northgate Realty' });
  assert.equal(s.settings.businessFolderTakenBy(bakeryDocs), null, 'the open business keeps its own folder');
  assert.equal(s.settings.businessFolderTakenBy(path.join(s.userData, 'Documents', 'Bakery 2')), null);

  // A draft finishing in place is not refused for its own folder.
  const florist = path.join(s.userData, 'florist');
  const floristDocs = path.join(s.userData, 'Documents', 'Corner Florist');
  const id = s.settings.saveBusinessDraft({ home: florist, step: 'ready', settings: { businessName: 'Corner Florist', businessFolder: floristDocs } });
  assert.deepEqual(s.settings.addBusiness({ id, home: florist, settings: { businessName: 'Corner Florist', businessFolder: floristDocs } }), { ok: true, id });
});

// Value: protects=setup asks before any folder is made, with the right business exempt: Add a business never takes the open business's folder, its own setup keeps its own; fails_when=add mode exempts the open business, or own setup refuses its own folder; why_new=the wizard's check runs before ensureHarnessHome and foldersEnsure, so addBusiness's refusal comes too late to stop folders being made; seam=none; no_claim=the wizard UI
test('the check setup runs before making folders: Add a business, and the open business\'s own setup', (t) => {
  const s = scene(t);
  const bakeryDocs = path.join(s.userData, 'Documents', 'Harbor & Pine Bakery');
  const cfg = s.stored();
  cfg.offices[s.bakeryId].settings.businessFolder = bakeryDocs;
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  const realtyDocs = path.join(s.userData, 'Documents', 'Northgate Realty');
  const id = s.settings.saveBusinessDraft({ home: path.join(s.userData, 'realty'), step: 'team', settings: { businessName: 'Northgate Realty', businessFolder: realtyDocs } });

  // Add a business: the open business's folder is taken, the draft's own is not.
  assert.deepEqual(s.settings.businessFolderTakenBy(bakeryDocs, { id: null }), { id: s.bakeryId, name: 'Harbor & Pine Bakery' });
  assert.deepEqual(s.settings.businessFolderTakenBy(bakeryDocs + path.sep, { id }), { id: s.bakeryId, name: 'Harbor & Pine Bakery' });
  assert.equal(s.settings.businessFolderTakenBy(realtyDocs, { id }), null, 'the draft keeps its own folder');
  assert.deepEqual(s.settings.businessFolderTakenBy(realtyDocs, { id: null }), { id, name: 'Northgate Realty' }, 'a different new business may not take the draft\'s');
  assert.equal(s.settings.businessFolderTakenBy(path.join(s.userData, 'Documents', 'Cafe'), { id: null }), null);

  // The open business's own setup: its own folder is fine, another's is not.
  assert.equal(s.settings.businessFolderTakenBy(bakeryDocs), null);
  assert.deepEqual(s.settings.businessFolderTakenBy(realtyDocs), { id, name: 'Northgate Realty' });
});

test('another business\'s business folder in other letter case', { skip: process.platform === 'linux' && 'Linux folder names are case sensitive' }, (t) => {
  const s = scene(t);
  const bakeryDocs = path.join(s.userData, 'Documents', 'Harbor & Pine Bakery');
  const cfg = s.stored();
  cfg.offices[s.bakeryId].settings.businessFolder = bakeryDocs;
  cfg.offices.other = { home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', businessFolder: path.join(s.userData, 'Documents', 'Northgate') } };
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  assert.deepEqual(s.settings.addBusiness({ home: path.join(s.userData, 'cafe'), settings: { businessFolder: bakeryDocs.toUpperCase() } }), { ok: false, error: 'folderTaken', name: 'Harbor & Pine Bakery' });
  assert.equal(s.settings.businessFolderTakenBy(path.join(s.userData, 'Documents', 'NORTHGATE')).name, 'Northgate Realty');
});

/** The scene with the bakery on `bakeryDocs` and other entries added. */
function withFolders(s, bakeryDocs, others = {}) {
  const cfg = s.stored();
  cfg.offices[s.bakeryId].settings.businessFolder = bakeryDocs;
  Object.assign(cfg.offices, others);
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
}

// Value: protects=a business folder inside another business's, or holding it, is refused too, as is the same folder spelled with ~ or through a link; fails_when=businessUsingFolder compares for equality only, or compares without expanding ~ or following links; why_new=folder access reaches every folder inside an agent's own, and the tests above use only exact spellings; seam=none; no_claim=what the agents can reach (folderAccess tests)
test('a folder inside another business\'s, or around it, and other spellings of it', (t) => {
  const s = scene(t);
  const docs = path.join(s.userData, 'Documents');
  const bakeryDocs = path.join(docs, 'Harbor & Pine Bakery');
  withFolders(s, bakeryDocs);
  const taken = { ok: false, error: 'folderTaken', name: 'Harbor & Pine Bakery' };
  const add = (businessFolder) => s.settings.addBusiness({ home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', businessFolder } });
  assert.deepEqual(add(path.join(bakeryDocs, 'Realty')), taken, 'inside the bakery\'s folder');
  assert.deepEqual(add(docs), taken, 'holding the bakery\'s folder');
  assert.deepEqual(add(path.join(bakeryDocs, '..', 'Harbor & Pine Bakery', 'x', '..')), taken, 'the same folder, spelled the long way');
  assert.equal(s.settings.businessFolderTakenBy(path.join(docs, 'Harbor & Pine Bakery 2'), { id: null }), null, 'a folder whose name only starts the same is apart');

  // Through a link (or a junction on Windows), to a folder not made yet.
  fs.mkdirSync(bakeryDocs, { recursive: true });
  const link = path.join(s.userData, 'Linked');
  fs.symlinkSync(docs, link, 'junction');
  assert.deepEqual(add(path.join(link, 'Harbor & Pine Bakery', 'New')), taken, 'a link to the bakery\'s folder');

  // Written with ~: expanded where the folders are compared, not only in the IPC.
  const mine = `dbm-test-${path.basename(s.userData)}`;
  withFolders(s, `~/${mine}`);
  assert.deepEqual(add(path.join(os.homedir(), mine)), taken, 'stored with ~, asked without');
  assert.deepEqual(add(path.join(os.homedir(), mine, 'Realty')), taken, 'inside it');
  withFolders(s, path.join(os.homedir(), mine));
  assert.deepEqual(add(`~/${mine}/Realty`), taken, 'asked with ~');
  assert.deepEqual(s.settings.businessFolderTakenBy(`~/${mine}/Realty`, { id: null }), { id: s.bakeryId, name: 'Harbor & Pine Bakery' });
  assert.equal(fs.existsSync(path.join(os.homedir(), mine)), false, 'nothing made on disk');

  // The open business's own setup: nested both ways too.
  const realtyDocs = path.join(docs, 'Northgate Realty');
  withFolders(s, bakeryDocs, { other: { home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', businessFolder: realtyDocs } } });
  assert.equal(s.settings.businessFolderTakenBy(path.join(realtyDocs, 'Bakery')).name, 'Northgate Realty');
  assert.equal(s.settings.businessFolderTakenBy(docs).name, 'Northgate Realty');
  assert.equal(s.settings.businessFolderTakenBy(bakeryDocs), null, 'its own folder');
});

// Value: protects=a business saved before businessFolder existed still owns its folder, through its old officeFolder; fails_when=businessUsingFolder reads businessFolder only; why_new=every test above stores businessFolder; seam=none; no_claim=the launch migration that fills businessFolder in (company-knowledge tests)
test('a business saved before businessFolder existed is matched by its old office folder', (t) => {
  const s = scene(t);
  const docs = path.join(s.userData, 'Documents');
  const realtyDocs = path.join(docs, 'Northgate Realty');
  withFolders(s, path.join(docs, 'Harbor & Pine Bakery'), {
    old: { home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', officeFolder: path.join(realtyDocs, 'Office') } }
  });
  const taken = { ok: false, error: 'folderTaken', name: 'Northgate Realty' };
  const add = (businessFolder) => s.settings.addBusiness({ home: path.join(s.userData, 'cafe'), settings: { businessName: 'Contoso Cafe', businessFolder } });
  assert.deepEqual(add(realtyDocs), taken, 'the folder holding its Office folder');
  assert.deepEqual(add(path.join(realtyDocs, 'Cafe')), taken, 'inside it');
  assert.equal(s.settings.businessFolderTakenBy(realtyDocs).name, 'Northgate Realty', 'from Settings too');
  assert.equal(add(path.join(docs, 'Contoso Cafe')).ok, true);
});

// Value: protects=the open business is never refused its own folder when its id can't be found (office.json missing, or remade with a new id); fails_when=businessFolderTakenBy takes only the entry of the id it finds as itself; why_new=the tests above always have the bakery's office.json; seam=none; no_claim=how launch finds the id again (office-settings tests)
test('an open business whose id can\'t be found keeps its own folder', (t) => {
  const s = scene(t);
  const docs = path.join(s.userData, 'Documents');
  const bakeryDocs = path.join(docs, 'Harbor & Pine Bakery');
  const realtyDocs = path.join(docs, 'Northgate Realty');
  // Its entry under an id launch can't match by folder, and no office.json.
  const cfg = s.stored();
  cfg.offices = {
    old: { home: s.bakery, settings: { ...s.bakerySettings, businessFolder: bakeryDocs } },
    other: { home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', businessFolder: realtyDocs } }
  };
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  fs.rmSync(path.join(s.bakery, 'office.json'));
  assert.equal(s.settings.businessFolderTakenBy(bakeryDocs), null, 'its own folder, unchanged');
  assert.equal(s.settings.businessFolderTakenBy(path.join(bakeryDocs, 'Kitchen')), null, 'or inside it');
  assert.equal(s.settings.businessFolderTakenBy(realtyDocs).name, 'Northgate Realty', 'another business\'s is still refused');

  // office.json remade with an id that has no entry.
  s.file.ensureOfficeId(s.bakery);
  assert.ok(s.file.readOfficeId(s.bakery) && !s.stored().offices[s.file.readOfficeId(s.bakery)]);
  assert.equal(s.settings.businessFolderTakenBy(bakeryDocs), null);
  assert.equal(s.settings.businessFolderTakenBy(realtyDocs).name, 'Northgate Realty');
});

// Value: protects=the open business the check exempts is the one the save goes to: setup's harnessHome when it sends one, as writeConfig files it; fails_when=businessFolderTakenBy or folderTakenRefusal take the stored harnessHome only; why_new=the tests above always save from the stored office; seam=none; no_claim=writeConfig's routing (office-config-routing tests)
test('the open business is the one the save goes to, when the save sets the office folder', (t) => {
  const s = scene(t);
  const docs = path.join(s.userData, 'Documents');
  const realty = path.join(s.userData, 'realty');
  const realtyDocs = path.join(docs, 'Northgate Realty');
  withFolders(s, path.join(docs, 'Harbor & Pine Bakery'), { other: { home: realty, settings: { businessName: 'Northgate Realty', businessFolder: realtyDocs } } });
  // Setup over the realty folder, while the stored office is still the bakery.
  assert.equal(s.settings.folderTakenRefusal({ harnessHome: realty, businessFolder: realtyDocs }), null, 'its own folder');
  assert.deepEqual(s.settings.folderTakenRefusal({ harnessHome: realty, businessFolder: path.join(docs, 'Harbor & Pine Bakery') }), { ok: false, error: 'folderTaken', name: 'Harbor & Pine Bakery' }, 'the stored office\'s is another business\'s');
  assert.equal(s.settings.businessFolderTakenBy(realtyDocs, undefined, realty), null, 'the pre-check, with the folder setup sends');
  assert.equal(s.settings.businessFolderTakenBy(realtyDocs).name, 'Northgate Realty', 'without it, the stored office is the open one');
  assert.match(read('src/main/index.ts'), /return businessFolderTakenBy\(folder, forAdd, typeof home === 'string' && home \? home : undefined\);/);
});

// Value: protects=launch fills businessFolder in from an old Office folder without landing in or around another business's folder, and writes nothing when the Office folder itself is; fails_when=businessFolderFromOffice skips the check on the parent or on the Office folder; why_new=PR 740 review 2026-11-28; seam=none; no_claim=the launch call (company-knowledge tests pin it)
test('an old Office folder gives a business folder of its own, or none', (t) => {
  const s = scene(t);
  const biz = path.join(s.userData, 'Biz');
  const office = path.join(biz, 'Office');
  fs.mkdirSync(office, { recursive: true });
  assert.equal(s.settings.businessFolderFromOffice(office), biz, 'the folder holding it');
  withFolders(s, path.join(s.userData, 'Documents', 'Harbor & Pine Bakery'), { other: { home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', businessFolder: path.join(biz, 'Realty') } } });
  assert.equal(s.settings.businessFolderFromOffice(office), office, 'another business inside the parent: the Office folder itself');
  withFolders(s, path.join(s.userData, 'Documents', 'Harbor & Pine Bakery'), { other: { home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', officeFolder: office } } });
  assert.equal(s.settings.businessFolderFromOffice(office), null, 'another business on the parent holds the Office folder too: nothing');
  withFolders(s, path.join(s.userData, 'Documents', 'Harbor & Pine Bakery'), { other: { home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', businessFolder: office } } });
  assert.equal(s.settings.businessFolderFromOffice(office), null, 'the same Office folder: nothing');
});

// Value: protects=config:update never saves a business folder another business uses: it answers with that business's name and writes nothing, so setup never finishes without a folder; fails_when=the backstop in config:update goes, moves after writeConfig, or throws instead of answering; why_new=before this the backstop could go with every test green; seam=the IPC handler is pinned by source order; no_claim=the Settings window (it never saves businessFolder)
test('config:update refuses a business folder another business uses, saving nothing', (t) => {
  const s = scene(t);
  const docs = path.join(s.userData, 'Documents');
  withFolders(s, path.join(docs, 'Harbor & Pine Bakery'), {
    other: { home: path.join(s.userData, 'realty'), settings: { businessName: 'Northgate Realty', businessFolder: path.join(docs, 'Northgate Realty') } }
  });
  const refused = { ok: false, error: 'folderTaken', name: 'Northgate Realty' };
  assert.deepEqual(s.settings.folderTakenRefusal({ businessFolder: path.join(docs, 'Northgate Realty'), businessCity: 'Austin' }), refused);
  assert.deepEqual(s.settings.folderTakenRefusal({ businessFolder: path.join(docs, 'Northgate Realty', 'Bakery') }), refused);
  assert.equal(s.settings.folderTakenRefusal({ businessFolder: path.join(docs, 'Harbor & Pine Bakery') }), null, 'its own');
  assert.equal(s.settings.folderTakenRefusal({ businessCity: 'Austin' }), null, 'no folder in the save');
  assert.equal(s.settings.folderTakenRefusal(null), null);

  const main = read('src/main/index.ts');
  const handler = main.slice(main.indexOf("ipcMain.handle('config:update'"));
  const check = handler.indexOf('const refused = folderTakenRefusal(patch);\n  if (refused) return refused;');
  assert.ok(check > 0 && check < handler.indexOf('writeConfig(patch)'), 'answered before anything is saved');
  assert.match(read('src/preload/index.ts'), /updateConfig: \(patch: Partial<HarnessConfig>\): Promise<HarnessConfig \| \{ ok: false; error: 'folderTaken'; name: string \| null \}>/);
});

// Value: protects=setup asks before it makes any folder, and every refusal says which business has the folder and goes back to the team step: the check, addBusiness's answer and config:update's; fails_when=the check moves after ensureHarnessHome or foldersEnsure, or a refusal stays on the last step or shows other words; why_new=the main side tests can't see the wizard's order; seam=source order pin; no_claim=the rendered wizard
test('the wizard asks before making folders, and a taken folder goes back to the team step', () => {
  const wiz = read('src/renderer/src/components/OnboardingWizard.tsx');
  const finish = wiz.slice(wiz.indexOf('const finish = async () => {'), wiz.indexOf('// Design v2 onboarding'));
  const asked = finish.indexOf('const taken = await window.cth.businessFolderTakenBy(finishPlan.business, add ? { id: draftId ?? null } : undefined, harnessHome);');
  assert.ok(asked > 0, 'asked at finish');
  assert.ok(asked < finish.indexOf('window.cth.ensureHarnessHome('), 'before the office folder is made');
  assert.ok(asked < finish.indexOf('window.cth.foldersEnsure('), 'before the team\'s folders are made');
  assert.match(finish, /if \(taken\) \{ refuseFolder\(taken\.name\); return; \}/);
  assert.match(finish, /if \(saved\.error === 'folderTaken'\) \{ refuseFolder\(saved\.name\); return; \}/);
  assert.match(finish, /const next = await window\.cth\.updateConfig\(patch\);\n\s*if \('error' in next\) \{ refuseFolder\(next\.name\); return; \}/);
  assert.match(wiz, /const refuseFolder = \(name: string \| null \| undefined\) => \{\n\s*setError\(folderTakenWords\(t, name\)\); setBusy\(false\); setStep\('team'\);\n\s*\};/);
  assert.match(wiz, /return t\('addBusiness\.folderTaken', \{ name: name \|\| t\('addBusiness\.anotherBusiness'\) \}\);/);
});

test('a business added over a folder that holds an office describes that office.json, so launch sees no name mismatch', (t) => {
  // Value: protects=the launch name check stays quiet for a business added over an existing office folder; fails_when=addBusiness files the new name in the settings but leaves office.json naming the folder's old business, so every launch logs office-name-mismatch; why_new=PR 738 review 2026-11-27; seam=real config and office.json on disk; no_claim=the launch line itself (office-name-check.test.cjs)
  const s = scene(t);
  const { businessNameMismatch } = loadTs('src/shared/officeRecord.ts');
  const old = path.join(s.userData, 'old office');
  fs.mkdirSync(path.join(old, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(old, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  const oldId = s.file.ensureOfficeId(old);
  s.file.writeOfficeRecord(old, { ...s.file.readOfficeRecord(old), businessName: 'Contoso Cafe', team: [] });
  const res = s.settings.addBusiness({ home: old, settings: { businessName: 'Northgate Realty', businessType: 'services' } });
  assert.equal(res.ok, true);
  assert.equal(res.id, oldId, 'the folder keeps its office id');
  const rec = s.file.readOfficeRecord(old);
  assert.equal(rec.id, oldId, 'office.json keeps the id');
  assert.equal(rec.businessName, 'Northgate Realty', 'office.json names the business that now owns the folder');
  const opened = { ...s.stored().offices[res.id].settings, harnessHome: old };
  assert.equal(businessNameMismatch(opened, rec), false, 'the next launch finds no mismatch');
  assert.equal(fs.existsSync(path.join(s.userData, 'fresh', 'office.json')), false);
  s.settings.addBusiness({ home: path.join(s.userData, 'fresh'), settings: { businessName: 'Contoso Cafe' } });
  assert.equal(fs.existsSync(path.join(s.userData, 'fresh', 'office.json')), false, 'a folder with no office yet gets no office.json from here');
});

test('a setup picked up again over a folder that is now another business is refused, and that office.json keeps its name', (t) => {
  // Value: protects=another business's office.json is never renamed by Add a business; fails_when=a draft id skips the folder check, so finishing it over a finished business's folder files a second entry there and writes the new name into that business's office.json; why_new=review 2026-11-27 of the running branch; seam=real config and office.json on disk; no_claim=the wizard's message for the refusal
  const s = scene(t);
  const shop = path.join(s.userData, 'shop');
  const id = s.settings.saveBusinessDraft({ home: shop, step: 'team', settings: { businessName: 'Corner Florist' } });
  // Meanwhile another business that finished setup has its office there.
  fs.mkdirSync(path.join(shop, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(shop, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  const otherId = s.file.ensureOfficeId(shop);
  s.file.writeOfficeRecord(shop, { ...s.file.readOfficeRecord(shop), businessName: 'Contoso Cafe', team: [] });
  const cfg = s.stored();
  cfg.offices[otherId] = { home: shop, settings: { businessName: 'Contoso Cafe', onboardingComplete: true } };
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));

  assert.deepEqual(s.settings.addBusiness({ id, home: shop, settings: { businessName: 'Corner Florist' } }), { ok: false, error: 'exists' });
  assert.equal(s.file.readOfficeRecord(shop).businessName, 'Contoso Cafe', 'the other business keeps its office.json');
  assert.equal(s.stored().offices[id].settings.onboardingComplete, false, 'the draft stays a draft');
});

test('an office.json with another id is never renamed by Add a business', () => {
  // Value: protects=the record write names only the business being filed; fails_when=addBusiness syncs office.json whenever the folder holds an office, whatever office it is; why_new=review 2026-11-27 of the running branch; seam=source pin on the guard; no_claim=which folders are refused (test above)
  const src = read('src/main/officeSettings.ts');
  assert.match(src, /hasOffice && readOfficeId\(p\.home\) === id\) syncOfficeRecord\(/);
});
