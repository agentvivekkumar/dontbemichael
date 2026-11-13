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
  // Value: protects=the owner can open the email an ask is about (owner, 2026-11-05), now through the source check (ask-me-source-links.md); fails_when=an ask naming a thread or a reply passes with no email link, or one with a link or marked noEmail is flagged; why_new=the Will Cox card; seam=none
  assert.equal(R.askMissesSource(willCox, SINCE), true, 'the Will Cox card');
  const linked = { ...willCox, q: willCox.q.replace('on his thread', 'on [his thread](email:vikram-moblize-it/%3Cabc%40hubspot.com%3E)') };
  assert.equal(R.askMissesSource(linked, SINCE), false);
  assert.equal(R.askMissesSource({ ...willCox, noEmail: true }, SINCE), false, 'about email in general');
  assert.equal(R.askMissesSource({ ...willCox, askedAt: '2026-11-01T10:00:00Z' }, SINCE), false, 'an older ask keeps its look');
  assert.equal(R.askMissesSource({ q: '**Approve the price change for Northwind?**', askedAt: '2026-11-05T20:10:00Z' }, SINCE), false, 'no email named');
  // Ship review, 2026-11-05: what counts, and what must not nag every turn.
  const at = '2026-11-05T20:10:00Z';
  assert.equal(R.askMissesSource({ q: '**Approve the reply to Will Cox?** Pam sends it.', askedAt: at }, SINCE), true, 'a reply is about a message someone sent');
  assert.equal(R.askMissesSource({ q: '**Send the quote email to Northwind?**', askedAt: at }, SINCE), false, 'new outbound mail has no original');
  assert.equal(R.askMissesSource({ q: '**Approve the price change?** Oscar wrote the report.', askedAt: at }, SINCE), false, 'a bare "wrote" is not an email');
  assert.equal(R.askMissesSource({ q: '**Turn on Email on Pam\'s Access tab?**', askedAt: at }, SINCE), false, 'a setting');
  assert.equal(R.askMissesSource({ kind: 'foundation', q: 'Inbox triage ran without our brand voice; her email tone is unknown.', askedAt: at }, SINCE), false, 'a foundation question');
  assert.equal(R.askMissesSource({ q: '**Approve the reply?** (email: dana@x.com)', askedAt: at }, SINCE), true, 'an address is not a link');
});

test('the email link check reads possessive and verb forms, and leaves chat threads alone', () => {
  // Value: protects=the owner can open the email an ask is about, however Michael words it (TODOS, 2026-11-05); fails_when=a possessive, verb or "message X sent" form passes with no link, or a Slack thread or an email setting is flagged; why_new=ship review pass 2; seam=none
  const at = '2026-11-05T20:10:00Z';
  const ask = (q) => R.askMissesSource({ q, askedAt: at }, SINCE);
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
  const answering = (q, label) => R.askChangeSends({ q, askedAt: '2026-11-05T20:10:00Z', options: [{ label }] }, SINCE);
  assert.equal(answering('**Approve the reply to Dana?**', 'Approve with my changes'), true, 'approving a reply with changes sends them');
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
  const ask = (q) => R.askMissesSource({ q, askedAt: at }, SINCE);
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

test('re-review of #686: a look before the send, a wait until the look, and our own mail pass', () => {
  // Value: protects=the wider checks flag nothing main let pass (re-review at 255b88f1); fails_when=a look before the send reads as after it, "post" the noun sends, "won't go out until you show me again" reads as a denial, or our own outgoing mail, a time word, a pronoun or a passive "emailed" reads as an email someone sent; why_new=re-review of #686; seam=none
  const at = '2026-11-05T20:10:00Z';
  const ask = (q, parts) => R.askMissesSource({ q, askedAt: at, ...(parts ? { parts } : {}) }, SINCE);
  const opt = (label, q = 'x') => R.askChangeSends({ q, askedAt: at, options: [{ label }] }, SINCE);
  // 1. The order: only a look after a send that goes out is flagged.
  assert.equal(opt('Draft the post with my changes, then show me again'), false, 'post is a noun here');
  assert.equal(opt('Fix it, then show me again, then send with my changes'), false, 'the look comes first');
  assert.equal(opt('Make my edits, then show me again before it goes out with my changes'), false, 'the look comes first');
  assert.equal(opt('Send with my changes, then show me again'), true, 'still: it goes before the look');
  assert.equal(opt('Post it with my changes, then show me again'), true, 'post as a verb at the start');
  assert.equal(opt('Edit it and post with my changes, then show me again'), true, 'post as a verb after and');
  assert.equal(opt('Draft the post with my changes'), false, 'a draft sends nothing');
  // 2. A wait until the look is not a denial.
  assert.equal(opt("Send with my changes, but it won't go out until you show me again"), false);
  assert.equal(opt('Send with my changes, it will not go out before you show me again'), false);
  assert.equal(opt("Send with my changes, don't post till I review it"), false);
  assert.equal(opt("Send with my changes, won't go out unless you show me again"), false);
  assert.equal(opt("Send with my changes, it won't need to come back"), true, 'a denial with no wait in between');
  // 3. Our own outgoing mail is not an email someone sent.
  for (const q of [
    "**Approve this week's email newsletter?**", "**Send tomorrow's email reminders?**", "**Send Monday's email?**",
    "**Approve Pam's email draft?**", "**Approve the company's email footer?**", "**Update the team's email addresses?**",
    "**Check Pam's email campaign?**", "**Fix the shop's email template?**", "**Clean up our team's email list?**",
    '**Is the quote email already sent?**', '**Did the email we sent Dana bounce?**', '**Was the email I sent Dana read?**',
    '**Was the quote emailed in time?**', '**OK if the form is emailed back by Friday?**', '**Is it true the form was emailed back?**',
    "**It's email day: approve the batch?**"
  ]) assert.equal(ask(q), false, q);
  // Still an email someone sent.
  for (const q of [
    "**Answer Will's email?**", "**Answer O'Brien's email?**", "**Answer O’Brien’s message?**", '**Dana emailed us: reply?**',
    '**Approve the answer to the email Dana wrote?**', '**Dana sent us an email: answer it?**', '**The supplier emailed back. Approve the order?**'
  ]) assert.equal(ask(q), true, q);
  // Every setting word, and every word for who was emailed.
  for (const word of ['account', 'settings', 'access', 'tone', 'signature', 'address']) assert.equal(ask(`**Change Pam's email ${word}?**`), false, word);
  for (const who of ['us', 'me', 'you', 'the office', 'in', 'back']) assert.equal(ask(`**Dana emailed ${who}. Approve?**`), true, who);
});

test('re-review of #686, smaller items: a chat in another part, a bare approve, and every coming back phrase', () => {
  // Value: protects=a chat named in one part does not hide an email in another, a bare approve counts only on an ask about outgoing mail, and every alternation is reached; fails_when=a chat switch in one part silences the whole ask, "Approve with my changes" on an inside approval is flagged, or a coming back phrase stops counting; why_new=re-review of #686; seam=none
  const at = '2026-11-05T20:10:00Z';
  // The chat switch reads per question.
  const parts = [{ q: 'Pam flagged it in Slack. Is it urgent?', options: [{ label: 'Yes' }] }];
  assert.equal(R.askMissesSource({ q: "**Approve the reply to Will Cox's message?**", askedAt: at, parts }, SINCE), true, 'the chat is in another part');
  assert.equal(R.askMissesSource({ q: '**Approve the reply in the Slack thread?**', askedAt: at, parts }, SINCE), false, 'the chat is in the same part');
  // A bare approve with changes.
  const answer = (q, label, extra = {}) => R.askChangeSends({ q, askedAt: at, options: [{ label }], ...extra }, SINCE);
  assert.equal(answer('**Approve the new rota?**', 'Approve with my changes'), false, 'nothing leaves the office');
  assert.equal(answer('**Approve the new rota?**', 'Approve it with my changes'), false);
  assert.equal(answer('**Approve the quote for Northwind?**', 'Approve it with my changes'), true, 'a quote goes out');
  assert.equal(answer('**Approve the invoice?**', 'Approve with my changes'), true, 'an invoice goes out');
  assert.equal(R.askChangeSends({ q: '**Approve the reply to Will Cox?**', askedAt: at, parts: [{ q: 'Send it?', options: [{ label: 'Approve with my changes' }] }] }, SINCE), true, 'the ask sets what its parts are about');
  assert.equal(answer('x', 'Approve the invoice with my changes'), true, 'an invoice named in the label');
  // Every phrase for coming back, after a send and before one.
  const opt = (label) => answer('x', label);
  for (const back of ['show me again', 'show me it again', 'come back', 'comes back', 'for another look', 'for a look', 'review it']) {
    assert.equal(opt(`Change it, then ${back}`), false, `${back}: no send`);
    assert.equal(opt(`Send with my changes, then ${back}`), true, `${back}: after the send`);
    assert.equal(opt(`Change it, then ${back}, then send with my changes`), false, `${back}: before the send`);
  }
  assert.equal(opt('Send with my changes, after that show me again'), true, 'after that');
  assert.equal(opt("Send with my changes, it doesn't need to come back"), true, "doesn't");
  assert.equal(opt('Send with my changes, no need for another look'), true, 'no need for another look');
  // A send back is still a send, and comes back when the label says so.
  assert.equal(opt('Send it back to Pam with my edits'), true, 'the label does not say who Pam is');
  assert.equal(opt('Send it back to Pam with my edits, then show me again'), false);
});

test('re-review of #686 at d23b3cf9: post as a verb, a no before a wait, and a send not made yet', () => {
  // Value: protects=the three labels main flagged are flagged again, and the look asked for before anything goes out passes (re-review at d23b3cf9); fails_when=post partway into a label stops sending, "don't wait until I review it" stops being a denial, or a send after before, not or until reads as sent first; why_new=re-review of #686; seam=none
  const at = '2026-11-05T20:10:00Z';
  const opt = (label) => R.askChangeSends({ q: 'x', askedAt: at, options: [{ label }] }, SINCE);
  // 1. "post" sends unless a determiner makes it a noun.
  for (const label of ['Yes, post it with my changes', 'Please post it with my changes', 'OK to post with my edits', 'Approve, post with my changes',
    'Ready to post with my changes, then show me again']) assert.equal(opt(label), true, label);
  assert.equal(opt('Draft the post with my changes'), false, 'the post is a noun');
  assert.equal(opt('Postpone it with my changes'), false, 'postpone is not post');
  // 2. A no before a wait is a denial, unless a going out word sits between them.
  assert.equal(opt("Send with my changes, don't wait until I review it"), true);
  assert.equal(opt('Send now with my edits, no need to hold it till you show me again'), true);
  assert.equal(opt("Send with my changes, but it won't go out until you show me again"), false, 'still a wait');
  assert.equal(opt("Send with my changes, don't post till I review it"), false, 'still a wait');
  assert.equal(opt('Send with my changes, not before you show me again'), false, 'a bare not is no denial');
  // The comma ends the denial's words; "and" does not.
  assert.equal(opt('Send it with my changes without the discount line and show me again first'), true);
  // 3. A send not made yet leaves the look first.
  for (const label of ['Before sending, update it with my changes, then show me again', 'Before it goes out, redo it with my edits, then show me again',
    'Not ready to send: update it with my changes, then show me again']) assert.equal(opt(label), false, label);
  for (const label of ["Don't wait, send with my changes, then show me again", "Don't wait and send with my changes, then show me again"])
    assert.equal(opt(label), true, `${label}: the no is about the wait`);
});

test('re-review of #686 at d23b3cf9, smaller items: question words, a part that names its own thing, and a bounded scan', () => {
  // Value: protects=a bare approve counts only where something goes out, and a long label stays cheap; fails_when=a draft rota or a post-holiday schedule reads as outgoing, the top question speaks for a part that names its own thing, or a long label scans for each send word to its end; why_new=re-review of #686; seam=none
  const at = '2026-11-05T20:10:00Z';
  const answer = (q, label, parts) => R.askChangeSends({ q, askedAt: at, options: [{ label }], ...(parts ? { parts } : {}) }, SINCE);
  assert.equal(answer('**Approve the draft rota?**', 'Approve with my changes'), false);
  assert.equal(answer('**Approve the post-holiday schedule?**', 'Approve with my changes'), false);
  assert.equal(answer('**Approve the new post for LinkedIn?**', 'Approve with my changes'), true, 'a post goes out');
  const top = '**Approve the reply to Dana?**';
  assert.equal(R.askChangeSends({ q: top, askedAt: at, parts: [{ q: 'Approve the new rota?', options: [{ label: 'Approve with my changes' }] }] }, SINCE), false, 'the part names its own thing');
  assert.equal(R.askChangeSends({ q: top, askedAt: at, parts: [{ q: 'Send it?', options: [{ label: 'Approve with my changes' }] }] }, SINCE), true, 'the part names nothing');
  assert.equal(answer('x', `Send it ${'and '.repeat(80)}with my changes`), false, 'the changes are too far from the send');
  const t0 = process.hrtime.bigint();
  assert.equal(answer('x', `${'send it then '.repeat(20_000)}show me again`), false);
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 5000, 'a long label with many sends is cheap');
});

test('re-review of #686 at 653765d7: a no about waiting, a long denial, and the scan bound', () => {
  // Value: protects=a label that sends first and shows the owner afterwards is flagged however the wait is worded, and the scan bound is exact; fails_when=a no about waiting holds the send, a denial five or six words before the look slips past, the scan reaches further or less far than 300 characters, a plural or an accented name changes what a bare approve reads, or a send back of a named thing is flagged; why_new=re-review of #686 at 653765d7; seam=none
  const at = '2026-11-05T20:10:00Z';
  const answer = (q, label, parts) => R.askChangeSends({ q, askedAt: at, options: [{ label }], ...(parts ? { parts } : {}) }, SINCE);
  const opt = (label) => answer('x', label);
  // 1. A no about waiting is not about the send.
  for (const label of ["Don't wait to send it with my changes, then show me again", 'No need to wait to send it with my edits, then show me again',
    "Don't hesitate to send it with my changes, then show me again", 'Without delay send it with my changes, then show me again'])
    assert.equal(opt(label), true, label);
  // A no right before the send, or "not" with "yet" and "ready to", still holds it.
  for (const label of ["Don't send it yet, redo it with my changes, then show me again", "It won't go out: redo it with my edits, then show me again",
    'Without sending, update it with my changes, then show me again', 'Not yet sending: update it with my changes, then show me again',
    'Not yet ready to send: update it with my changes, then show me again']) assert.equal(opt(label), false, label);
  // 2. A denial up to six words before the look, still ending at a comma.
  assert.equal(opt("Send with my changes, I don't think I need you to review it"), true, 'five words between');
  assert.equal(opt("Send with my changes, I don't really think I need you to review it"), true, 'six words between');
  assert.equal(opt('Send it with my changes without the discount line, show me again first'), false, 'the comma still ends it');
  // The scan bound: "with my changes", or coming back, at most SEND_SCAN_CHARS (300) characters after the send.
  const gap = (n) => ` ${'a '.repeat((n - 2) / 2)} `;
  assert.equal(gap(300).length, 300);
  assert.equal(opt(`Send${gap(300)}with my changes`), true, '300 characters between');
  assert.equal(opt(`Send${gap(302)}with my changes`), false, '302 characters between');
  assert.equal(opt(`Send with my changes${gap(284)}then show me again`), true, 'coming back 300 characters after the send');
  assert.equal(opt(`Send with my changes${gap(286)}then show me again`), false, 'coming back 302 characters after the send');
  // Plurals, one word list, and a bare approve of the draft.
  assert.equal(opt('Approve the replies with my changes'), true, 'replies go out');
  assert.equal(opt('Approve the emails with my changes'), true, 'emails go out');
  assert.equal(answer('**Approve the draft rota?**', 'Approve the draft with my changes'), false, 'a draft rota stays in');
  assert.equal(answer('**Approve the draft reply to Dana?**', 'Approve the draft with my changes'), true, 'a draft reply goes out');
  assert.equal(answer('**Approve the replies to Dana and Kim?**', 'Approve with my changes'), true, 'a plural in the question');
  // An accented name names its own thing.
  assert.equal(answer('**Approve the reply to Dana?**', 'Yes', [{ q: "Approve José's rota?", options: [{ label: 'Approve with my changes' }] }]), false, "José's rota");
  // A send back of a named thing comes back when the label says so.
  assert.equal(opt('Send the reply back to Pam with my changes, then show me again'), false);
  // The message someone sent, with two words between.
  assert.equal(R.askMissesSource({ q: '**Accept the terms in the message the client sent?**', askedAt: at }, SINCE), true, 'the message the client sent');
  assert.equal(R.askMissesSource({ q: '**Was the email that was sent to Dana read?**', askedAt: at }, SINCE), false, 'a passive is ours');
  assert.equal(R.askMissesSource({ q: '**Did the email draft we sent bounce?**', askedAt: at }, SINCE), false, 'we sent it');
});

test('both reach Michael\'s tidy list each turn, with what to do', () => {
  // Value: protects=Michael is told until he fixes the card; fails_when=asksToTidy drops either check or its line; why_new=owner 2026-11-05; seam=none
  const card = { id: 'dwight-willcox-five-companies', title: 'HubSpot partner manager asks about five companies', status: 'blocked', assignee: 'dwight', humanQA: [willCox] };
  const stuck = R.asksToTidy([card], Infinity, SINCE);
  assert.deepEqual(stuck.map((c) => c.issue).sort(), ['change-sends', 'no-source']);
  const said = R.stuckCardsContext(stuck);
  assert.match(said, /ASKS AND REPORTS ABOUT SOMETHING OUTSIDE THE OFFICE WITH NO LINK TO IT\. [^\n]*Ask the team member who read it for its link/);
  assert.match(said, /CHANGE OPTIONS THAT SEND WITHOUT ANOTHER LOOK\. House rule 10/);
  assert.deepEqual(R.asksToTidy([card]), [], 'no start, no check');
});

test('members link the email in messages too, and Michael asks for a missing link', () => {
  // Value: protects=the two rule changes (owner, 2026-11-05); fails_when=either sentence is dropped; why_new=the Will Cox card; seam=source pins; no_claim=whether agents follow it (no eval)
  const hive = read('src/main/hive.ts');
  assert.ok(hive.includes('When a filing or a message to ${michael} is about an email you read (a reply to approve, what a sender asked), put that email\'s link from your mail read'));
  assert.ok(hive.includes('even when a teammate does the rest of the work'));
  assert.ok(hive.includes("when the report or filing you have lacks one, ask the team member who read it for it before the card goes on Ask me"), 'now through sources (ask-me-source-links.md)');
  assert.match(hive, /asksToTidy\(tasks, this\.askListSince\(\), this\.leftoversSince\(\)\)/);
});
