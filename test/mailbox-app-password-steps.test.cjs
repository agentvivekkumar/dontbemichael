'use strict';

/**
 * iCloud Mail, Yahoo and Zoho get the numbered step cards Google has in Add a
 * mailbox (TODOS.md, Step cards for iCloud, Yahoo and Zoho app passwords):
 * each step opens that service's own page, and the last one is the paste.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { APP_PASSWORD_STEPS } = loadTs('src/shared/mailboxes.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('each of the three services shows its own steps, each page on that service', () => {
  // Value: protects=one click lands on the right page of the right service, and the paste comes last; fails_when=a service loses its cards, a page drifts to another host, or Google gets these cards; why_new=new cards; seam=none; no_claim=the services keeping these addresses (hand check)
  assert.deepEqual(Object.keys(APP_PASSWORD_STEPS).sort(), ['icloud', 'yahoo', 'zoho']);
  assert.deepEqual(APP_PASSWORD_STEPS.icloud, ['https://account.apple.com', null]);
  assert.deepEqual(APP_PASSWORD_STEPS.yahoo, ['https://login.yahoo.com/account/security', null]);
  assert.deepEqual(APP_PASSWORD_STEPS.zoho, ['https://mail.zoho.com/zm/#settings/all/mailaccounts', 'https://accounts.zoho.com/home#security/app_password', null]);
});

test('every step has its words, a page step has its button, and no dashes', () => {
  // Value: protects=no card shows a raw key or a dash; fails_when=a step loses a string, or a string gains a dash; why_new=new strings; seam=none
  const steps = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).mailboxes.steps;
  for (const [provider, pages] of Object.entries(APP_PASSWORD_STEPS)) {
    pages.forEach((url, i) => {
      const keys = ['Title', 'Line', ...(url ? ['Open'] : [])].map((k) => `step${i + 1}${k}`);
      for (const k of keys) {
        assert.ok(steps[provider][k], `${provider} ${k}`);
        assert.doesNotMatch(steps[provider][k], /[–—]| - /, `${provider} ${k}`);
      }
    });
    assert.equal(Object.keys(steps[provider]).length, pages.length * 2 + pages.filter(Boolean).length, `${provider}: no extra strings`);
  }
});

test('the dialog shows the cards for these three, and the paragraph only for Other', () => {
  // Value: protects=the cards are on screen for each service and the old paragraph is gone for them; fails_when=the cards are unmounted or the paragraph comes back; why_new=new cards; seam=source pin; no_claim=the look (live check in the dev app)
  const dialog = read('src/renderer/src/components/AddMailboxDialog.tsx');
  assert.match(dialog, /\{APP_PASSWORD_STEPS\[provider\] && <AppPasswordSteps provider=\{provider\} pages=\{APP_PASSWORD_STEPS\[provider\]\} \/>\}/);
  assert.match(dialog, /void window\.cth\.openExternal\(url\)/);
  assert.match(dialog, /\{provider === 'other' && \(/);
  const help = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).mailboxes.help;
  assert.deepEqual(Object.keys(help), ['other']);
});
