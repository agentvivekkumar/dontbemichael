'use strict';

/**
 * A team member who needs a fact asks the teammate who has it, and goes to
 * Michael only when that teammate cannot help or someone has to do work
 * (owner, 2026-10-03: "Agents does not need to tell michael unless they cant
 * resolve those by finding the appropriate agent"). The base prompt already
 * says so (hive.ts, "act": "query"); a pack Work style must not undo it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { workStyleOffers } = loadTs('src/shared/workStyleUpdates.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const pack = (n) => JSON.parse(read(`resources/packs/${n}.json`));
const packs = fs.readdirSync(path.resolve(__dirname, '..', 'resources/packs')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

test('no Work style sends a question for a teammate through Michael', () => {
  // Value: protects=facts go peer to peer, so Michael is not a relay; fails_when=a pack says "tell Michael ... for IT Engineer" or "ask Michael for X from <role>"; why_new=Kelly's Work style relayed tech and security questions through Michael; seam=none
  for (const n of packs) {
    const p = pack(n);
    const roles = (p.agents || []).map((a) => a.role).filter(Boolean);
    for (const a of p.agents || []) {
      for (const sentence of (a.workStyle || '').split(/(?<=[.!?])\s+|\n/)) {
        if (!/\bMichael\b/.test(sentence) || !/\b(ask|asks|question|questions|problem|problems)\b/i.test(sentence)) continue;
        for (const role of roles) {
          if (role === a.role) continue;
          assert.ok(!new RegExp(`Michael[^.]*\\b(for|from) (the )?${role.replace(/[&]/g, '\\$&')}\\b`).test(sentence), `${n}/${a.id}: "${sentence}"`);
        }
      }
    }
  }
});

test('Support asks the IT Engineer and IT Security directly, Michael only as the fallback', () => {
  // Value: protects=the SaaS Support Work style names who to ask and when Michael comes in; fails_when=the direct ask or the fallback is lost; why_new=rewritten sentences; seam=none
  const kelly = pack('saas-consulting').agents.find((a) => a.id === 'kelly').workStyle;
  assert.match(kelly, /ask the IT Engineer directly, with what the customer did, saw and when[^.]*; tell Michael only when the IT Engineer cannot answer or a fix is needed\./);
  assert.match(kelly, /with IT Security directly before it goes in a reply, because security claims need verifying; tell Michael only when IT Security cannot confirm it\./);
  assert.match(pack('retail-shop').agents.find((a) => a.id === 'ryan').workStyle, /ask Inventory & Shipping directly for the slow sellers list/);
});

test('offices that hired them are offered the new text, and only in the packs that changed', () => {
  // Value: protects=existing installs get the fix on Ask me without a data patch, and an edited Kelly in another pack is not offered unchanged text; fails_when=no offer, or an offer reaches a card whose text did not change; why_new=pack scoped offers; seam=none
  const cards = new Map();
  for (const n of packs) for (const a of pack(n).agents || []) cards.set(`${n}/${a.id}`, a);
  const offered = (businessType, agents) => workStyleOffers(agents, cards, businessType, { name: 'Sunrise Bakery' }, {}).map((o) => [o.agentId, o.whyKey]);
  assert.deepEqual(offered('saas-consulting', [{ id: 'kelly', goal: 'old' }]), [['kelly', 'askMe.workStyleWhy.askTeammates']]);
  assert.deepEqual(offered('retail-shop', [{ id: 'ryan', goal: 'old' }]), [['ryan', 'askMe.workStyleWhy.askTeammates']]);
  assert.deepEqual(offered('home-services', [{ id: 'kelly', goal: 'mine' }]), [], 'her text there did not change');
  assert.deepEqual(offered('saas-consulting', [{ id: 'ryan', goal: 'mine' }]), []);
  assert.deepEqual(offered('home-services', [{ id: 'pam', goal: 'old' }]), [['pam', 'askMe.workStyleWhy.pamInboxZero']], 'unscoped offers still reach every pack');
  for (const loc of ['en', 'ar', 'zh-CN']) {
    assert.ok(JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).askMe.workStyleWhy.askTeammates, loc);
  }
});
