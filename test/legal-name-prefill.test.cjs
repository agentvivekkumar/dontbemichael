'use strict';

/**
 * Setup step 2's legal name starts from the step 1 business name (owner,
 * 2026-09-26), follows a rename on step 1, and never overwrites a legal name
 * the owner typed themselves.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { prefillLegalName } = loadTs('src/shared/companyProfile.ts');

test('an empty legal name takes the business name', () => {
  const r = prefillLegalName({}, '  MoblizeIT  ', undefined);
  assert.equal(r.profile.legalName, 'MoblizeIT');
  assert.equal(r.filled, 'MoblizeIT');
});

test('no business name leaves the field alone', () => {
  const p = {};
  const r = prefillLegalName(p, '   ', undefined);
  assert.equal(r.profile, p);
  assert.equal(r.profile.legalName, undefined);
});

test('a rename on step 1 carries over while the field is still ours', () => {
  const first = prefillLegalName({}, 'Moblize', undefined);
  const r = prefillLegalName(first.profile, 'MoblizeIT', first.filled);
  assert.equal(r.profile.legalName, 'MoblizeIT');
});

test("the owner's own legal name is never overwritten", () => {
  const first = prefillLegalName({}, 'MoblizeIT', undefined);
  const typed = { ...first.profile, legalName: 'MoblizeIT LLC' };
  const r = prefillLegalName(typed, 'Moblize Inc', first.filled);
  assert.equal(r.profile.legalName, 'MoblizeIT LLC');
  assert.equal(r.filled, first.filled);
});

test('a legal name brought back from an earlier setup is kept', () => {
  const r = prefillLegalName({ legalName: 'Acme Holdings LLC' }, 'Acme', undefined);
  assert.equal(r.profile.legalName, 'Acme Holdings LLC');
});

test('the wizard runs the prefill when step 2 opens', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/renderer/src/components/OnboardingWizard.tsx'), 'utf8');
  assert.match(src, /step !== 'details'\) return;\s*const next = prefillLegalName\(profile, businessName/);
});
