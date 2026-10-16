#!/usr/bin/env node
'use strict';
// Credential-free stdio adapter. The authenticated app broker owns all access.
const http = require('node:http');
const { TOOLS, validateCalendarToolRequest } = require('./calendar-tool-contract.cjs');
const MAX_LINE = 16 * 1024;
const MAX_RESPONSE = 4 * 1024 * 1024;
const TIMEOUT = 40_000;
const unavailable = () => ({ error: 'Calendar tools are not connected to the app right now. Ask the owner to restart your session.', code: 'unavailable' });
function write(msg) { try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch { /* closed */ } }
function broker(tool, args) {
  return new Promise((resolve) => {
    let url;
    try {
      const base = new URL(process.env.MD_BROKER_URL || '');
      if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.username || base.password || base.search || base.hash || base.pathname !== '/' || !process.env.MD_BROKER_TOKEN) throw new Error();
      url = new URL(`/calendar/${tool}`, base);
    } catch { resolve({ ok: false, body: unavailable() }); return; }
    const body = JSON.stringify(args);
    let finished = false;
    const finish = (out) => { if (!finished) { finished = true; clearTimeout(timer); resolve(out); } };
    let timer;
    const req = http.request(url, { method: 'POST', agent: false, maxHeaderSize: 16 * 1024, headers: {
      'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-md-broker-token': process.env.MD_BROKER_TOKEN
    } }, (res) => {
      const chunks = []; let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE) { req.destroy(); finish({ ok: false, body: { error: 'The calendar result is too large. Use a smaller time range.', code: 'too-large' } }); }
        else chunks.push(chunk);
      });
      res.on('error', () => finish({ ok: false, body: unavailable() }));
      res.on('aborted', () => finish({ ok: false, body: unavailable() }));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !res.complete) throw new Error();
          finish({ ok: res.statusCode === 200, body: parsed });
        } catch { finish({ ok: false, body: unavailable() }); }
      });
    });
    timer = setTimeout(() => { req.destroy(); finish({ ok: false, body: { error: 'The calendar request took too long. Try a smaller time range.', code: 'timeout' } }); }, TIMEOUT);
    req.on('error', () => finish({ ok: false, body: unavailable() }));
    req.end(body);
  });
}
async function handle(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string'
    || (msg.id !== undefined && !((typeof msg.id === 'string' && msg.id.length <= 128) || (typeof msg.id === 'number' && Number.isFinite(msg.id))))) {
    write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }); return;
  }
  if (msg.id === undefined) return;
  const reply = (result) => write({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => write({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
  if (msg.method === 'initialize') return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'md-calendar', version: '1.0.0' }, instructions: 'Call list_calendars first. Calendar tools are read only, even with approval or booking access configured.' });
  if (msg.method === 'ping') return reply({});
  if (msg.method === 'tools/list') return reply({ tools: TOOLS });
  if (msg.method !== 'tools/call') return fail(-32601, 'Method not found');
  const tool = msg.params && msg.params.name;
  const args = msg.params && msg.params.arguments;
  const checked = validateCalendarToolRequest(tool, args);
  if (!checked.ok) return fail(-32602, checked.reason);
  const out = await broker(tool, args);
  return reply({ content: [{ type: 'text', text: JSON.stringify(out.body) }], structuredContent: out.body, isError: !out.ok });
}
let pending = Buffer.alloc(0), discarding = false;
process.stdin.on('data', (chunk) => {
  let rest = chunk;
  while (rest.length) {
    const end = rest.indexOf(10);
    const part = end < 0 ? rest : rest.subarray(0, end);
    if (!discarding) {
      if (pending.length + part.length > MAX_LINE) {
        pending = Buffer.alloc(0); discarding = true;
        write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } });
      } else pending = Buffer.concat([pending, part]);
    }
    if (end < 0) break;
    if (!discarding && pending.toString('utf8').trim()) {
      try {
        const msg = JSON.parse(pending.toString('utf8'));
        void handle(msg).catch(() => write({ jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32603, message: 'Calendar request could not be completed' } }));
      } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    }
    pending = Buffer.alloc(0); discarding = false; rest = rest.subarray(end + 1);
  }
});
process.stdin.on('end', () => { /* pending requests finish before Node exits */ });
