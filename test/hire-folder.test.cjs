'use strict';

/**
 * Hiring after setup (owner, 2026-09-25): the hire dialog has the same Role,
 * Role description and Work style fields as Edit Agent, and on a business
 * install a new team member's folder goes inside Michael's, named after the
 * role, so same-role hires share it. Michael's folder and the Office can't be a
 * team member's own folder.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const modal = read('src/renderer/src/components/AddAgentModal.tsx');
const wizard = read('src/renderer/src/components/OnboardingWizard.tsx');
const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));

test('the hire dialog asks for Role, Role description and Work style', () => {
  for (const key of ['role', 'roleDescription', 'roleHelp', 'workStyle', 'workStyleHelp']) {
    assert.match(modal, new RegExp(`tr\\('addAgent\\.${key}'\\)`), key);
    assert.ok(en.addAgent[key], `en has addAgent.${key}`);
  }
  assert.match(modal, /const description = joinAgentRole\(role, roleDescription\);/, 'stored as Role: description');
  assert.match(modal, /const split = splitAgentRole\(m\.description\);/, 'an imported hire fills both fields');
  assert.equal(en.addAgent.description, undefined, 'the old Description field is gone');
});

test('a new team member\'s folder defaults to Michael\'s folder, named after the role', () => {
  assert.match(modal, /const michaelFolder = parentFolder\(config\.officeFolder\);/);
  assert.match(modal, /const folderLabel = role\.trim\(\) \|\| name\.trim\(\);/, 'the role, or the name while no role is typed');
  assert.match(modal, /window\.cth\.foldersSuggest\(config\.businessName \?\? '', \[folderLabel\], michaelFolder\)/);
  assert.match(modal, /const setCwd = \(path: string\) => \{ setCwdAuto\(false\); setCwdRaw\(path\); \};/, 'any pick by the owner wins');
  assert.match(modal, /if \(michaelFolder && cwdAuto\) \{\s*const \[made\] = await window\.cth\.foldersEnsure\(\[cwd\]\)/, 'made on hire, never overwritten');
});

test('Michael\'s folder and the Office are never a team member\'s own folder', () => {
  assert.match(modal, /\[michaelFolder, config\.officeFolder\]\.some\(\(f\) => f && samePath\(f, cwd\)\)/);
  assert.match(wizard, /key !== OFFICE_KEY && \(same\(michaelFolderFor\(folderSuggestions, folderOverrides\)\) \|\| same\(folderSuggestions\?\.office\)\)/);
  assert.doesNotMatch(en.addAgent.errFolderShared, /[–—]/);
});
