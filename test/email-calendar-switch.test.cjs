'use strict';

/**
 * Settings → Connections → Email & Calendar, when OFF, must keep every agent
 * out of the owner's mail and calendar (owner, 2026-09-26). The switch only
 * ever controlled the app's own server, while agents reached the Claude
 * account connectors (mcp__claude_ai_Gmail__*, mcp__claude_ai_Google_Calendar__*)
 * regardless: Pam called Gmail thousands of times with the switch off. The
 * PreToolUse hook now refuses any mail or calendar tool while it is off.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { isEmailCalendarTool, emailCalendarAllowed } = loadTs('src/shared/mcpCatalog.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

test('mail and calendar tools are recognised, and look-alikes are not', () => {
  for (const name of [
    'mcp__claude_ai_Gmail__search_threads',
    'mcp__claude_ai_Gmail__send_message',
    'mcp__claude_ai_Google_Calendar__list_events',
    'mcp__munder-email-calendar__read',
    'mcp__claude_ai_Outlook__list_messages'
  ]) assert.ok(isEmailCalendarTool(name), name);
  for (const name of [
    'mcp__claude_ai_Mailchimp__list_campaigns',
    'mcp__claude_ai_Slack__post',
    'Read',
    'Bash',
    'mcp__munder-filesystem__read_file'
  ]) assert.ok(!isEmailCalendarTool(name), name);
});

test('the switch is off unless the owner turned it on', () => {
  assert.equal(emailCalendarAllowed(undefined), false);
  assert.equal(emailCalendarAllowed({}), false);
  assert.equal(emailCalendarAllowed({ 'email-calendar': { enabled: false } }), false);
  assert.equal(emailCalendarAllowed({ 'email-calendar': { enabled: true } }), true);
});

async function floor(t, cfg) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mail-switch-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const sent = [];
  const server = new HookServer(hive, () => ({ send: (c, p) => sent.push({ c, p }) }), () => ({ harnessHome: home, ...cfg }), undefined, undefined);
  const call = (tool_name, agent_id = 'pam') => server.handle({
    agent_id, session_id: 's1', hook_event_name: 'PreToolUse', tool_name, tool_input: {}, cwd: home
  });
  return { call, sent, server, home };
}

const denied = (r) => r && r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny';

test('with the switch off, an agent reading Gmail is refused through the hook', async (t) => {
  const f = await floor(t, {});
  const r = await f.call('mcp__claude_ai_Gmail__search_threads');
  assert.ok(denied(r));
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /through their Claude account/);
  assert.ok(denied(await f.call('mcp__claude_ai_Google_Calendar__list_events')));
  assert.ok(denied(await f.call('mcp__claude_ai_Gmail__search_threads', 'god')), 'Michael too');
  assert.ok(f.sent.some((s) => s.c === 'control:approvalRequest' && s.p.agentId === 'pam'), 'the floor hears about it');
});

test('with the switch on, every agent uses the Claude account Gmail and Calendar, no Capabilities needed (owner, 2026-09-26)', async (t) => {
  const on = await floor(t, { mcpDefaults: { 'email-calendar': { enabled: true } } });
  assert.ok(!denied(await on.call('mcp__claude_ai_Gmail__search_threads')));
  assert.ok(!denied(await on.call('mcp__claude_ai_Gmail__send_message')));
  assert.ok(!denied(await on.call('mcp__claude_ai_Gmail__search_threads', 'god')), 'Michael too');
  assert.ok(!denied(await on.call('mcp__claude_ai_Google_Calendar__list_events')));
  const off = await floor(t, {});
  assert.ok(!denied(await off.call('mcp__claude_ai_Mailchimp__list_campaigns')), 'other tools never change');
  assert.ok(denied(await off.call('mcp__claude_ai_Gmail__some_future_tool')), 'a tool added later under the prefix is gated (F-5)');
});

test('md-mail calls are checked against the named mailbox', async (t) => {
  const f = await floor(t, {
    mcpDefaults: { 'email-calendar': { enabled: true } },
    mailboxes: [{ id: 'sales', address: 'sales@x.com', provider: 'gmail', imap: { host: 'h', port: 993, secure: true }, smtp: { host: 'h', port: 465, secure: true }, status: 'connected', createdAt: 1, updatedAt: 1 }],
    agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['sales'], send: false } } }
  });
  const call = (tool, input) => f.server.handle({ agent_id: 'pam', session_id: 's1', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd: f.home });
  assert.ok(!denied(await call('mcp__md-mail__list_mailboxes', {})));
  assert.ok(!denied(await call('mcp__md-mail__search', { mailbox: 'sales' })));
  assert.ok(denied(await call('mcp__md-mail__search', { mailbox: 'ceo' })));
  assert.ok(denied(await call('mcp__md-mail__send', { mailbox: 'sales' })), 'Draft only');
});

test('the switch governs only the Claude account connector: md-mail mailboxes follow Capabilities alone', async (t) => {
  const f = await floor(t, {
    mailboxes: [{ id: 'sales', address: 'sales@x.com', provider: 'gmail', imap: { host: 'h', port: 993, secure: true }, smtp: { host: 'h', port: 465, secure: true }, status: 'connected', createdAt: 1, updatedAt: 1 }],
    agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['sales'], send: true } } }
  });
  const call = (tool, input) => f.server.handle({ agent_id: 'pam', session_id: 's1', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd: f.home });
  assert.ok(!denied(await call('mcp__md-mail__search', { mailbox: 'sales' })), 'switch off, added mailbox still works');
  assert.ok(denied(await call('mcp__claude_ai_Gmail__search_threads', {})), 'switch off, Claude account blocked');
});
