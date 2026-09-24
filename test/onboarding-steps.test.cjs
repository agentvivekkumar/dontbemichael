'use strict';

/**
 * Onboarding step titles must count the steps the owner actually walks.
 *
 * The numbers ("STEP 2 OF 6") are typed by hand into translated strings, while
 * the real order lives in OnboardingWizard's progress dots. The two drifted
 * once already: a step was added in front and "Meet your office" was never
 * numbered, so every later title showed the wrong step, out of the wrong total.
 * This reads the order from the component and checks every locale against it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const wizard = fs.readFileSync(path.join(root, 'src/renderer/src/components/OnboardingWizard.tsx'), 'utf8');
const orderMatch = wizard.match(/const order: Step\[\] = \[([^\]]+)\]/);
const ORDER = orderMatch ? [...orderMatch[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : [];

const STEP_RE = {
  en: /^STEP (\d+) OF (\d+) · /,
  'zh-CN': /^第 (\d+) 步，共 (\d+) 步 · /,
  ar: /^الخطوة (\d+) من (\d+) · /
};

test('the wizard step order can be read from the component', () => {
  assert.ok(ORDER.length >= 2, 'could not find `const order: Step[]` in OnboardingWizard.tsx');
});

for (const [locale, re] of Object.entries(STEP_RE)) {
  test(`${locale}: every step title shows its real position out of the real total`, () => {
    const file = path.join(root, 'src/renderer/src/i18n/locales', `${locale}.json`);
    const titles = JSON.parse(fs.readFileSync(file, 'utf8')).onboarding.titles;
    ORDER.forEach((step, i) => {
      const title = titles[step];
      assert.equal(typeof title, 'string', `${locale}: no title for step "${step}"`);
      const m = title.match(re);
      assert.ok(m, `${locale}: "${step}" title has no step number: ${title}`);
      assert.equal(Number(m[1]), i + 1, `${locale}: "${step}" says step ${m[1]}, is step ${i + 1}`);
      assert.equal(Number(m[2]), ORDER.length, `${locale}: "${step}" says of ${m[2]}, there are ${ORDER.length}`);
    });
  });
}
