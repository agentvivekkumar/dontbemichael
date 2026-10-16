'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const loadTs = require('./load-ts.cjs');
const { CaldavTransport, davUrl, publicDavAddress, DAV_MAX_BYTES } = loadTs('src/main/caldavTransport.ts');
const input = () => ({ url: 'https://calendar.example.test/dav', origin: 'https://calendar.example.test/dav', provider: 'caldav', method: 'PROPFIND', depth: '0', body: '<props/>', username: 'owner', password: 'secret', signal: AbortSignal.timeout(1000), guard() {} });
const ok = () => ({ status: 207, headers: {}, body: '<multistatus/>' });
const errorCode = (code) => (error) => error.code === code;

for (const address of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.1.2', '192.168.1.1', '100.64.0.1', '192.0.0.9', '192.0.2.1', '198.51.100.4', '203.0.113.1', '198.18.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', '::', '::1', 'fe80::1', 'fc00::1', 'ff02::1', '::ffff:8.8.8.8', '::ffff:127.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1', '2001::1', '3fff::1', '4000::1']) {
  test(`SSRF blocks ${address}`, async () => {
    assert.equal(publicDavAddress(address), false);
    let sends = 0;
    const transport = new CaldavTransport({ resolve: async () => [{ address, family: address.includes(':') ? 6 : 4 }], send: async () => { sends++; return ok(); } });
    await assert.rejects(transport.request(input()), errorCode('security'));
    assert.equal(sends, 0);
  });
}

for (const url of ['http://calendar.example.test', 'file:///tmp/calendar', 'https://user:secret@calendar.example.test', 'https://127.1/dav', 'https://2130706433/dav', 'https://0x7f000001/dav', 'https://[::1]/', 'https://localhost/', 'https://test.local/', 'https://instance.internal/', 'https://calendar.example.test./', 'https://calendar.example.test/?token=secret', 'https://calendar.example.test/#secret', 'https://calendar.example.test/a/../b', 'https://calendar.example.test/%2e%2e/b', 'https://calendar.example.test/%0d%0a', 'https://calendar.example.test/\\private', 'https://singlelabel/', '']) {
  test(`unsafe URL ${url} is refused`, () => assert.throws(() => davUrl(url), errorCode('security')));
}

test('public IPv4 and IPv6 are permitted; every request uses a freshly validated pinned IP', async () => {
  assert.equal(publicDavAddress('8.8.8.8'), true);
  assert.equal(publicDavAddress('2606:4700:4700::1111'), true);
  const sent = [];
  let resolves = 0;
  const transport = new CaldavTransport({ resolve: async () => [{ address: ++resolves === 1 ? '93.184.216.34' : '8.8.8.8', family: 4 }], send: async (r) => { sent.push(r); return ok(); } });
  await transport.request(input()); await transport.request(input());
  assert.equal(resolves, 2);
  assert.deepEqual(sent.map((r) => r.address), ['93.184.216.34', '8.8.8.8']);
  assert.equal(sent[0].url.hostname, 'calendar.example.test');
  assert.equal(sent[0].headers.authorization, `Basic ${Buffer.from('owner:secret').toString('base64')}`);
});

test('mixed public/private DNS answers and invalid resolver families are refused', async () => {
  for (const answers of [[], [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 6 }]]) {
    const transport = new CaldavTransport({ resolve: async () => answers, send: async () => { assert.fail('must not send'); } });
    await assert.rejects(transport.request(input()), errorCode('security'));
  }
});

test('same origin redirects preserve the DAV method; rebinding on the next hop is blocked', async () => {
  let lookups = 0, sends = 0;
  const transport = new CaldavTransport({ resolve: async () => [{ address: ++lookups === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }], send: async (r) => { sends++; assert.equal(r.method, 'PROPFIND'); return { status: 307, headers: { location: '/home/' }, body: '' }; } });
  await assert.rejects(transport.request(input()), errorCode('security'));
  assert.equal(sends, 1);
});

test('cross origin, downgrade, untrusted provider shards and redirect loops never receive credentials', async () => {
  for (const target of ['https://evil.example.test/dav', 'http://calendar.example.test/dav', 'https://p01-caldav.icloud.com/dav', 'https://caldav.icloud.com.evil.example.test/dav', '/dav']) {
    let sends = 0;
    const transport = new CaldavTransport({ resolve: async () => [{ address: '93.184.216.34', family: 4 }], send: async () => { sends++; return { status: 302, headers: { location: target }, body: '' }; } });
    await assert.rejects(transport.request(input()), errorCode('security'));
    assert.equal(sends, target === '/dav' ? 4 : 1);
  }
});

test('iCloud explicitly permits only public, HTTPS Apple CalDAV shards', async () => {
  const sent = [];
  const transport = new CaldavTransport({ resolve: async () => [{ address: '93.184.216.34', family: 4 }], send: async (r) => { sent.push(r); return sent.length === 1 ? { status: 301, headers: { location: 'https://p42-caldav.icloud.com/dav' }, body: '' } : ok(); } });
  await transport.request({ ...input(), provider: 'icloud', origin: 'https://caldav.icloud.com', url: 'https://caldav.icloud.com' });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].url.hostname, 'p42-caldav.icloud.com');
});

test('an in flight access revocation is checked after DNS and before sending credentials', async () => {
  const transport = new CaldavTransport({ resolve: async () => [{ address: '93.184.216.34', family: 4 }], send: async () => assert.fail('must not send') });
  await assert.rejects(transport.request({ ...input(), guard: () => { throw Object.assign(new Error(), { code: 'changed' }); } }), errorCode('changed'));
});

test('response size limits and unsupported redirect semantics are enforced with mock senders too', async () => {
  for (const result of [{ status: 207, body: 'x'.repeat(DAV_MAX_BYTES + 1), headers: {} }, { status: 303, body: '', headers: { location: '/other' } }]) {
    const transport = new CaldavTransport({ resolve: async () => [{ address: '8.8.8.8', family: 4 }], send: async () => result });
    await assert.rejects(transport.request(input()), errorCode(result.status === 303 ? 'security' : 'too-large'));
  }
});

test('DNS and response deadlines include stalled resolvers and transports', async () => {
  for (const stage of ['dns', 'response']) {
    const transport = new CaldavTransport({ resolve: async () => stage === 'dns' ? new Promise(() => {}) : [{ address: '8.8.8.8', family: 4 }], send: async () => new Promise(() => {}) });
    const timer = setTimeout(() => {}, 100);
    try { await assert.rejects(transport.request({ ...input(), signal: AbortSignal.timeout(10) }), errorCode('timeout')); }
    finally { clearTimeout(timer); }
  }
});

test('transport runtime rejects writes and header injection', async () => {
  const transport = new CaldavTransport({ resolve: async () => assert.fail('no DNS'), send: async () => assert.fail('no send') });
  for (const patch of [{ method: 'PUT' }, { method: 'DELETE' }, { method: 'PATCH' }, { username: 'u\nHeader: value' }, { username: 'u:other' }, { password: 'p\r\n' }]) {
    await assert.rejects(transport.request({ ...input(), ...patch }), errorCode('invalid'));
  }
});

// Verify the actual Node adapter's socket options without disabling TLS or
// starting a loopback server. This exercises DNS pinning at the final socket seam.
test('Node HTTPS adapter pins DNS, verifies TLS, disables pools and bounds streamed bodies', async () => {
  const https = require('node:https');
  const original = https.request;
  let mode = 'ok';
  let options;
  https.request = (_url, opts, callback) => {
    options = opts;
    const request = new EventEmitter();
    request.end = () => {
      const stream = new EventEmitter();
      stream.headers = {}; stream.statusCode = 207; stream.complete = true; stream.destroy = () => {};
      callback(stream);
      stream.emit('data', Buffer.from(mode === 'large' ? '12345' : '<x/>'));
      stream.emit('end');
    };
    request.destroy = () => {};
    return request;
  };
  // load-ts uses a per-process cache. This new path loads the adapter after the
  // built-in is patched; the already loaded CommonJS import reads its property.
  const { sendDavHttps } = loadTs('src/main/caldavTransport.ts');
  try {
    const req = { url: new URL('https://calendar.example.test'), address: '8.8.8.8', family: 4, method: 'REPORT', headers: {}, body: '', signal: AbortSignal.timeout(1000), maxBytes: 4 };
    await sendDavHttps(req);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.agent, false);
    assert.equal(options.family, 4);
    options.lookup('calendar.example.test', {}, (err, address, family) => { assert.equal(err, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
    options.lookup('calendar.example.test', { all: true }, (err, addresses) => { assert.equal(err, null); assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]); });
    mode = 'large';
    await assert.rejects(sendDavHttps(req), errorCode('too-large'));
  } finally { https.request = original; }
});

test('Node adapter rejects bad TLS/peer connections and incomplete, compressed or invalid UTF-8 streams', async () => {
  const https = require('node:https');
  const original = https.request;
  let mode;
  https.request = (_url, opts, callback) => {
    const req = new EventEmitter();
    req.destroy = (error) => { if (error) queueMicrotask(() => req.emit('error', error)); };
    req.end = () => {
      if (mode === 'tls') { req.emit('error', new Error('secret TLS diagnostic')); return; }
      if (mode === 'peer') {
        const socket = new EventEmitter(); socket.remoteAddress = '127.0.0.1';
        req.emit('socket', socket); socket.emit('secureConnect'); return;
      }
      const res = new EventEmitter();
      res.destroy = () => {};
      res.statusCode = 207; res.complete = mode !== 'incomplete';
      res.headers = mode === 'compressed' ? { 'content-encoding': 'gzip' } : mode === 'length' ? { 'content-length': '1000' } : {};
      callback(res);
      res.emit('data', mode === 'utf8' ? Buffer.from([0xc0, 0xaf]) : Buffer.from('<x/>'));
      res.emit('end');
    };
    return req;
  };
  const { sendDavHttps } = loadTs('src/main/caldavTransport.ts');
  try {
    for (const [kind, code] of [['tls', 'network'], ['peer', 'security'], ['incomplete', 'network'], ['utf8', 'malformed'], ['length', 'too-large'], ['compressed', 'too-large']]) {
      mode = kind;
      await assert.rejects(sendDavHttps({ url: new URL('https://calendar.example.test'), address: '8.8.8.8', family: 4, method: 'REPORT', headers: {}, body: '', signal: AbortSignal.timeout(1000), maxBytes: 16 }), (error) => {
        assert.equal(error.code, code);
        assert.equal(error.message.includes('secret'), false);
        return true;
      });
    }
  } finally { https.request = original; }
});
