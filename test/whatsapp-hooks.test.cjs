'use strict';

/**
 * Hook-level test coverage for WhatsApp Business (md-whatsapp).
 *
 * Verifies Reviewer Finding #1 & #5b:
 * 1. connectorAccess recognizes md-whatsapp as the app's own MCP server (kind: 'app'),
 *    so calls are NOT refused as unknown third-party connectors.
 * 2. HookServer PreToolUse dispatch routes md-whatsapp tool calls to the WhatsApp gate:
 *    - Agents with capability are allowed.
 *    - Agents without capability or breaking mode rules are refused with the 'whatsapp' gate
 *      (never 'mail' and never 'connector').
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] ??= {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { Notification: class { static isSupported() { return false; } } }
};

const { connectorAccess, mcpTarget, APP_MCP_SERVERS, isAppMcpServer } = loadTs('src/shared/claudeConnectors.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

test('claudeConnectors: recognizes md-whatsapp as app server and permits tool access', () => {
  assert.equal(isAppMcpServer('md-whatsapp'), true);
  assert.equal(isAppMcpServer('md-mail'), true);
  assert.equal(isAppMcpServer('unknown-server'), false);

  const cfg = {
    whatsappAccounts: [
      { id: 'wa-main', phoneNumberId: '101', displayPhoneNumber: '+15550000', label: 'Main', status: 'connected', createdAt: 1, updatedAt: 1 }
    ],
    agentCapabilities: {
      kelly: { whatsapp: { enabled: true, accounts: ['wa-main'], send: true, sending: 'send' } }
    }
  };

  // 1. Tool call targets
  assert.equal(mcpTarget(cfg, 'mcp__md-whatsapp__list_whatsapp_accounts', {}).kind, 'app');
  assert.equal(mcpTarget(cfg, 'mcp__md-whatsapp__send_whatsapp_message', {}).kind, 'app');
  assert.equal(mcpTarget(cfg, 'mcp__md-whatsapp__propose_whatsapp_message', {}).kind, 'app');
  assert.equal(mcpTarget(cfg, 'mcp__md-whatsapp__read_whatsapp_chat', {}).kind, 'app');

  // 2. connectorAccess allows md-whatsapp tool calls through to the capability gate
  const listAcc = connectorAccess(cfg, 'kelly', 'mcp__md-whatsapp__list_whatsapp_accounts', {}, false);
  assert.equal(listAcc.ok, true);

  const sendAcc = connectorAccess(cfg, 'kelly', 'mcp__md-whatsapp__send_whatsapp_message', { accountId: 'wa-main', to: '1555', text: 'hi' }, false);
  assert.equal(sendAcc.ok, true);

  // 3. Resource calls to md-whatsapp are refused (app servers have tools, not resource URIs)
  const resAcc = connectorAccess(cfg, 'kelly', 'ReadMcpResourceTool', { server: 'md-whatsapp', uri: 'whatsapp://chat' }, false);
  assert.equal(resAcc.ok, false);
  assert.match(resAcc.reason, /own WhatsApp server has no resources/);

  // 4. Calls without an agent are refused
  const noAgent = connectorAccess(cfg, undefined, 'mcp__md-whatsapp__send_whatsapp_message', {}, false);
  assert.equal(noAgent.ok, false);
  assert.match(noAgent.reason, /only for the team/);
});

test('HookServer: PreToolUse dispatch enforces WhatsApp gate and logs under whatsapp category', () => {
  const cfg = {
    whatsappAccounts: [
      { id: 'wa-main', phoneNumberId: '101', displayPhoneNumber: '+15550000', label: 'Main', status: 'connected', createdAt: 1, updatedAt: 1 }
    ],
    agentCapabilities: {
      kelly: { whatsapp: { enabled: true, accounts: ['wa-main'], send: true, sending: 'send' } },
      pam: { whatsapp: { enabled: true, accounts: ['wa-main'], send: false, sending: 'approval' } }
    }
  };

  const refusals = [];
  const hive = {
    sockPath: () => null,
    appendLog: () => {},
    hookTokenOwner: (tok) => tok,
    researchName: () => 'Research'
  };

  const server = new HookServer(hive, () => null, () => cfg);
  server.onRefused = (agentId, gate) => {
    refusals.push({ agentId, gate });
  };

  // Case 1: Kelly (enabled, send mode) calls send_whatsapp_message -> Allowed
  const kellySend = server.handle({
    hook_event_name: 'PreToolUse',
    agent_id: 'kelly',
    tool_name: 'mcp__md-whatsapp__send_whatsapp_message',
    tool_input: { accountId: 'wa-main', to: '+15551234567', text: 'Hello' }
  });
  assert.deepEqual(kellySend, {});
  assert.equal(refusals.length, 0);

  // Case 2: Dwight (no whatsapp capability) calls send_whatsapp_message -> Denied with 'whatsapp' gate
  const dwightSend = server.handle({
    hook_event_name: 'PreToolUse',
    agent_id: 'dwight',
    tool_name: 'mcp__md-whatsapp__send_whatsapp_message',
    tool_input: { accountId: 'wa-main', to: '+15551234567', text: 'Hello' }
  });
  assert.equal(dwightSend.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(dwightSend.hookSpecificOutput?.permissionDecisionReason, /Capabilities/);
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].agentId, 'dwight');
  assert.equal(refusals[0].gate, 'whatsapp'); // Must NOT be 'mail' or 'connector'

  // Case 3: Pam (approval mode) calls send directly without proposal -> Denied with 'whatsapp' gate
  const pamSend = server.handle({
    hook_event_name: 'PreToolUse',
    agent_id: 'pam',
    tool_name: 'mcp__md-whatsapp__send_whatsapp_message',
    tool_input: { accountId: 'wa-main', to: '+15551234567', text: 'Hello' }
  });
  assert.equal(pamSend.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(pamSend.hookSpecificOutput?.permissionDecisionReason, /approval/);
  assert.equal(refusals.length, 2);
  assert.equal(refusals[1].agentId, 'pam');
  assert.equal(refusals[1].gate, 'whatsapp');

  // Case 4: Pam calls propose_whatsapp_message -> Allowed
  const pamPropose = server.handle({
    hook_event_name: 'PreToolUse',
    agent_id: 'pam',
    tool_name: 'mcp__md-whatsapp__propose_whatsapp_message',
    tool_input: { accountId: 'wa-main', to: '+15551234567', text: 'Proposed message' }
  });
  assert.deepEqual(pamPropose, {});
  assert.equal(refusals.length, 2); // No new refusal
});
