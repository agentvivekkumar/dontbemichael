'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  testWhatsAppAccount,
  WhatsAppService,
  saveWhatsAppAccount,
  removeWhatsAppAccount,
  setAgentWhatsAppCapabilities
} = loadTs('src/main/whatsapp.ts');

test('testWhatsAppAccount: handles success and error responses from Meta Graph API', async () => {
  // 1. Success mock
  const mockFetchSuccess = async (url, opts) => {
    assert.equal(opts.method, 'GET');
    assert.match(opts.headers.Authorization, /^Bearer valid-token/);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: '1049582918',
        display_phone_number: '+1 (555) 987-6543',
        verified_name: 'Acme Support'
      })
    };
  };

  const res1 = await testWhatsAppAccount('1049582918', 'valid-token', mockFetchSuccess);
  assert.equal(res1.ok, true);
  if (res1.ok) {
    assert.equal(res1.displayPhoneNumber, '+1 (555) 987-6543');
    assert.equal(res1.verifiedName, 'Acme Support');
  }

  // 2. Auth error mock (expired token)
  const mockFetchAuthError = async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      error: { message: 'Invalid OAuth access token', code: 190 }
    })
  });

  const res2 = await testWhatsAppAccount('1049582918', 'expired-token', mockFetchAuthError);
  assert.equal(res2.ok, false);
  if (!res2.ok) {
    assert.equal(res2.kind, 'auth');
  }

  // 3. Validation
  const res3 = await testWhatsAppAccount('', '');
  assert.equal(res3.ok, false);
  if (!res3.ok) {
    assert.equal(res3.kind, 'bad-request');
  }
});

test('WhatsAppService: tool dispatch, search, read, propose, and send', async () => {
  let statusUpdated = false;
  const cfg = {
    whatsappAccounts: [
      { id: 'wa-support', phoneNumberId: '109988', displayPhoneNumber: '+15551111', label: 'Support', status: 'connected', createdAt: 1, updatedAt: 1 }
    ],
    agentCapabilities: {
      kelly: {
        whatsapp: { enabled: true, accounts: ['wa-support'], send: true, sending: 'send' }
      },
      pam: {
        whatsapp: { enabled: true, accounts: ['wa-support'], send: false, sending: 'approval' }
      }
    }
  };

  const mockFetchSend = async (url, opts) => {
    assert.equal(opts.method, 'POST');
    const body = JSON.parse(opts.body);
    assert.equal(body.messaging_product, 'whatsapp');
    assert.equal(body.to, '15559999');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        messages: [{ id: 'wamid.12345' }]
      })
    };
  };

  const service = new WhatsAppService({
    getSecret: (ref) => (ref === 'whatsapp:wa-support' ? 'meta-secret-token' : undefined),
    updateStatus: () => { statusUpdated = true; },
    getConfig: () => cfg,
    fetchFn: mockFetchSend
  });

  // Kelly lists accounts
  const listRes = await service.handleWhatsAppRequest('kelly', 'list_whatsapp_accounts', {});
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.accounts.length, 1);
  assert.equal(listRes.body.accounts[0].id, 'wa-support');
  assert.equal(listRes.body.accounts[0].sending, 'send');

  // Kelly sends message
  const sendRes = await service.handleWhatsAppRequest('kelly', 'send_whatsapp_message', {
    accountId: 'wa-support',
    to: '+1 (555) 9999',
    text: 'Hello from Kelly at Acme Support!'
  });
  assert.equal(sendRes.status, 200);
  assert.equal(sendRes.body.ok, true);
  assert.equal(sendRes.body.messageId, 'wamid.12345');

  // Search message in history
  const searchRes = await service.handleWhatsAppRequest('kelly', 'search_whatsapp_chats', {
    accountId: 'wa-support',
    query: 'Kelly'
  });
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.body.messages.length, 1);

  // Read message thread
  const readRes = await service.handleWhatsAppRequest('kelly', 'read_whatsapp_chat', {
    accountId: 'wa-support',
    contact: '+1 (555) 9999'
  });
  assert.equal(readRes.status, 200);
  assert.equal(readRes.body.messages.length, 1);

  // Pam proposes message (Send on approval)
  const propRes = await service.handleWhatsAppRequest('pam', 'propose_whatsapp_message', {
    accountId: 'wa-support',
    to: '+1 (555) 8888',
    text: 'Proposed response awaiting approval'
  });
  assert.equal(propRes.status, 200);
  assert.equal(propRes.body.ok, true);
  assert.match(propRes.body.proposalId, /^wa-prop-/);

  // Unauthorized agent
  const unauthRes = await service.handleWhatsAppRequest('dwight', 'send_whatsapp_message', {
    accountId: 'wa-support',
    to: '123',
    text: 'test'
  });
  assert.equal(unauthRes.status, 403);
});

test('WhatsApp admin: save, remove, and capability transfer between agents', async () => {
  let savedConfig = {
    whatsappAccounts: [],
    agentCapabilities: {}
  };
  const secrets = new Map();

  const admin = {
    getConfig: () => savedConfig,
    saveConfig: (patch) => {
      savedConfig = { ...savedConfig, ...patch };
    },
    setSecret: (ref, val) => {
      secrets.set(ref, val);
      return { ok: true };
    },
    deleteSecret: (ref) => {
      secrets.delete(ref);
      return true;
    },
    canStoreSecrets: () => true
  };

  const mockFetchSuccess = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: '109922',
      display_phone_number: '+1 (555) 333-4444'
    })
  });

  // 1. Save new account
  const saveRes = await saveWhatsAppAccount(
    admin,
    {
      phoneNumberId: '109922',
      label: 'Support WhatsApp',
      token: 'meta-secret-token'
    },
    mockFetchSuccess
  );

  assert.equal(saveRes.ok, true);
  if (saveRes.ok) {
    assert.equal(saveRes.record.phoneNumberId, '109922');
    assert.equal(saveRes.record.label, 'Support WhatsApp');
    assert.equal(savedConfig.whatsappAccounts.length, 1);
    assert.equal(secrets.get('whatsapp:wa-support-whatsapp'), 'meta-secret-token');
  }

  const accountId = saveRes.record.id;

  // 2. Assign to Kelly
  const setKelly = setAgentWhatsAppCapabilities(admin, 'kelly', {
    whatsapp: { enabled: true, accounts: [accountId], send: true, sending: 'send' }
  });
  assert.equal(setKelly.ok, true);
  assert.equal(setKelly.restartNeeded, true);
  assert.equal(savedConfig.agentCapabilities.kelly.whatsapp.enabled, true);

  // 3. Dwight tries to take it without move: true -> blocked
  const setDwightBlocked = setAgentWhatsAppCapabilities(admin, 'dwight', {
    whatsapp: { enabled: true, accounts: [accountId], send: false, sending: 'draft' }
  });
  assert.equal(setDwightBlocked.ok, false);
  assert.equal(setDwightBlocked.heldBy, 'kelly');

  // 4. Dwight takes it with move: true -> transferred
  const setDwightMoved = setAgentWhatsAppCapabilities(admin, 'dwight', {
    whatsapp: { enabled: true, accounts: [accountId], send: false, sending: 'draft' },
    move: true
  });
  assert.equal(setDwightMoved.ok, true);
  assert.equal(setDwightMoved.movedFrom, 'kelly');
  assert.equal(savedConfig.agentCapabilities.kelly.whatsapp.enabled, false);
  assert.equal(savedConfig.agentCapabilities.dwight.whatsapp.enabled, true);

  // 5. Remove account -> revoked from agents
  const removeRes = removeWhatsAppAccount(admin, accountId);
  assert.equal(removeRes.ok, true);
  assert.equal(savedConfig.whatsappAccounts.length, 0);
  assert.equal(savedConfig.agentCapabilities.dwight.whatsapp.enabled, false);
  assert.equal(secrets.has(`whatsapp:${accountId}`), false);
});

