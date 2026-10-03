'use strict';

/**
 * 2026-10-03: closing time hung with every team member closed. Michael wrote
 * CLOSING-TIME-COMPLETE with a shell heredoc (`cat > outbox/x.json <<'EOF'`),
 * which creates the file empty and then fills it. The router's poll read it in
 * between, could not parse it, quarantined it, and told nobody: Michael
 * believed he had sent it and the app waited for ever. Now a fresh unreadable
 * file is read again on a later tick, and one that stays unreadable is set
 * aside with a notice to its sender.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };
const { HiveManager } = loadTs('src/main/hive.ts');

async function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-partial-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  return hive;
}
const jsonIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []);

test('a message caught mid-write is read again, not thrown away', async (t) => {
  // Value: protects=every message an agent writes with a shell redirect arrives; fails_when=the router quarantines a fresh empty or cut-short file on first sight; why_new=regression of the 2026-10-03 closing time hang; seam=none
  const hive = await office(t);
  const outbox = path.join(hive.root(), 'agents', 'god', 'outbox');
  const file = path.join(outbox, 'closing-complete-1.json');
  fs.writeFileSync(file, ''); // the shell has created it, not yet filled it
  hive.routeOnce();
  assert.ok(fs.existsSync(file), 'left in place for the next tick');
  assert.deepEqual(jsonIn(path.join(outbox, '.sent')).filter((f) => f.startsWith('bad-')), []);
  fs.writeFileSync(file, '{"to":"pam","act":"inform","subject":"CLOSING-TIME-COMPLETE","body":"done"');
  hive.routeOnce();
  assert.ok(fs.existsSync(file), 'cut short: still waiting');
  fs.writeFileSync(file, JSON.stringify({ to: 'pam', act: 'inform', subject: 'CLOSING-TIME-COMPLETE', body: 'done' }));
  assert.equal(hive.routeOnce(), 1);
  const inbox = path.join(hive.root(), 'agents', 'pam', 'inbox');
  assert.deepEqual(jsonIn(inbox).map((f) => JSON.parse(fs.readFileSync(path.join(inbox, f), 'utf8')).subject), ['CLOSING-TIME-COMPLETE']);
});

test('a file that stays unreadable is set aside and its sender is told', async (t) => {
  // Value: protects=an agent never believes an undelivered message was sent; fails_when=the drop is silent or the file is never quarantined; why_new=the old quarantine told nobody; seam=file mtime aged past the grace
  const hive = await office(t);
  const outbox = path.join(hive.root(), 'agents', 'pam', 'outbox');
  const file = path.join(outbox, 'note.json');
  fs.writeFileSync(file, '{"to":"god", oops');
  const old = new Date(Date.now() - HiveManager.OUTBOX_WRITE_GRACE_MS - 1000);
  fs.utimesSync(file, old, old);
  hive.routeOnce();
  assert.ok(!fs.existsSync(file));
  assert.ok(fs.existsSync(path.join(outbox, '.sent', 'bad-note.json')));
  const inbox = path.join(hive.root(), 'agents', 'pam', 'inbox');
  const notice = jsonIn(inbox).map((f) => JSON.parse(fs.readFileSync(path.join(inbox, f), 'utf8'))).find((m) => m.subject === 'Message not delivered');
  assert.ok(notice, 'the sender hears about it');
  assert.match(notice.body, /note\.json is not valid JSON, so nobody received it\. Write the message again/);
});
