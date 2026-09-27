#!/usr/bin/env node
'use strict';

/**
 * md-mail: the mail tools a team member uses (docs/designs/multi-mailbox.md, E1).
 *
 * A dependency-free MCP stdio server. Claude Code starts it outside the agent's
 * Bash sandbox (sandboxed Bash cannot reach the broker; an MCP server can), with
 * MD_BROKER_URL and MD_BROKER_TOKEN in its environment. Every tool call becomes
 * `POST <broker>/mail/<tool>`; the broker decides what this agent may do, so
 * this file holds no passwords and no rules.
 *
 * It answers every request with a result or a JSON-RPC error and never exits on
 * bad input (eng review F-7).
 */

const http = require('node:http');
const readline = require('node:readline');

const BROKER = process.env.MD_BROKER_URL || '';
const TOKEN = process.env.MD_BROKER_TOKEN || '';
const CALL_TIMEOUT_MS = 90_000;

const mailbox = { type: 'string', description: 'Mailbox id from list_mailboxes, for example "sales-moblize-it".' };
const ref = {
  type: 'object',
  description: 'A message in a mailbox: {mailbox, id} where id comes from search.',
  properties: { mailbox: { type: 'string' }, id: { type: 'string' } },
  required: ['mailbox', 'id']
};
const compose = {
  mailbox,
  to: { type: 'string', description: 'Recipients, comma separated.' },
  cc: { type: 'string' },
  subject: { type: 'string' },
  body: { type: 'string', description: 'Plain text body.' },
  reply_to: { ...ref, description: 'The message you are replying to (threads the reply).' },
  forward: { ...ref, description: 'A message to forward, from this same mailbox.' },
  attach_from: { type: 'array', items: ref, description: 'Messages whose attachments to include, from this same mailbox.' }
};

const TOOLS = [
  {
    name: 'list_mailboxes',
    description: 'The mailbox the owner has given you (at most one), and whether you can send or only draft. Call this first.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'search',
    description: 'Find messages in one of your mailboxes (newest first, 20 per page by default, 50 at most).',
    inputSchema: {
      type: 'object',
      properties: {
        mailbox,
        text: { type: 'string', description: 'Words anywhere in the message.' },
        from: { type: 'string' },
        subject: { type: 'string' },
        since: { type: 'string', description: 'A date, for example 2026-09-01.' },
        unread: { type: 'boolean' },
        limit: { type: 'number' },
        page: { type: 'number' }
      },
      required: ['mailbox']
    }
  },
  {
    name: 'read',
    description: 'Read one message (text, sender, recipients, attachment names).',
    inputSchema: { type: 'object', properties: { mailbox, id: { type: 'string', description: 'Message id from search.' } }, required: ['mailbox', 'id'] }
  },
  {
    name: 'draft',
    description: "Save a reply or new message in the mailbox's Drafts folder for the owner to review and send.",
    inputSchema: { type: 'object', properties: compose, required: ['mailbox', 'to', 'subject', 'body'] }
  },
  {
    name: 'send',
    description: 'Send a message from one of your mailboxes. Only works if the owner set you to Can send; otherwise use draft.',
    inputSchema: { type: 'object', properties: compose, required: ['mailbox', 'to', 'subject', 'body'] }
  }
];

function write(msg) {
  try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch { /* stdout closed: nothing to do */ }
}

function callBroker(tool, args) {
  return new Promise((resolve) => {
    if (!BROKER || !TOKEN) return resolve({ status: 503, body: { error: 'Mail is not connected for you right now. Tell Michael.' } });
    let url;
    try { url = new URL(`/mail/${tool}`, BROKER); } catch { return resolve({ status: 503, body: { error: 'Mail is not connected for you right now.' } }); }
    const payload = JSON.stringify(args || {});
    const req = http.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-md-broker-token': TOKEN },
      timeout: CALL_TIMEOUT_MS
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        let body;
        try { body = JSON.parse(data || '{}'); } catch { body = { error: data.slice(0, 500) || 'Empty answer from the app.' }; }
        resolve({ status: res.statusCode || 500, body });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, body: { error: 'The app took too long to answer.' } }); });
    req.on('error', (e) => resolve({ status: 503, body: { error: `Couldn't reach the app: ${e.code || e.message}` } }));
    req.end(payload);
  });
}

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => { if (id !== undefined) write({ jsonrpc: '2.0', id, result }); };
  const fail = (code, message) => { if (id !== undefined) write({ jsonrpc: '2.0', id, error: { code, message } }); };

  if (method === 'initialize') {
    return reply({
      protocolVersion: (params && params.protocolVersion) || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'md-mail', version: '1.0.0' },
      instructions: 'Mail tools for the mailboxes the owner gave you. Call list_mailboxes first.'
    });
  }
  if (method === 'tools/list') return reply({ tools: TOOLS });
  if (method === 'tools/call') {
    const name = params && params.name;
    if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
    const out = await callBroker(name, (params && params.arguments) || {});
    const ok = out.status >= 200 && out.status < 300;
    const text = ok ? JSON.stringify(out.body, null, 2) : (out.body && out.body.error) || `Mail error ${out.status}`;
    return reply({ content: [{ type: 'text', text }], isError: !ok });
  }
  if (method === 'ping') return reply({});
  if (typeof method === 'string' && method.startsWith('notifications/')) return; // no reply to notifications
  return fail(-32601, `Method not found: ${method}`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (!msg || typeof msg !== 'object') return write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
  handle(msg).catch((e) => write({ jsonrpc: '2.0', id: msg.id === undefined ? null : msg.id, error: { code: -32603, message: String((e && e.message) || e) } }));
});
rl.on('close', () => process.exit(0));
process.on('uncaughtException', (e) => { try { process.stderr.write(`md-mail: ${e && e.stack}\n`); } catch { /* ignore */ } });
