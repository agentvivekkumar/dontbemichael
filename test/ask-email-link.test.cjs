'use strict';

/**
 * An ask about an email carries a link to it, and a change option never sends
 * unseen (owner, 2026-11-05). The Will Cox card asked the owner to approve a
 * reply "on his thread" with no link to Will's email: Pam read it and told
 * Michael in a message, the link rule covered only filings, and Dwight and
 * Michael built on her words. The same card offered "Send with my changes",
 * which house rule 10 forbids. Now the rules cover messages, Michael asks for
 * a missing link, and the app lists both on his tidy list until fixed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const R = loadTs('src/shared/ownerRequests.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const SINCE = Date.parse('2026-11-05T19:00:00Z');
// The card as Michael wrote it on 5 Nov.
const willCox = {
  q: '**Approve the reply to Will Cox saying we have no past or current relationship with the five companies?** HubSpot shows none was ever a customer. The draft goes from your mailbox on his thread, and Pam sends it once you approve.',
  askedAt: '2026-11-05T20:10:00Z', raisedBy: 'dwight',
  parts: [
    { q: 'Do you have any tie to these five outside HubSpot?', options: [{ label: 'No, none' }, { label: 'Yes', note: 'Which company, and what tie?' }] },
    { q: 'Send the reply?', options: [{ label: 'Approve, Pam sends it', recommended: true }, { label: 'Send with my changes', note: 'What should change?' }] }
  ]
};

test('an ask about an email with no link to it is flagged until the link is there', () => {
  // Value: protects=the owner can open the email an ask is about (owner, 2026-11-05); fails_when=an ask naming a thread or a reply passes with no email link, or one with a link or marked noEmail is flagged; why_new=the Will Cox card; seam=none
  assert.equal(R.askMissesEmailLink(willCox, SINCE), true, 'the Will Cox card');
  const linked = { ...willCox, q: willCox.q.replace('on his thread', 'on [his thread](email:vikram-moblize-it/%3Cabc%40hubspot.com%3E)') };
  assert.equal(R.askMissesEmailLink(linked, SINCE), false);
  assert.equal(R.askMissesEmailLink({ ...willCox, noEmail: true }, SINCE), false, 'about email in general');
  assert.equal(R.askMissesEmailLink({ ...willCox, askedAt: '2026-11-01T10:00:00Z' }, SINCE), false, 'an older ask keeps its look');
  assert.equal(R.askMissesEmailLink({ q: '**Approve the price change for Northwind?**', askedAt: '2026-11-05T20:10:00Z' }, SINCE), false, 'no email named');
  // Ship review, 2026-11-05: what counts, and what must not nag every turn.
  const at = '2026-11-05T20:10:00Z';
  assert.equal(R.askMissesEmailLink({ q: '**Approve the reply to Will Cox?** Pam sends it.', askedAt: at }, SINCE), true, 'a reply is about a message someone sent');
  assert.equal(R.askMissesEmailLink({ q: '**Send the quote email to Northwind?**', askedAt: at }, SINCE), false, 'new outbound mail has no original');
  assert.equal(R.askMissesEmailLink({ q: '**Approve the price change?** Oscar wrote the report.', askedAt: at }, SINCE), false, 'a bare "wrote" is not an email');
  assert.equal(R.askMissesEmailLink({ q: '**Turn on Email on Pam\'s Access tab?**', askedAt: at }, SINCE), false, 'a setting');
  assert.equal(R.askMissesEmailLink({ kind: 'foundation', q: 'Inbox triage ran without our brand voice; her email tone is unknown.', askedAt: at }, SINCE), false, 'a foundation question');
  assert.equal(R.askMissesEmailLink({ q: '**Approve the reply?** (email: dana@x.com)', askedAt: at }, SINCE), true, 'an address is not a link');
});

test('the email link check reads possessive and verb forms, and leaves chat threads alone', () => {
  // Value: protects=the owner can open the email an ask is about, however Michael words it (TODOS, 2026-11-05); fails_when=a possessive, verb or "message X sent" form passes with no link, or a Slack thread or an email setting is flagged; why_new=ship review pass 2; seam=none
  const at = '2026-11-05T20:10:00Z';
  const ask = (q) => R.askMissesEmailLink({ q, askedAt: at }, SINCE);
  assert.equal(ask("**Approve our answer to Will's email?**"), true, 'a possessive');
  assert.equal(ask('**Approve our answer to Will’s email?**'), true, 'a possessive with a curly quote');
  assert.equal(ask("**OK to offer the client's message a discount?**"), true, 'a possessive message');
  assert.equal(ask('**Dana emailed us about the late order. Refund her?**'), true, 'a verb form');
  assert.equal(ask('**Accept the terms in the message Will sent?**'), true, 'the message someone sent');
  assert.equal(ask('**Is the email Dana wrote a complaint?**'), true, 'the email someone wrote');
  assert.equal(ask("**Update Pam's email address to the new domain?**"), false, 'an address is a setting');
  assert.equal(ask("**Change Pam's email signature?**"), false, 'a signature is a setting');
  assert.equal(ask('**Answer Kim in the Slack thread about the rota?**'), false, 'a Slack thread has no email');
  assert.equal(ask('**Approve the reply in the chat with the supplier?**'), false, 'a chat reply has no email');
  assert.equal(ask('**Approve the reply to Kim? She raised it in Slack and in her email.**'), true, 'a chat and an email still needs the link');
  assert.equal(ask("**Answer Will's email?** [Will Cox, 5 Nov](email:vikram-moblize-it/%3Cabc%40hubspot.com%3E)"), false, 'linked');
});

test('a change option that sends without another look is flagged; one that comes back is not', () => {
  // Value: protects=house rule 10 on live cards (a changed version comes back first); fails_when=an option like Send with my changes passes, or Change it, show me again is flagged; why_new=the Will Cox card; seam=none
  assert.equal(R.askChangeSends(willCox, SINCE), true);
  const fixed = { ...willCox, parts: [willCox.parts[0], { q: 'Send the reply?', options: [{ label: 'Approve, Pam sends it' }, { label: 'Change it, show me again', note: 'What should change?' }] }] };
  assert.equal(R.askChangeSends(fixed, SINCE), false);
  assert.equal(R.askChangeSends({ q: 'x', askedAt: '2026-11-05T20:10:00Z', options: [{ label: 'Post it with your edits' }] }, SINCE), true);
  // Ship review, 2026-11-05: only an option that sends, and only when it does not come back.
  const opt = (label) => R.askChangeSends({ q: 'x', askedAt: '2026-11-05T20:10:00Z', options: [{ label }] }, SINCE);
  assert.equal(opt('Send it with changes'), true);
  assert.equal(opt('Edit it and send'), true);
  assert.equal(opt("Send with my changes, don't show me again"), true, 'an aside about showing does not excuse it');
  assert.equal(opt('Go ahead with the changes'), false, 'an inside approval sends nothing');
  assert.equal(opt('Preview with my changes'), false);
});

test('the change option check reads approve and send then show, and a negation only before showing', () => {
  // Value: protects=house rule 10 for more wordings (TODOS, 2026-11-05); fails_when=Approve with my changes or Send then show me again passes, or a compliant label with an unrelated "without" is flagged; why_new=ship review pass 2; seam=none
  const opt = (label) => R.askChangeSends({ q: 'x', askedAt: '2026-11-05T20:10:00Z', options: [{ label }] }, SINCE);
  assert.equal(opt('Approve with my changes'), true, 'approving with changes sends them');
  assert.equal(opt('Send with my changes, then show me again'), true, 'it goes before the owner sees it');
  assert.equal(opt('Send with my changes and afterwards show me again'), true);
  assert.equal(opt('Send with my changes, no need to show me again'), true, 'denied just before');
  assert.equal(opt("Send with my changes, I don't need to review it"), true, 'denied two words before');
  assert.equal(opt('Send it with my changes without the discount line, show me again first'), false, 'the without is about the change');
  assert.equal(opt('Change it, show me again'), false, 'the canonical wording');
  assert.equal(opt('Approve, Pam sends it'), false, 'no changes');
});

test('review of #686: what main caught still counts, and the wordings the rules allow pass', () => {
  // Value: protects=the wider checks catch no less than main and flag nothing the rules allow; fails_when=a plain "teams" or "chat" switches the email check off, a long denial slips past, or an own draft, "let's", a helper verb, a note, a send back to a member or an inside approval is flagged; why_new=review of #686; seam=none
  const at = '2026-11-05T20:10:00Z';
  const ask = (q) => R.askMissesEmailLink({ q, askedAt: at }, SINCE);
  const opt = (label) => R.askChangeSends({ q: 'x', askedAt: at, options: [{ label }] }, SINCE);
  // 1. Caught on main, and still caught.
  assert.equal(ask('**Approve the reply to Dana?** Both teams signed off.'), true, 'teams is an ordinary word');
  assert.equal(ask('**Approve the reply to Will Cox?** He asked for a quick chat Friday.'), true, 'a quick chat is not a chat thread');
  assert.equal(opt("Send with my changes, I don't need it to come back"), true, 'a denial three words before');
  // 2. Allowed by the rules above, so not flagged.
  assert.equal(ask("**Approve Pam's email to Northwind?**"), false, 'our own draft going out');
  assert.equal(ask("**Let's email Northwind the quote?**"), false, "let's is not a possessive");
  assert.equal(ask("**Let's message the client?**"), false);
  assert.equal(ask('**Should the quote email be sent today?**'), false, 'a helper verb is not a sender');
  assert.equal(ask('**See the note Oscar wrote?**'), false, 'a note is not an email');
  assert.equal(opt('Send it back to Pam with my edits, then show me again'), false, 'a send back to a member leaves nothing');
  // Smaller items.
  assert.equal(opt('Send with my changes, I don’t need to review it'), true, 'a curly apostrophe');
  assert.equal(opt("Send with my changes, won't need to show me again"), true, "won't");
  assert.equal(opt('Send with my changes, no need for you to show me again'), true, 'no need for you to');
  assert.equal(opt('Approve the rota with my changes'), false, 'an inside approval sends nothing');
  assert.equal(opt('Approve the reply with my changes'), true, 'a reply goes out');
  for (const word of ['login', 'password', 'connector']) {
    assert.equal(ask(`**Reset Pam's email ${word}?**`), false, `${word} is a setting`);
  }
  assert.equal(ask("**Answer José's email?**"), true, 'an accented name');
  assert.equal(ask("**Answer James' email?**"), true, 'a name ending in s');
});

test('both reach Michael\'s tidy list each turn, with what to do', () => {
  // Value: protects=Michael is told until he fixes the card; fails_when=asksToTidy drops either check or its line; why_new=owner 2026-11-05; seam=none
  const card = { id: 'dwight-willcox-five-companies', title: 'HubSpot partner manager asks about five companies', status: 'blocked', assignee: 'dwight', humanQA: [willCox] };
  const stuck = R.asksToTidy([card], Infinity, SINCE);
  assert.deepEqual(stuck.map((c) => c.issue).sort(), ['change-sends', 'no-email-link']);
  const said = R.stuckCardsContext(stuck);
  assert.match(said, /ASKS ABOUT AN EMAIL WITH NO LINK TO IT\. [^\n]*Ask the team member who read that email for its link/);
  assert.match(said, /CHANGE OPTIONS THAT SEND WITHOUT ANOTHER LOOK\. House rule 10/);
  assert.deepEqual(R.asksToTidy([card]), [], 'no start, no check');
});

test('members link the email in messages too, and Michael asks for a missing link', () => {
  // Value: protects=the two rule changes (owner, 2026-11-05); fails_when=either sentence is dropped; why_new=the Will Cox card; seam=source pins; no_claim=whether agents follow it (no eval)
  const hive = read('src/main/hive.ts');
  assert.ok(hive.includes('When a filing or a message to ${michael} is about an email you read (a reply to approve, what a sender asked), put that email\'s link from your mail read'));
  assert.ok(hive.includes('even when a teammate does the rest of the work'));
  assert.ok(hive.includes("when the report or filing you have lacks it, ask the team member who read the email for it before the ask goes on Ask me"));
  assert.match(hive, /asksToTidy\(tasks, this\.askListSince\(\), this\.leftoversSince\(\)\)/);
});
