'use strict';

// A1: one Save button. Settings used to persist three different ways — toggles
// wrote on click, some sections had their own Save, a couple of fields saved on
// blur — and nothing told the user which kind they were looking at.
//
// SettingsModal has a wide import graph. Source checks pin the shared save
// wiring; the company profile regressions execute its production handlers
// with only React state and the Electron bridge replaced.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const loadTs = require('./load-ts.cjs');
const { cleanCompanyProfile, cityLine } = loadTs('src/shared/companyProfile.ts');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MODAL = read('src/renderer/src/components/SettingsModal.tsx');
const PROFILE = read('src/renderer/src/components/CompanyProfileSettings.tsx');

test('there is exactly one writer of config in the whole modal', () => {
  const calls = `${MODAL}\n${PROFILE}`.match(/window\.cth\.updateConfig\(/g) ?? [];
  assert.equal(calls.length, 1,
    `${calls.length} updateConfig calls — every setting must go through saveAll`);
});

test('the one writer is saveAll, and it sends a single merged patch', () => {
  const i = MODAL.indexOf('const saveAll');
  assert.ok(i > 0, 'saveAll is gone');
  const body = MODAL.slice(i, MODAL.indexOf('\n  };', i));
  assert.match(body, /window\.cth\.updateConfig\(patch\)/,
    'saveAll must write one patch, not several calls');
  for (const part of ['maxTurnsPatch()', 'budgetPatch()', '...pending']) {
    assert.ok(body.includes(part), `saveAll does not include ${part}`);
  }
});

test('toggles stage their change instead of writing it', () => {
  // The specific toggles that used to persist the instant you clicked them.
  for (const key of ['strongKeepalive', 'autoMode', 'orchestratorMaySpawn',
                     'semanticMemory', 'telemetryEnabled']) {
    // autoUpdate left with its switch: every installed build checks (owner, 2026-10-02).
    const re = new RegExp(`stage\\(\\{ ${key}:`);
    assert.match(MODAL, re, `${key} is not staged`);
  }
});

test('closing with staged changes asks first, instead of dropping them', () => {
  assert.match(MODAL, /const requestClose/, 'no close guard');
  const i = MODAL.indexOf('const requestClose');
  const body = MODAL.slice(i, i + 300);
  assert.match(body, /dirty/, 'the guard does not check for staged changes');
  assert.match(body, /window\.confirm/, 'the guard does not actually ask');
  // And the footer button must use it, not raw onClose.
  assert.match(MODAL, /onClick=\{requestClose\}/, 'the footer Close bypasses the guard');
});

test('the footer offers Save, and it is the only Save left in the modal', () => {
  assert.match(MODAL, /onClick=\{\(\) => void saveAll\(\)\}/, 'no footer Save');
  // The per-section Save buttons this replaced are gone.
  assert.doesNotMatch(MODAL, /onClick=\{saveBudget\}/, 'the budget Save button is back');
  assert.doesNotMatch(MODAL, /onBlur=\{\(\) => void saveMaxTurns\(\)\}/, 'maxTurns saves on blur again');
  assert.doesNotMatch(PROFILE, /companyProfile\.save|window\.cth\.updateConfig/, 'the profile has a separate save again');
});

test('the company profile uses a parent draft that survives section navigation', () => {
  // Value: protects=profile edits survive leaving their section and use the footer Save; fails_when=the child owns its draft or bypasses the parent; why_new=the one-save checks previously missed child components; seam=source wiring
  assert.doesNotMatch(PROFILE, /useState/, 'a section-local draft is lost when its section unmounts');
  assert.match(MODAL, /<CompanyProfileSettings[\s\S]*?value=\{companyDraft\}/);
  assert.match(MODAL, /<CompanyProfileSettings[\s\S]*?onChange=\{editCompanyProfile\}/);
  assert.match(PROFILE, /onChange=\{[^\n]*onChange\(/, 'the name input must send changes to the parent');
});

// Execute the actual save, edit and close handlers, including their dirty
// expressions. Each render captures that render's draft, as React does, so a
// delayed save can be checked against an edit made while it was outstanding.
const ast = ts.createSourceFile('SettingsModal.tsx', MODAL, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'SettingsModal');
const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap((node) => [...node.declarationList.declarations]);
const handlerCode = ts.transpileModule(
  ['companyProfileDirty', 'dirty', 'editCompanyProfile', 'saveAll', 'requestClose'].map((name) => {
    const declaration = declarations.find((node) => ts.isIdentifier(node.name) && node.name.text === name);
    assert.ok(declaration, `production ${name} declaration exists`);
    return `const ${declaration.getText(ast)};`;
  }).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
).outputText;

function profileSettings(write = async () => {}) {
  const config = { businessName: 'Original Bakery', businessCity: 'Old City', companyProfile: { ceo: 'Ana' } };
  const initial = { name: config.businessName, profile: cleanCompanyProfile(config.companyProfile) };
  const state = { draft: initial, saved: initial, pending: {}, note: '', busy: false, closed: 0, confirms: 0 };
  const writes = [];
  const render = () => {
    const deps = {
      companyDraft: state.draft, savedCompanyDraft: state.saved, pending: state.pending,
      autoCompactPending: null, config, cleanCompanyProfile, cityLine,
      setCompanyDraft: (next) => { state.draft = next; },
      setSavedCompanyDraft: (next) => { state.saved = next; },
      setPending: (next) => { state.pending = next; },
      setAutoCompactPending: () => {},
      setSaveBusy: (next) => { state.busy = next; },
      setSaveNote: (next) => { state.note = next; },
      maxTurnsPatch: () => ({}), planPricePatch: () => ({}), budgetPatch: () => ({}),
      t: (key) => key, setTimeout: () => 0,
      onClose: () => { state.closed++; },
      window: {
        confirm: () => { state.confirms++; return false; },
        cth: { updateConfig: async (patch) => { writes.push(patch); await write(patch); return { ...config, ...patch }; } }
      }
    };
    return new Function('deps', `const { ${Object.keys(deps).join(', ')} } = deps;\n${handlerCode}\nreturn { editCompanyProfile, saveAll, requestClose, dirty };`)(deps);
  };
  return { state, writes, render };
}

test('footer Save persists the edited profile and other settings in one normalized patch', async () => {
  // Value: protects=Saved means the profile was written; fails_when=footer Save omits the child draft; why_new=the two Save buttons previously wrote different fields; seam=React setters and IPC
  const app = profileSettings();
  app.state.pending = { strongKeepalive: true };
  app.render().editCompanyProfile({ name: '  New Bakery  ', profile: {
    ceo: '  Sam   Rivera ', address: { city: ' New City ', region: ' CA ' },
    social: [' ', ' https://example.com/bakery '], currency: 'usd'
  } });
  assert.equal(app.state.draft.name, '  New Bakery  ', 'typing keeps raw whitespace');
  assert.equal(app.render().dirty, true);
  await app.render().saveAll();
  assert.deepEqual(app.writes, [{
    strongKeepalive: true, businessName: 'New Bakery', businessCity: 'New City, CA',
    companyProfile: { ceo: 'Sam Rivera', address: { city: 'New City', region: 'CA' }, social: ['https://example.com/bakery'], currency: 'USD' }
  }]);
  assert.equal(app.state.note, 'settings.saved');
  assert.equal(app.render().dirty, false);
});

test('saving another setting does not overwrite an untouched company profile', async () => {
  const app = profileSettings();
  app.state.pending = { strongKeepalive: true };
  await app.render().saveAll();
  assert.deepEqual(app.writes, [{ strongKeepalive: true }]);
});

test('a failed profile save keeps the draft and the unsaved close guard', async () => {
  const app = profileSettings(async () => { throw new Error('Could not write config'); });
  const draft = { name: 'Unsaved Bakery', profile: { ceo: 'Sam' } };
  app.render().editCompanyProfile(draft);
  await app.render().saveAll();
  assert.equal(app.state.draft, draft);
  assert.equal(app.render().dirty, true);
  assert.equal(app.state.note, 'Could not write config');
  assert.equal(app.state.busy, false);
  app.render().requestClose();
  assert.equal(app.state.confirms, 1);
  assert.equal(app.state.closed, 0);
});

test('finishing a save keeps a newer profile edit dirty and ready to save', async () => {
  let finish;
  const app = profileSettings(() => new Promise((resolve) => { finish = resolve; }));
  const first = { name: 'First edit', profile: { ceo: 'Sam' } };
  const next = { name: 'Second edit', profile: { ceo: 'Jo' } };
  app.render().editCompanyProfile(first);
  const saving = app.render().saveAll();
  app.render().editCompanyProfile(next);
  finish();
  await saving;
  assert.equal(app.writes[0].businessName, 'First edit');
  assert.equal(app.state.saved, first);
  assert.equal(app.state.draft, next);
  assert.equal(app.render().dirty, true);
  app.render().requestClose();
  assert.equal(app.state.confirms, 1);
  assert.equal(app.state.closed, 0);
});

// --- the two deliberate exceptions ------------------------------------------

test('API keys still save immediately: there is no staged value to hold', () => {
  // The broker is write-only — nothing can read a key back to diff it — so a
  // key cannot participate in a staged form.
  const engines = read('src/renderer/src/components/AiEnginesSettings.tsx');
  assert.match(engines, /saveKey\(/, 'the per-provider key save was removed');
  assert.match(MODAL, /saveOpenAiVoiceKey/, 'the voice key save was folded into saveAll');
});

test('Free Flow still saves immediately: it arms a global hotkey', () => {
  // Staging it would leave main's hotkey and the checkbox disagreeing until
  // someone pressed Save.
  assert.match(MODAL, /window\.cth\.freeflowSetConfig\(/, 'freeflow no longer persists on its own');
});

// --- A2: Connections tidying -------------------------------------------------

test('the section heading is defined once, not written out seventeen times', () => {
  assert.match(MODAL, /const sectionHead = \{/);
  // Design v2: the heading is a 10px semibold label (branding/DESIGN.md 4.2).
  const inline = MODAL.match(/fontFamily: 'var\(--cth-font-display\)', fontSize: 10, fontWeight: 600, lineHeight: '12px',/g) ?? [];
  assert.equal(inline.length, 1, `${inline.length} inline copies remain — only the const should define it`);
});

test('the divider between Connections sections is defined once too', () => {
  assert.match(MODAL, /const sectionRule = \{/);
  const inline = MODAL.match(/\{\{ height: 2, background: 'var\(--cth-ink-300\)' \}\}/g) ?? [];
  assert.equal(inline.length, 0, 'an inline divider survived the extraction');
});

test('no integration was removed from Connections', () => {
  // The founder was explicit: nothing is deleted from this tab.
  for (const key of ['settings.connections.slack', 'settings.connections.webhooks']) {
    assert.ok(MODAL.includes(key), `${key} vanished from the Connections tab`);
  }
  assert.match(MODAL, /slackStart|slackStop/, 'the Slack lifecycle controls are gone');
});
