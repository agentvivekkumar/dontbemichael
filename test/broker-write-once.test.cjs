'use strict';

// A write to a connected app is sent once (issue #54), the rule plain mail
// sends got in #126. Runs the real broker in front of a local server that
// counts what reaches it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { WriteJournal, WRITE_MEMORY_MS } = loadTs('src/main/writeOnce.ts');
const { INTEGRATION_TEMPLATES, postReadsFor, isPostRead, graphqlReadsOnly } = loadTs('src/shared/integrations.ts');

const rulesOf = (label) => [INTEGRATION_TEMPLATES.find((x) => x.label === label).postReads];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md-write-once-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** The connected app: records each request, answers with `handler`. */
async function upstream(t, handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, body, key: req.headers['idempotency-key'] });
      handler(req, res, seen.length);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { seen, base: `http://127.0.0.1:${server.address().port}` };
}

async function broker(t, base, journalPath, postReads) {
  const b = new IntegrationBroker({
    getRecord: (id) => (id === 'books' ? { id: 'books', label: 'Books', kind: 'custom-rest', baseUrl: base, authType: 'none', enabled: true } : undefined),
    getSecret: () => undefined,
    writeJournalPath: journalPath,
    // A catalog connector's rules, with the connector itself played by a local server.
    ...(postReads ? { postReads: () => postReads } : {})
  });
  await b.start();
  t.after(() => b.stop());
  const token = b.grant('pty-pam', ['books'], 'pam');
  return (method, p, body, headers = {}) => fetch(`${b.url()}/i/books/${p}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body
  });
}

const created = (req, res, n) => {
  res.writeHead(201, { 'content-type': 'application/json', location: `/invoices/${n}` });
  res.end(JSON.stringify({ id: n, customer: 'Acme Catering' }));
};
const invoice = JSON.stringify({ customer: 'Acme Catering', amount: 400 });

test('the same write twice makes one invoice, and the repeat gets the first answer', async (t) => {
  const app = await upstream(t, created);
  const call = await broker(t, app.base, path.join(tmp, 'twice.json'));
  const first = await call('POST', 'invoices', invoice);
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { id: 1, customer: 'Acme Catering' });
  const again = await call('POST', 'invoices', invoice);
  assert.equal(again.status, 201);
  assert.equal(again.headers.get('x-md-repeated'), '1');
  assert.equal(again.headers.get('location'), '/invoices/1');
  assert.deepEqual(await again.json(), { id: 1, customer: 'Acme Catering' });
  assert.equal(app.seen.length, 1, 'only one invoice reached the app');
  assert.match(app.seen[0].key, /^[0-9a-f]{64}$/, 'the key goes upstream as Idempotency-Key');
  // A different body, or a read, is a different request.
  assert.equal((await call('POST', 'invoices', JSON.stringify({ customer: 'Acme Catering', amount: 500 }))).status, 201);
  await call('GET', 'invoices');
  await call('GET', 'invoices');
  assert.deepEqual(app.seen.map((r) => r.method), ['POST', 'POST', 'GET', 'GET']);
  assert.equal(app.seen[2].key, undefined, 'reads carry no key');
});

test('two copies at once wait for one answer', async (t) => {
  const app = await upstream(t, (req, res, n) => setTimeout(() => created(req, res, n), 150));
  const call = await broker(t, app.base, path.join(tmp, 'overlap.json'));
  const [a, b] = await Promise.all([call('POST', 'bookings', invoice), call('POST', 'bookings', invoice)]);
  assert.deepEqual([a.status, b.status], [201, 201]);
  assert.deepEqual(await b.json(), await a.json());
  assert.equal(app.seen.length, 1);
});

test('a write the app refused, or never reached, can be sent again', async (t) => {
  const app = await upstream(t, (req, res, n) => {
    res.writeHead(n === 1 ? 503 : 201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ n }));
  });
  const call = await broker(t, app.base, path.join(tmp, 'refused.json'));
  assert.equal((await call('POST', 'contacts', invoice)).status, 503);
  assert.equal((await call('POST', 'contacts', invoice)).status, 201, 'a busy app is retried');
  assert.equal(app.seen.length, 2);

  // A port nothing listens on: the connection is refused before anything is sent.
  const spare = http.createServer();
  await new Promise((resolve) => spare.listen(0, '127.0.0.1', resolve));
  const port = spare.address().port;
  await new Promise((resolve) => spare.close(resolve));
  const closed = await broker(t, `http://127.0.0.1:${port}`, path.join(tmp, 'closed.json'));
  const r1 = await closed('POST', 'contacts', invoice);
  const r2 = await closed('POST', 'contacts', invoice);
  assert.deepEqual([r1.status, r2.status], [502, 502]);
  assert.equal((await r2.json()).code, 'bad_gateway', 'never reached: retried, not refused');
});

test('a write whose answer was lost is refused, after a restart too', async (t) => {
  const app = await upstream(t, (req) => req.socket.destroy());
  const journal = path.join(tmp, 'lost.json');
  const call = await broker(t, app.base, journal);
  const lost = await call('POST', 'invoices', invoice);
  assert.equal(lost.status, 502);
  assert.match((await lost.json()).error, /may already have been made/);
  const again = await call('POST', 'invoices', invoice);
  assert.equal(again.status, 409);
  assert.match((await again.json()).error, /Do not send it again; tell Michael/);
  const restarted = await broker(t, app.base, journal);
  assert.equal((await restarted('POST', 'invoices', invoice)).status, 409);
  assert.equal(app.seen.length, 1);
});

test('after a restart a finished write is still not sent again, and its answer never touched disk', async (t) => {
  const app = await upstream(t, created);
  const journal = path.join(tmp, 'restart.json');
  const call = await broker(t, app.base, journal);
  assert.equal((await call('POST', 'invoices', invoice)).status, 201);
  assert.doesNotMatch(fs.readFileSync(journal, 'utf8'), /Acme|customer/, 'no answer body on disk');
  const restarted = await broker(t, app.base, journal);
  const again = await restarted('POST', 'invoices', invoice);
  assert.equal(again.status, 201);
  assert.equal(again.headers.get('x-md-repeated'), '1');
  assert.match((await again.json()).note, /already made/);
  assert.equal(app.seen.length, 1);
});

test('nothing is sent when the write cannot be recorded first', async (t) => {
  const app = await upstream(t, created);
  const call = await broker(t, app.base, path.join(tmp, 'no-such-folder', 'journal.json'));
  const r = await call('POST', 'invoices', invoice);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'not_recorded');
  assert.equal(app.seen.length, 0);
});

test('a finished write is answered again only for a while', async () => {
  let now = 1_000_000;
  const journal = new WriteJournal(undefined, () => now);
  let sends = 0;
  const send = async () => { sends++; return { kind: 'answer', answer: { status: 200, headers: {}, body: Buffer.from('ok') } }; };
  await journal.run('k', send);
  now += WRITE_MEMORY_MS - 1;
  assert.equal((await journal.run('k', send)).repeated, true);
  now += 2;
  assert.equal((await journal.run('k', send)).repeated, false);
  assert.equal(sends, 2);
});

// Reads sent as POST (review on #382): a search or a GraphQL query is asked
// again freely; only writes go through the journal.

test('a Linear query asked twice reaches Linear twice, and the second answer is fresh', async (t) => {
  const titles = ['Fix login'];
  const app = await upstream(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { issues: { nodes: titles.map((title) => ({ title })) } } }));
  });
  const call = await broker(t, app.base, path.join(tmp, 'linear-query.json'), rulesOf('Linear'));
  const query = JSON.stringify({ query: '{ issues { nodes { id title } } }' });
  assert.deepEqual((await (await call('POST', 'graphql', query)).json()).data.issues.nodes, [{ title: 'Fix login' }]);
  titles.push('Ship invoices');
  const again = await call('POST', 'graphql', query);
  assert.equal(again.headers.get('x-md-repeated'), null);
  assert.deepEqual((await again.json()).data.issues.nodes.map((n) => n.title), ['Fix login', 'Ship invoices']);
  assert.equal(app.seen.length, 2);
  assert.equal(app.seen[0].key, undefined, 'a read carries no Idempotency-Key');
});

test('a Linear mutation asked twice reaches Linear once', async (t) => {
  const app = await upstream(t, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":{"issueCreate":{"success":true}}}'); });
  const call = await broker(t, app.base, path.join(tmp, 'linear-mutation.json'), rulesOf('Linear'));
  const mutation = JSON.stringify({ query: 'mutation { issueCreate(input: { title: "Ship invoices" }) { success } }' });
  await call('POST', 'graphql', mutation);
  assert.equal((await call('POST', 'graphql', mutation)).headers.get('x-md-repeated'), '1');
  assert.equal(app.seen.length, 1);
});

test('a Notion query whose answer was lost can be asked again', async (t) => {
  const app = await upstream(t, (req, res, n) => {
    if (n === 1) { req.socket.destroy(); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"results":[]}');
  });
  const call = await broker(t, app.base, path.join(tmp, 'notion-lost.json'), rulesOf('Notion'));
  const body = JSON.stringify({ filter: { property: 'Status', status: { equals: 'Open' } } });
  assert.equal((await call('POST', 'v1/databases/abc123/query', body)).status, 502);
  const again = await call('POST', 'v1/databases/abc123/query', body);
  assert.equal(again.status, 200, 'not refused as a write that may have been made');
  assert.equal(app.seen.length, 2);
});

test('a custom REST POST is still sent once', async (t) => {
  const app = await upstream(t, created);
  const call = await broker(t, app.base, path.join(tmp, 'custom-once.json'), postReadsFor(app.base));
  await call('POST', 'v1/search', invoice);
  assert.equal((await call('POST', 'v1/search', invoice)).headers.get('x-md-repeated'), '1');
  assert.equal(app.seen.length, 1);
});

test('the catalog says which POSTs read, by the connector\'s host', () => {
  const u = (s) => new URL(s);
  assert.deepEqual(postReadsFor('https://api.linear.app/graphql'), rulesOf('Linear'));
  assert.equal(postReadsFor('https://api.example.com').length, 0, 'a custom REST API has none');
  assert.ok(isPostRead(postReadsFor('https://api.notion.com/v1'), u('https://api.notion.com/v1/search'), '{}'));
  assert.ok(!isPostRead(postReadsFor('https://api.notion.com/v1'), u('https://api.notion.com/v1/pages'), '{}'), 'creating a page is a write');
  assert.ok(isPostRead(postReadsFor('https://api.hubapi.com'), u('https://api.hubapi.com/crm/v3/objects/contacts/search'), '{}'));
  assert.ok(!isPostRead(postReadsFor('https://api.hubapi.com'), u('https://api.hubapi.com/crm/v3/objects/contacts'), '{}'));
  const jira = postReadsFor('https://acme.atlassian.net/rest/api/3');
  assert.ok(isPostRead(jira, u('https://acme.atlassian.net/rest/api/3/search/jql'), '{}'));
  assert.ok(!isPostRead(jira, u('https://acme.atlassian.net/rest/api/3/issue'), '{}'));
});

test('a GraphQL body reads only when every operation it runs is a query', () => {
  const q = (query, operationName) => JSON.stringify(operationName ? { query, operationName } : { query });
  assert.ok(graphqlReadsOnly(q('{ viewer { id } }')));
  assert.ok(graphqlReadsOnly(q('query Issues($first: Int = 5) { issues(first: $first) { nodes { id } } }')));
  assert.ok(graphqlReadsOnly(q('# mutation { gone }\nquery { viewer { name } }')), 'a comment is not a mutation');
  assert.ok(graphqlReadsOnly(q('{ issues(filter: { title: { eq: "mutation" } }) { nodes { id } } }')), 'nor is a string');
  assert.ok(!graphqlReadsOnly(q('mutation { issueCreate(input: {}) { success } }')));
  assert.ok(!graphqlReadsOnly(JSON.stringify([{ query: '{ viewer { id } }' }, { query: 'mutation { a }' }])), 'a batch with a mutation is a write');
  assert.ok(graphqlReadsOnly(q('query A { a } mutation B { b }', 'A')));
  assert.ok(!graphqlReadsOnly(q('query A { a } mutation B { b }', 'B')));
  assert.ok(!graphqlReadsOnly(q('query A { a } mutation B { b }')), 'two operations and no name: unclear, so a write');
  assert.ok(!graphqlReadsOnly('not json'));
  assert.ok(!graphqlReadsOnly(q('subscription { issueUpdated { id } }')));
});

