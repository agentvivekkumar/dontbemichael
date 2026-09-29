'use strict';

/**
 * The shared stdio loop behind the app's MCP helpers (md-mail today, md-books
 * next; eng review EXT-1).
 *
 * A helper declares its tools and the broker route they map to; this file does
 * the rest: read one JSON-RPC message per line, answer initialize / tools/list /
 * ping, turn every tools/call into `POST <broker>/<route>/<tool>` with the
 * agent's broker token, and hand the broker's answer back as a tool result.
 * The broker decides what the agent may do, so a helper holds no secrets and
 * no rules.
 *
 * Dependency-free (the bundled node has no node_modules) and never exits on bad
 * input (eng review F-7). It ships beside its helpers in extraResources, and a
 * helper loads it with require('./md-mcp-core.cjs').
 */

const http = require('node:http');
const readline = require('node:readline');

const CALL_TIMEOUT_MS = 90_000;

/**
 * @param {object} spec
 * @param {string} spec.name          serverInfo name, also the log prefix
 * @param {string} spec.route         broker route segment, e.g. 'mail'
 * @param {string} spec.instructions  initialize instructions for the model
 * @param {Array<object>} spec.tools  MCP tool definitions
 * @param {string} spec.notConnected  sentence used when the broker can't be reached
 * @param {string} spec.errorLabel    prefix for a bare HTTP error, e.g. 'Mail'
 */
function serve(spec) {
  const { name, route, instructions, tools, notConnected, errorLabel } = spec;
  const BROKER = process.env.MD_BROKER_URL || '';
  const TOKEN = process.env.MD_BROKER_TOKEN || '';

  function write(msg) {
    try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch { /* stdout closed: nothing to do */ }
  }

  function callBroker(tool, args) {
    return new Promise((resolve) => {
      if (!BROKER || !TOKEN) return resolve({ status: 503, body: { error: `${notConnected} Tell Michael.` } });
      let url;
      try { url = new URL(`/${route}/${tool}`, BROKER); } catch { return resolve({ status: 503, body: { error: notConnected } }); }
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
        serverInfo: { name, version: '1.0.0' },
        instructions
      });
    }
    if (method === 'tools/list') return reply({ tools });
    if (method === 'tools/call') {
      const toolName = params && params.name;
      if (!tools.some((t) => t.name === toolName)) return fail(-32602, `Unknown tool: ${toolName}`);
      const out = await callBroker(toolName, (params && params.arguments) || {});
      const ok = out.status >= 200 && out.status < 300;
      const text = ok ? JSON.stringify(out.body, null, 2) : (out.body && out.body.error) || `${errorLabel} error ${out.status}`;
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
  process.on('uncaughtException', (e) => { try { process.stderr.write(`${name}: ${e && e.stack}\n`); } catch { /* ignore */ } });
}

module.exports = { serve };
