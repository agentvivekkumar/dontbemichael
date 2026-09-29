'use strict';

/**
 * The secret store (src/main/integrations.ts) and its atomic write
 * (src/main/atomicFile.ts).
 *
 * One file holds every saved secret: mailbox passwords (`mail:<id>`), engine
 * keys (`apikey:<backend>`) and integration secrets (`int:<id>`). QuickBooks
 * will rewrite it every time its refresh token rotates, so a write cut short by
 * a crash must never lose the others (eng review REG-1, CEO QBO-7). What would
 * hurt: a torn file that reads back as empty, a leftover temp file, or a secret
 * written in plaintext when OS encryption is off.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// integrations.ts and config.ts reach Electron for app.getPath and safeStorage;
// stand in a throwaway userData root and a reversible "encryption" (same seam as
// business-onboarding.test.cjs).
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-secret-store-'));
let encryptionOn = true;
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    app: { getPath: () => userData },
    safeStorage: {
      isEncryptionAvailable: () => encryptionOn,
      encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
      decryptString: (b) => b.toString('utf8').replace(/^enc:/, '')
    }
  }
};
const { setSecret, getSecret, hasSecret, deleteSecret } = loadTs('src/main/integrations.ts');
const { writeFileAtomic } = loadTs('src/main/atomicFile.ts');
const scratch = [userData];
test.after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });

const secretsFile = path.join(userData, 'integration-secrets.json');
const leftovers = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));

test('mail, engine key and integration secrets all round-trip, and are stored encrypted', () => {
  assert.deepEqual(setSecret('mail:sales', 'app-password-1'), { ok: true });
  assert.deepEqual(setSecret('apikey:openai', 'sk-test-2'), { ok: true });
  assert.deepEqual(setSecret('int:quickbooks', 'client-secret-3'), { ok: true });
  assert.equal(getSecret('mail:sales'), 'app-password-1');
  assert.equal(getSecret('apikey:openai'), 'sk-test-2');
  assert.equal(getSecret('int:quickbooks'), 'client-secret-3');
  const raw = fs.readFileSync(secretsFile, 'utf8');
  assert.ok(!raw.includes('app-password-1') && !raw.includes('sk-test-2'), 'no plaintext on disk');
  if (process.platform !== 'win32') assert.equal(fs.statSync(secretsFile).mode & 0o777, 0o600);
  assert.deepEqual(leftovers(userData), [], 'no temp file left behind');
});

test('updating one secret keeps the others, and delete removes only its own', () => {
  setSecret('mail:sales', 'app-password-1b');
  assert.equal(getSecret('mail:sales'), 'app-password-1b');
  assert.equal(getSecret('apikey:openai'), 'sk-test-2');
  deleteSecret('apikey:openai');
  assert.equal(hasSecret('apikey:openai'), false);
  assert.equal(getSecret('int:quickbooks'), 'client-secret-3');
});

test('with OS encryption off, nothing is written in plaintext and nothing is lost', () => {
  const before = fs.readFileSync(secretsFile, 'utf8');
  encryptionOn = false;
  try {
    const r = setSecret('mail:support', 'plain-should-never-land');
    assert.equal(r.ok, false);
    assert.match(r.error, /encryption is unavailable/);
  } finally {
    encryptionOn = true;
  }
  assert.equal(fs.readFileSync(secretsFile, 'utf8'), before, 'the file is untouched');
});

test('a write that fails before the rename leaves the old file intact and no temp file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-atomic-'));
  t_cleanup(dir);
  const file = path.join(dir, 'secrets.json');
  fs.writeFileSync(file, '{"mail:sales":"old"}');
  const failRename = { ...realOps(), renameSync: () => { throw new Error('power cut before rename'); } };
  assert.throws(() => writeFileAtomic(file, '{"mail:sales":"new"}', 0o600, failRename), /power cut/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"mail:sales":"old"}');
  assert.deepEqual(leftovers(dir), []);
});

test('a write that fails midway (disk full) leaves the old file intact and no temp file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-atomic-'));
  t_cleanup(dir);
  const file = path.join(dir, 'secrets.json');
  fs.writeFileSync(file, '{"mail:sales":"old"}');
  const failWrite = { ...realOps(), writeSync: (fd) => { fs.writeSync(fd, '{"mail:sa'); throw new Error('ENOSPC'); } };
  assert.throws(() => writeFileAtomic(file, '{"mail:sales":"new"}', 0o600, failWrite), /ENOSPC/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"mail:sales":"old"}', 'the half-written data never replaced the file');
  assert.deepEqual(leftovers(dir), []);
});

test('a successful atomic write replaces the file whole', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-atomic-'));
  t_cleanup(dir);
  const file = path.join(dir, 'secrets.json');
  fs.writeFileSync(file, 'old');
  writeFileAtomic(file, 'new contents');
  assert.equal(fs.readFileSync(file, 'utf8'), 'new contents');
  assert.deepEqual(leftovers(dir), []);
});

function realOps() {
  return {
    openSync: fs.openSync,
    writeSync: (fd, data) => fs.writeSync(fd, data, null, 'utf8'),
    fsyncSync: fs.fsyncSync,
    closeSync: fs.closeSync,
    renameSync: fs.renameSync,
    rmSync: fs.rmSync
  };
}

function t_cleanup(dir) {
  scratch.push(dir);
}
