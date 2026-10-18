#!/usr/bin/env node
'use strict';

/**
 * md-whatsapp: WhatsApp Business Cloud API tools for team members.
 *
 * A dependency-free MCP stdio server. Started by Claude Code outside the agent's
 * Bash sandbox with MD_BROKER_URL and MD_BROKER_TOKEN in its environment.
 * Every tool call forwards to `POST <broker>/whatsapp/<tool>`.
 *
 * The broker checks the agent's capability and injects the Meta access token,
 * so this script holds no secrets and no authorization logic.
 */

const http = require('node:http');
const readline = require('node:readline');

const BROKER = process.env.MD_BROKER_URL || '';
const TOKEN = process.env.MD_BROKER_TOKEN || '';
const CALL_TIMEOUT_MS = 60_000;

const accountId = { type: 'string', description: 'WhatsApp account id from list_whatsapp_accounts, for example "wa-support".' };
const contact = { type: 'string', description: 'Customer phone number in international format, for example "+15551234567".' };

const TOOLS = [
  {
    name: 'list_whatsapp_accounts',
    description: 'List the WhatsApp Business number assigned to you (at most one), and your sending mode (can send, send on approval, or draft only). Call this first.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'search_whatsapp_chats',
    description: 'Search customer WhatsApp chats and message history by phone number or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId,
        query: { type: 'string', description: 'Text or phone number to search for.' }
      },
      required: ['accountId']
    }
  },
  {
    name: 'read_whatsapp_chat',
    description: 'Read the recent message history of a conversation with a specific customer phone number.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId,
        contact
      },
      required: ['accountId', 'contact']
    }
  },
  {
    name: 'draft_whatsapp_message',
    description: 'Prepare a drafted WhatsApp response for the business owner to review and send manually.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId,
        to: contact,
        text: { type: 'string', description: 'Message body to draft.' }
      },
      required: ['accountId', 'to', 'text']
    }
  },
  {
    name: 'propose_whatsapp_message',
    description: 'Put a WhatsApp message on Ask me for the business owner to review and approve (Send on approval mode only). Once approved, send with its proposal id.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId,
        to: contact,
        text: { type: 'string', description: 'Message body to propose.' }
      },
      required: ['accountId', 'to', 'text']
    }
  },
  {
    name: 'send_whatsapp_message',
    description: 'Send a WhatsApp message directly to a customer. Can send mode sends immediately. Send on approval requires proposalId from an approved proposal. Draft only is refused.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId,
        to: contact,
        text: { type: 'string', description: 'Message body to send.' },
        proposalId: { type: 'string', description: 'The proposal id once approved by the business owner.' }
      },
      required: ['accountId', 'to', 'text']
    }
  },
  {
    name: 'mark_whatsapp_read',
    description: 'Mark a WhatsApp customer message as read without sending a reply.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId,
        messageId: { type: 'string', description: 'Message ID to mark read.' }
      },
      required: ['accountId', 'messageId']
    }
  }
];

function write(msg) {
  try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch { /* stdout closed */ }
}

function callBroker(tool, args) {
  return new Promise((resolve) => {
    if (!BROKER || !TOKEN) {
      return resolve({ status: 503, body: { error: 'WhatsApp is not connected for you right now. Tell Michael.' } });
    }
    let url;
    try {
      url = new URL(`/whatsapp/${tool}`, BROKER);
    } catch {
      return resolve({ status: 503, body: { error: 'WhatsApp is not connected for you right now.' } });
    }
    const payload = JSON.stringify(args || {});
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'x-md-broker-token': TOKEN
      },
      timeout: CALL_TIMEOUT_MS
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        let body;
        try {
          body = JSON.parse(data || '{}');
        } catch {
          body = { error: data.slice(0, 500) || 'Empty answer from app.' };
        }
        resolve({ status: res.statusCode || 500, body });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, body: { error: 'The app took too long to answer WhatsApp request.' } });
    });
    req.on('error', (e) => resolve({ status: 503, body: { error: `Couldn't reach app: ${e.code || e.message}` } }));
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
      serverInfo: { name: 'md-whatsapp', version: '1.0.0' },
      instructions: 'WhatsApp Business Cloud API tools for your assigned number. Call list_whatsapp_accounts first.'
    });
  }
  if (method === 'tools/list') return reply({ tools: TOOLS });
  if (method === 'tools/call') {
    const name = params && params.name;
    if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
    const out = await callBroker(name, (params && params.arguments) || {});
    const ok = out.status >= 200 && out.status < 300;
    const text = ok ? JSON.stringify(out.body, null, 2) : (out.body && out.body.error) || `WhatsApp error ${out.status}`;
    return reply({ content: [{ type: 'text', text }], isError: !ok });
  }
  if (method === 'ping') return reply({});
  if (typeof method === 'string' && method.startsWith('notifications/')) return;
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
process.on('uncaughtException', (e) => { try { process.stderr.write(`md-whatsapp: ${e && e.stack}\n`); } catch { /* ignore */ } });
