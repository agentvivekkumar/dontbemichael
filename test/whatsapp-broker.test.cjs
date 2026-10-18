'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const loadTs = require('./load-ts.cjs');

const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');

function post(port, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...headers
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { data += d; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end(payload);
  });
}

test('IntegrationBroker: WhatsApp tool routing and token authentication', async () => {
  let routedOp = '';
  let routedAgent = '';
  let routedBody = null;

  const broker = new IntegrationBroker({
    getRecord: () => undefined,
    getSecret: () => undefined,
    whatsapp: async (agentId, op, body) => {
      routedOp = op;
      routedAgent = agentId;
      routedBody = body;
      return { status: 200, body: { ok: true, handled: op } };
    }
  });

  const startRes = await broker.start(0);
  assert.equal(startRes.ok, true);
  const port = startRes.port;

  // Grant capability token to worker for agent 'kelly'
  const token = broker.grant('worker-1', [], 'kelly');

  // 1. Authorized WhatsApp call
  const res1 = await post(port, '/whatsapp/list_whatsapp_accounts', { 'x-md-broker-token': token }, {});
  assert.equal(res1.status, 200);
  assert.equal(res1.body.ok, true);
  assert.equal(routedOp, 'list_whatsapp_accounts');
  assert.equal(routedAgent, 'kelly');

  // 2. Send message call
  const res2 = await post(
    port,
    '/whatsapp/send_whatsapp_message',
    { 'x-md-broker-token': token },
    { accountId: 'wa-1', to: '+1234567890', text: 'Hello' }
  );
  assert.equal(res2.status, 200);
  assert.equal(routedOp, 'send_whatsapp_message');
  assert.equal(routedBody.to, '+1234567890');

  // 3. Missing/invalid token
  const res3 = await post(port, '/whatsapp/list_whatsapp_accounts', { 'x-md-broker-token': 'bad-token' }, {});
  assert.equal(res3.status, 401);

  await broker.stop();
});
