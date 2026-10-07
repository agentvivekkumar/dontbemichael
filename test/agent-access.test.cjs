'use strict';

/**
 * 2026-10-02: Ryan's profile said he "Uses your website, Mailchimp, Instagram /
 * Facebook". That was his pack card's suggested connections, which no agent is
 * ever given. The "Uses" row now lists only what the Access tab grants, by the
 * same rules the mail tools, the spawn and the hook apply (src/shared/agentAccess.ts).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { agentAccessSummary } = loadTs('src/shared/agentAccess.ts');

const list = [
  { key: 'Canva', url: 'u1', status: 'connected' },
  { key: 'Gmail', url: 'u2', status: 'connected' },
  { key: 'Intuit QuickBooks', url: 'u3', status: 'connected' }
];
const mailbox = { id: 'hello', address: 'hello@example.com', provider: 'other', imap: {}, smtp: {} };

test('a marketing hire with nothing granted uses nothing, whatever its card suggests', () => {
  // Value: protects=the profile never claims a tool the agent cannot reach; fails_when=the row falls back to the card's connections or counts a connector the agent was not given; why_new=the row read the pack card before; seam=none
  const cfg = { claudeConnectors: { list }, connectorsOn: { Canva: true, Gmail: true }, quickbooksClaude: true, mailboxes: [mailbox], agentCapabilities: {} };
  assert.deepEqual(agentAccessSummary(cfg, 'ryan', false), []);
});

test('only real grants count: the mailbox still in Settings, connectors on and given, QuickBooks with its level', () => {
  // Value: protects=each "Uses" entry matches what the agent can actually call; fails_when=a granted connector the owner turned off still shows, a removed mailbox shows, or QuickBooks loses its level or role default; why_new=new summary; seam=none
  const cfg = {
    claudeConnectors: { list },
    connectorsOn: { Canva: true, Gmail: false },
    quickbooksClaude: true,
    mailboxes: [mailbox],
    agentCapabilities: {
      ryan: { email: { enabled: true, mailboxes: ['hello'], send: false }, connectors: ['Canva', 'Gmail'] },
      gone: { email: { enabled: true, mailboxes: ['removed'], send: true } },
      oscar: {}
    }
  };
  assert.deepEqual(agentAccessSummary(cfg, 'ryan', false), [
    { kind: 'mailbox', address: 'hello@example.com', sending: 'draft' },
    { kind: 'connector', key: 'Canva' }
  ], 'Gmail is granted but turned off in Settings, so it does not count');
  assert.deepEqual(agentAccessSummary(cfg, 'gone', false), [], 'a mailbox removed in Settings is not usable');
  assert.deepEqual(agentAccessSummary(cfg, 'oscar', true), [{ kind: 'quickbooks', changes: false }], 'the books role default is Read only');
  assert.deepEqual(agentAccessSummary({ ...cfg, quickbooksClaude: false }, 'oscar', true), [], 'QuickBooks off for the office');
});

test('the profile reads real grants, not the pack card\'s suggested connections', () => {
  // Value: protects=the Ryan report stays fixed; fails_when=ProfileTab goes back to card.connections; why_new=the summary test cannot see which source the row uses; seam=none
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/components/ProfileTab.tsx'), 'utf8');
  assert.doesNotMatch(src, /card\?\.connections/);
  assert.match(src, /agentAccessSummary\(config, agent\.id, booksDefault === true\)/);
});

test('the profile has no "First job": template text, never a real job or whether it ran (owner, 2026-10-02)', () => {
  // Value: protects=the profile states only true, current facts; fails_when=the card's firstAction comes back as a fact; why_new=nothing checked the row; seam=none
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/components/ProfileTab.tsx'), 'utf8');
  assert.doesNotMatch(src, /firstAction|profile\.firstJob/);
});
