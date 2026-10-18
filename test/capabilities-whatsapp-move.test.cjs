'use strict';

/**
 * One agent per WhatsApp number, in the Capabilities tab.
 * Main refuses a held number unless move: true is passed;
 * this test verifies the tab prompts confirmation before moving, marks held numbers in the list,
 * and that all strings exist in every language without dashes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const { whatsAppHolder } = loadTs('src/shared/whatsapp.ts');

test('whatsAppHolder finds the agent with whatsapp on and that account picked, except the asker', () => {
  const caps = {
    pam: { whatsapp: { enabled: true, accounts: ['wa-sales'], send: true } },
    off: { whatsapp: { enabled: false, accounts: ['wa-ceo'], send: false } },
    none: {}
  };
  assert.equal(whatsAppHolder(caps, 'wa-sales'), 'pam');
  assert.equal(whatsAppHolder(caps, 'wa-sales', 'pam'), undefined, 'not a clash with herself');
  assert.equal(whatsAppHolder(caps, 'wa-ceo'), undefined, 'whatsapp off holds nothing');
  assert.equal(whatsAppHolder(caps, 'missing'), undefined);
  assert.equal(whatsAppHolder(undefined, 'wa-sales'), undefined);
});

test('the tab asks before moving a held whatsapp number and marks who holds each one', () => {
  const tab = read('src/renderer/src/components/CapabilitiesTab.tsx');
  assert.match(tab, /if\s*\(waHolderOf\(id\)\)\s*\{\s*setWaMoving\(id\);\s*return;\s*\}/, 'picking a held whatsapp number asks first');
  assert.match(tab, /if\s*\(!res\.ok\s*&&\s*res\.heldBy\s*&&\s*next\.accounts\[0\]\)\s*\{\s*setWaMoving\(next\.accounts\[0\]\);\s*return;\s*\}/, 'a race with another save asks too');
  assert.match(tab, /saveWhatsApp\(\{\s*\.\.\.waCap,\s*enabled:\s*true,\s*accounts:\s*\[waMoving\]\s*\},\s*true\)/, 'Move it confirms the move');
  assert.match(tab, /onClick=\{\(\) => setWaMoving\(null\)\}>\{t\('capabilities\.keepIt'\)\}/);
  assert.match(tab, /holder \? t\('capabilities\.heldBy', \{ name: nameOf\(holder\) \}\)/);
  assert.match(tab, /whatsAppHolder\(config\.agentCapabilities, id, agent\.id\)/);
});

test('the move whatsapp strings exist in every language, without dashes', () => {
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const c = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).capabilities;
    for (const k of ['moveWhatsApp', 'moveWhatsAppFree']) {
      assert.equal(typeof c[k], 'string', `${loc}: capabilities.${k}`);
      assert.doesNotMatch(c[k], /[–—]| - /, `${loc}: capabilities.${k} has a dash`);
    }
    for (const v of ['{{from}}', '{{number}}', '{{to}}']) assert.ok(c.moveWhatsApp.includes(v), `${loc}: moveWhatsApp names ${v}`);
  }
});
