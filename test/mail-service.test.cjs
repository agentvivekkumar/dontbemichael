'use strict';

/**
 * Multi-mailbox (docs/designs/multi-mailbox.md): the access rule and the mail
 * service against an injected fake IMAP/SMTP client (eng review E4, unit part).
 * The protocol-level half runs against local servers in mail-integration.test.cjs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { mailAccess, agentMailboxes, mailToolsJustAttached, mailboxIdFor, isMicrosoftAddress } = loadTs('src/shared/mailboxes.ts');
const { MailService, handleMailRequest, classifyMailError, setAgentCapabilities } = loadTs('src/main/mail.ts');

const server = { host: 'h', port: 993, secure: true };
const box = (id, address, provider = 'gmail') => ({ id, address, provider, imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 });

function cfg(over = {}) {
  return {
    mcpDefaults: { 'email-calendar': { enabled: true } },
    mailboxes: [box('sales', 'sales@x.com'), box('ceo', 'ceo@x.com', 'icloud')],
    agentCapabilities: {
      dwight: { email: { enabled: true, mailboxes: ['sales'], send: true } },
      pam: { email: { enabled: true, mailboxes: ['ceo'], send: false } }
    },
    ...over
  };
}

const raw = (from, subject, body, id) => Buffer.from(`From: ${from}\r\nTo: sales@x.com\r\nSubject: ${subject}\r\nMessage-ID: <${id}@x.com>\r\nDate: Fri, 25 Sep 2026 10:00:00 +0000\r\n\r\n${body}\r\n`);

function fakeImap(state) {
  let folder = 'INBOX';
  return {
    usable: true,
    async connect() { state.connects = (state.connects ?? 0) + 1; if (state.failConnect) { const e = state.failConnect; state.failConnect = state.failConnectOnce ? null : e; throw e; } },
    async logout() {},
    async list() { return [{ path: 'INBOX' }, { path: 'Drafts', specialUse: '\\Drafts' }, { path: 'Sent', specialUse: '\\Sent' }]; },
    async getMailboxLock(p) { folder = p; return { release() {} }; },
    async search(q) {
      if (q.header) return state.sentHit ? [1] : [];
      return state.folders[folder].filter((m) => !q.from || m.from.includes(q.from)).map((m) => m.uid);
    },
    async *fetch(uids) { for (const m of state.folders[folder]) if (uids.includes(m.uid)) yield { uid: m.uid, envelope: { from: [{ address: m.from }], subject: m.subject, date: new Date('2026-09-25') }, flags: new Set(m.seen ? ['\\Seen'] : []) }; },
    async fetchOne(uid) { const m = state.folders[folder].find((x) => String(x.uid) === String(uid)); return m ? { source: m.source } : false; },
    async append(p, content) { state.folders[p].push({ uid: 100 + state.folders[p].length, from: '', subject: '', source: content }); }
  };
}

function setup(over = {}) {
  const state = {
    folders: {
      INBOX: [
        { uid: 1, from: 'acme@buyer.com', subject: 'Quote please', source: raw('acme@buyer.com', 'Quote please', 'Can you quote 40 units?', 'm1') },
        { uid: 2, from: 'bob@other.com', subject: 'Hello', source: raw('bob@other.com', 'Hello', 'x'.repeat(60_000), 'm2'), seen: true }
      ],
      Drafts: [], Sent: []
    },
    sends: [], statuses: []
  };
  const config = cfg(over.config);
  const deps = {
    getConfig: () => config,
    getPassword: (id) => (id === 'sales' || id === 'ceo' ? 'app-pass' : undefined),
    markStatus: (id, status, reason) => state.statuses.push({ id, status, reason }),
    createImap: () => fakeImap(state),
    createSmtp: () => ({ async sendMail(m) { if (state.smtpError) throw state.smtpError; state.sends.push(m); return { messageId: m.messageId }; }, async verify() {}, close() {} })
  };
  const svc = new MailService(deps);
  const call = (agent, op, body) => handleMailRequest(svc, deps, agent, op, body);
  return { state, svc, call, config };
}

test('mailAccess: the one rule, in order', () => {
  const c = cfg();
  // The Claude account switch does not touch added mailboxes (owner, 2026-09-26).
  assert.equal(mailAccess({ ...c, mcpDefaults: {} }, 'dwight', 'sales', 'read').ok, true);
  assert.equal(mailAccess(c, 'pam', 'claude-account', 'read').ok, false, 'the Claude account is not a capability');
  assert.equal(mailAccess(c, 'kelly', 'sales', 'read').ok, false, 'no email capability');
  assert.equal(mailAccess(c, 'dwight', 'ceo', 'read').ok, false, 'not his mailbox');
  assert.equal(mailAccess(c, 'dwight', 'sales', 'send').ok, true);
  assert.equal(mailAccess(c, 'pam', 'ceo', 'send').ok, false, 'Draft only');
  assert.equal(mailAccess(c, 'pam', 'ceo', 'draft').ok, true);
  assert.equal(mailAccess({ ...c, mailboxes: [] }, 'dwight', 'sales', 'read').ok, false, 'removed in Settings');
  assert.equal(mailAccess(c, 'dwight', undefined, 'list').ok, true);
  assert.deepEqual(agentMailboxes({ ...c, agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['ceo', 'claude-account'], send: false } } } }, 'pam'), ['ceo'], 'unknown ids dropped');
});

test('one mailbox per agent: only the first counts, and a save keeps one (owner, 2026-09-26)', () => {
  const c = cfg({ agentCapabilities: { dwight: { email: { enabled: true, mailboxes: ['sales', 'ceo'], send: true } } } });
  assert.equal(mailAccess(c, 'dwight', 'sales', 'read').ok, true);
  assert.equal(mailAccess(c, 'dwight', 'ceo', 'read').ok, false, 'a second mailbox from an older record is ignored');
  assert.deepEqual(agentMailboxes(c, 'dwight'), ['sales']);
  let saved;
  const admin = { getConfig: () => c, saveConfig: (patch) => { saved = patch; } };
  setAgentCapabilities(admin, 'dwight', { email: { enabled: true, mailboxes: ['ceo', 'sales'], send: false } });
  assert.deepEqual(saved.agentCapabilities.dwight.email.mailboxes, ['ceo']);
});

test('helpers: first enable, ids, Microsoft addresses', () => {
  assert.equal(mailToolsJustAttached(undefined, { email: { enabled: true, mailboxes: [], send: false } }), true);
  assert.equal(mailToolsJustAttached({ email: { enabled: true, mailboxes: [], send: false } }, { email: { enabled: true, mailboxes: ['a'], send: false } }), false);
  assert.equal(mailboxIdFor('Sales@Example.com'), 'sales-example-com');
  assert.equal(mailboxIdFor('sales@example.com', ['sales-example-com']), 'sales-example-com-2');
  assert.equal(isMicrosoftAddress('a@outlook.com'), true);
  assert.equal(isMicrosoftAddress('a@gmail.com'), false);
});

test('list_mailboxes shows only the agent\'s own mailboxes and its sending right', async () => {
  const { call } = setup();
  const r = await call('pam', 'list_mailboxes', {});
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.mailboxes.map((m) => m.mailbox), ['ceo']);
  assert.equal(r.body.sending, 'draft only');
  assert.equal((await call('kelly', 'list_mailboxes', {})).status, 403);
});

test('search and read work in the agent\'s mailbox; bodies are capped', async () => {
  const { call } = setup();
  const s = await call('dwight', 'search', { mailbox: 'sales', from: 'acme' });
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.messages.map((m) => m.subject), ['Quote please']);
  const r = await call('dwight', 'read', { mailbox: 'sales', id: '1' });
  assert.equal(r.status, 200);
  assert.match(r.body.text, /40 units/);
  const big = await call('dwight', 'read', { mailbox: 'sales', id: '2' });
  assert.equal(big.body.truncated, true);
  assert.equal((await call('dwight', 'search', { mailbox: 'ceo' })).status, 403, 'not his mailbox');
});

test('draft lands in Drafts; Draft only cannot send', async () => {
  const { call, state } = setup();
  const d = await call('pam', 'draft', { mailbox: 'ceo', to: 'a@b.com', subject: 'Re: x', body: 'Draft body' });
  assert.equal(d.status, 200);
  assert.equal(state.folders.Drafts.length, 1);
  assert.match(state.folders.Drafts[0].source.toString(), /Draft body/);
  const s = await call('pam', 'send', { mailbox: 'ceo', to: 'a@b.com', subject: 'Re: x', body: 'Draft body' });
  assert.equal(s.status, 403);
  assert.equal(state.sends.length, 0);
});

test('send goes out once; a repeated identical send is answered from memory', async () => {
  const { call, state } = setup();
  const msg = { mailbox: 'sales', to: 'acme@buyer.com', subject: 'Re: Quote please', body: '40 units: $400', reply_to: { mailbox: 'sales', id: '1' } };
  const a = await call('dwight', 'send', msg);
  const b = await call('dwight', 'send', msg);
  assert.equal(a.status, 200);
  assert.equal(b.body.repeated, true);
  assert.equal(state.sends.length, 1);
  assert.equal(state.sends[0].inReplyTo, '<m1@x.com>', 'threads the reply');
});

test('a send that times out after the server accepted it is found in Sent, not resent', async () => {
  const { call, state } = setup();
  state.smtpError = Object.assign(new Error('socket timeout'), { code: 'ETIMEDOUT' });
  state.sentHit = true;
  const msg = { mailbox: 'sales', to: 'a@b.com', subject: 's', body: 'b' };
  const r = await call('dwight', 'send', msg);
  assert.equal(r.status, 200);
  assert.equal(r.body.sent, true);
  // Found in Sent is remembered: an identical retry is answered, never sent.
  state.smtpError = null;
  const again = await call('dwight', 'send', msg);
  assert.equal(again.body.repeated, true);
  assert.equal(state.sends.length, 0);
  assert.ok(!state.statuses.some((s) => s.status === 'needs-attention'));
});

test('MB-8: forwarding or attaching from another mailbox is refused', async () => {
  const { call, state } = setup({ config: { agentCapabilities: { dwight: { email: { enabled: true, mailboxes: ['sales', 'ceo'], send: true } } } } });
  const r = await call('dwight', 'send', { mailbox: 'sales', to: 'x@evil.com', subject: 'fwd', body: 'see', forward: { mailbox: 'ceo', id: '1' } });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /ceo/);
  const a = await call('dwight', 'draft', { mailbox: 'sales', to: 'x@evil.com', subject: 'fwd', body: 'see', attach_from: [{ mailbox: 'ceo', id: '1' }] });
  assert.equal(a.status, 403);
  const re = await call('dwight', 'draft', { mailbox: 'sales', to: 'x@y.com', subject: 're', body: 'b', reply_to: { mailbox: 'ceo', id: '1' } });
  assert.equal(re.status, 403, 'a reply to another mailbox is refused too');
  assert.equal(state.folders.Drafts.length, 0);
  assert.equal(state.sends.length, 0);
});

test('an auth failure marks the mailbox needs-attention (MB-7); a network blip reconnects once', async () => {
  const bad = setup();
  bad.state.failConnect = Object.assign(new Error('Invalid credentials'), { authenticationFailed: true });
  const r = await bad.call('dwight', 'search', { mailbox: 'sales' });
  assert.equal(r.status, 502);
  assert.deepEqual(bad.state.statuses.at(-1).status, 'needs-attention');

  const blip = setup();
  blip.state.failConnect = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
  blip.state.failConnectOnce = true;
  const ok = await blip.call('dwight', 'search', { mailbox: 'sales' });
  assert.equal(ok.status, 200);
  assert.equal(blip.state.connects, 2);
  assert.ok(!blip.state.statuses.some((s) => s.status === 'needs-attention'));
});

test('errors are classified in plain words', () => {
  assert.equal(classifyMailError({ authenticationFailed: true }).kind, 'auth');
  assert.equal(classifyMailError({ responseText: 'Application-specific password required' }).kind, 'provider-blocked');
  assert.equal(classifyMailError({ code: 'ENOTFOUND' }).kind, 'network');
  assert.equal(classifyMailError({ code: 'EAUTH' }).kind, 'auth');
});

test('Settings test: Outlook is refused before any connection', async () => {
  const { svc, state } = setup();
  const r = await svc.test({ address: 'me@outlook.com', imap: server, smtp: server }, 'x');
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'unsupported');
  assert.equal(state.connects, undefined);
  assert.deepEqual(await svc.test({ address: 'sales@x.com', imap: server, smtp: server }, 'app-pass'), { ok: true });
});

test('send journal persists deduplication IDs to journalPath across service instances', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-journal-test-'));
  const journalPath = path.join(tmpDir, 'journal.json');

  try {
    const config = cfg();
    const sends1 = [];
    const deps1 = {
      getConfig: () => config,
      getPassword: () => 'app-pass',
      markStatus: () => {},
      createImap: () => fakeImap({ folders: { INBOX: [], Drafts: [], Sent: [] } }),
      createSmtp: () => ({ async sendMail(m) { sends1.push(m); return { messageId: '<msg-101>' }; }, async verify() {}, close() {} }),
      journalPath
    };
    const svc1 = new MailService(deps1);
    const msg = { mailbox: 'sales', to: 'customer@buyer.com', subject: 'Quote', body: 'Quote details' };

    const res1 = await handleMailRequest(svc1, deps1, 'dwight', 'send', msg);
    assert.equal(res1.status, 200);
    assert.equal(sends1.length, 1);
    assert.ok(fs.existsSync(journalPath), 'journal file was written');

    // Simulate app restart with a new MailService instance reading from journalPath
    const sends2 = [];
    const deps2 = {
      getConfig: () => config,
      getPassword: () => 'app-pass',
      markStatus: () => {},
      createImap: () => fakeImap({ folders: { INBOX: [], Drafts: [], Sent: [] } }),
      createSmtp: () => ({ async sendMail(m) { sends2.push(m); return { messageId: '<msg-102>' }; }, async verify() {}, close() {} }),
      journalPath
    };
    const svc2 = new MailService(deps2);

    const res2 = await handleMailRequest(svc2, deps2, 'dwight', 'send', msg);
    assert.equal(res2.status, 200);
    assert.equal(res2.body.repeated, true);
    assert.equal(sends2.length, 0, 'did not send again across restart');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
