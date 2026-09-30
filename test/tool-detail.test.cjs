'use strict';

/**
 * The one-line tool summary the closing-time rows show (owner, 2026-09-29).
 * The rule that matters: a raw Bash command never leaves the main process,
 * because a command can carry a token. Only Claude's own description does.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { toolDetail, toolLine, HookServer } = loadTs('src/main/hooks.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

test('each tool is summarised without its raw input', () => {
  const rows = [
    ['Bash', { command: 'curl -H "Authorization: Bearer abc" x', description: 'Run the full test suite' }, 'Run the full test suite'],
    ['Bash', { command: 'npm test' }, undefined],
    ['Task', { description: 'Research competitors' }, 'Research competitors'],
    ['Agent', { description: 'Draft the newsletter' }, 'Draft the newsletter'],
    ['Read', { file_path: '/Users/x/office/salaries-2026.xlsx' }, 'salaries-2026.xlsx'],
    ['Edit', { file_path: 'C:\\office\\plan.md' }, 'plan.md'],
    ['Write', { file_path: 'notes.txt' }, 'notes.txt'],
    ['NotebookEdit', { notebook_path: '/a/b/model.ipynb' }, 'model.ipynb'],
    ['MultiEdit', { file_path: '/a/b/c.ts' }, 'c.ts'],
    ['mcp__srv____', {}, undefined],
    ['WebFetch', { url: 'https://example.com/private?token=abc' }, 'example.com'],
    ['WebFetch', { url: 'not a url' }, undefined],
    ['mcp__claude_ai_Intuit_QuickBooks__qbo_sales_get_invoices', {}, 'qbo sales get invoices'],
    ['mcp__md-mail__search', { mailbox: 'sales' }, 'search'],
    ['Grep', { pattern: 'password' }, undefined],
    ['Bash', null, undefined],
    ['Bash', 'nonsense', undefined],
    [undefined, {}, undefined]
  ];
  for (const [tool, input, want] of rows) assert.equal(toolDetail(tool, input), want, `${tool} ${JSON.stringify(input)}`);
});

async function hookServer(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-tool-detail-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const sent = [];
  const server = new HookServer(hive, () => ({ send: (c, p) => sent.push({ c, p }) }), () => ({ harnessHome: home }), undefined, undefined);
  const call = (event, tool_name, tool_input) => server.handle({ agent_id: 'pam', session_id: 's1', hook_event_name: event, tool_name, tool_input, cwd: home });
  const lastHook = () => sent.filter((s) => s.c === 'hive:hookEvent').pop()?.p;
  return { call, lastHook };
}

test('the hook sends the detail on PreToolUse only, redacted and at most 80 characters', async (t) => {
  const h = await hookServer(t);
  await h.call('PreToolUse', 'Bash', { command: 'x', description: 'Deploy with key sk-ant-abcdefghijklmnopqrstuvwxyz0123' });
  assert.equal(h.lastHook().detail, 'Deploy with key [redacted]');
  await h.call('PreToolUse', 'Bash', { command: 'x', description: 'a'.repeat(200) });
  assert.equal(h.lastHook().detail.length, 80);
  // Value: protects=a multi-line Bash description reaches the row as one single-spaced line; fails_when=toolLine stops collapsing whitespace; why_new=only redaction and the 80-char cap were checked; seam=none
  await h.call('PreToolUse', 'Bash', { command: 'x', description: '  Run\n\tthe   tests\r\nnow  ' });
  assert.equal(h.lastHook().detail, 'Run the tests now');
  await h.call('PostToolUse', 'Bash', { command: 'x', description: 'Run tests' });
  assert.equal(h.lastHook().detail, undefined);
  await h.call('PreToolUse', 'Bash', { command: 'secret-command --token abc' });
  assert.equal(h.lastHook().detail, undefined, 'no description: nothing, never the command');
});

test('a huge agent-written description is cut before redaction, so the hook stays fast', () => {
  // Value: protects=an agent cannot freeze the main process with a 256 KB description; fails_when=toolLine redacts the full text before cutting it; why_new=ship adversarial review measured 2.6 s at 64 KB; seam=none
  const big = 'a-'.repeat(128 * 1024);
  const t0 = process.hrtime.bigint();
  const line = toolLine('Bash', { command: 'x', description: big });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 200, `took ${ms.toFixed(0)} ms`);
  assert.equal(line.length, 80);
});

test('the line drops hidden and direction-reversing characters and never splits an emoji', () => {
  // Value: protects=the owner sees the real text of the line they decide by; fails_when=bidi/zero-width characters survive or the 80 cut splits a surrogate pair; why_new=ship adversarial review; seam=none
  assert.equal(toolLine('Bash', { description: 'Run \u202Etset\u200B the suite' }), 'Run tset the suite', 'removed, not spaced');
  const emoji = '😀'.repeat(100);
  const line = toolLine('Bash', { description: emoji });
  assert.equal(Array.from(line).length, 80);
  assert.ok(!/[\uD800-\uDBFF]$/.test(line), 'no lone high surrogate at the end');
});

test('a private key that starts in the line but ends past the old 512 cut is still redacted', () => {
  // Value: protects=a key straddling the scan window never shows its opening on screen; fails_when=the scan window shrinks below real key sizes; why_new=ship review run 3 (red team); seam=none
  const key = '-----BEGIN RSA PRIVATE KEY-----' + 'A'.repeat(1600) + '-----END RSA PRIVATE KEY-----';
  const line = toolLine('Bash', { description: `Use ${key} to sign` });
  assert.doesNotMatch(line, /BEGIN|AAAA/);
});

test('a private key too long for the scan window drops the line instead of showing its start', () => {
  // Value: protects=an 8192-bit key cut off by the window never shows its header or first bytes; fails_when=the key-header guard is removed; why_new=ship review cycle 2; seam=none
  const key = '-----BEGIN RSA PRIVATE KEY-----' + 'A'.repeat(5000) + '-----END RSA PRIVATE KEY-----';
  assert.equal(toolLine('Bash', { description: `Use ${key} to sign` }), undefined);
});

test('an invisible character inside a token does not split it past redaction', () => {
  // Value: protects=a zero-width character hidden in a token cannot keep it on screen; fails_when=format characters are replaced with a space before redaction; why_new=ship run 3 Step 11 adversarial F3; seam=none
  const token = 'ghp_' + 'A'.repeat(10) + '\u200b' + 'B'.repeat(26);
  const line = toolLine('Bash', { description: `push with ${token}` });
  assert.doesNotMatch(line, /AAAAAAAAAA|BBBBBBBBBB/);
});
