'use strict';

// A hidden Claude session answers Claude Code's bypass mode warning itself
// (owner, 2026-11-13): on an office whose ~/.claude/settings.json did not
// answer it, the warning's default "No, exit" took the Enter that sends the
// prompt, Claude quit before writing anything, and every job change failed as
// "no assistant response found in transcript". Reproduced with Claude Code
// 2.1.323. Runs a fake `claude` in a real PTY that behaves like that warning.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const POSIX = process.platform !== 'win32';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-bypass-home-'));
process.env.HOME = home;
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

const { runHiddenClaude, hiddenSettings } = loadTs('src/main/hiddenClaude.ts');
const { projectDir } = loadTs('src/main/transcript.ts');

// The fake shows the warning unless --settings answers it; there, Enter picks
// "No, exit" and it quits with code 1 before any transcript, as Claude Code does.
const FAKE = `
const fs = require('fs');
const path = require('path');
const argv = process.argv;
const id = argv[argv.indexOf('--session-id') + 1];
const i = argv.indexOf('--settings');
let answered = false;
try { answered = i >= 0 && JSON.parse(argv[i + 1]).skipDangerousModePermissionPrompt === true; } catch {}
const line = (type, text) => JSON.stringify({ type, message: { content: [{ type: 'text', text }] } }) + '\\n';
process.stdout.write(answered ? '> ' : 'WARNING: Claude Code running in Bypass Permissions mode\\n> No, exit\\n  Yes, I accept\\n');
process.stdin.on('data', (d) => {
  if (!/[\\r\\n]/.test(String(d))) return;
  if (!answered) process.exit(1);
  const file = path.join(process.env.FAKE_DIR, id + '.jsonl');
  fs.mkdirSync(process.env.FAKE_DIR, { recursive: true });
  fs.writeFileSync(file, line('user', 'check'));
  setTimeout(() => fs.appendFileSync(file, line('assistant', 'DONE')), 100);
});
`;

function fakeClaude() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-bypass-bin-'));
  fs.writeFileSync(path.join(dir, 'fake.cjs'), FAKE);
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${path.join(dir, 'fake.cjs')}" "$@"\n`, { mode: 0o755 });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-bypass-cwd-'));
  return { bin, cwd };
}

test('a hidden session answers the bypass warning itself, whatever the owner\'s settings file says', { skip: !POSIX }, async () => {
  // Value: protects=job changes, hire checks and every other hidden check on an office whose ~/.claude/settings.json does not skip the bypass warning; fails_when=a hidden session starts without skipDangerousModePermissionPrompt in its own --settings, so the prompt's Enter picks "No, exit"; why_new=owner 2026-11-13, a pack update card failed on every try on such a Mac; seam=fake claude in a real PTY; no_claim=that real Claude Code reads the switch from --settings (verified live with 2.1.323, not here)
  const { bin, cwd } = fakeClaude();
  const env = { FAKE_DIR: projectDir(cwd) };
  for (const settingsJson of [JSON.stringify({ disableAllHooks: true }), undefined]) {
    const r = await runHiddenClaude('Say done.', { model: 'claude-sonnet-5', cwd, command: bin, noTools: true, settingsJson, env, bootCapMs: 2000, timeoutMs: 20_000, promptTakenMs: 8000 });
    assert.deepEqual(r, { ok: true, text: 'DONE' }, settingsJson ?? 'no caller settings');
  }
});

test('the caller\'s settings are kept beside the warning\'s answer', () => {
  // Value: protects=a check that turns off hooks keeps them off; fails_when=hiddenSettings drops the caller's keys or lets one turn the warning back on; why_new=hiddenSettings is new (2026-11-13); seam=none; no_claim=none beyond protects
  assert.deepEqual(JSON.parse(hiddenSettings(JSON.stringify({ disableAllHooks: true }))), { disableAllHooks: true, skipDangerousModePermissionPrompt: true, skipAutoPermissionPrompt: true });
  assert.deepEqual(JSON.parse(hiddenSettings(JSON.stringify({ skipDangerousModePermissionPrompt: false }))).skipDangerousModePermissionPrompt, true);
  assert.deepEqual(JSON.parse(hiddenSettings()), { skipDangerousModePermissionPrompt: true, skipAutoPermissionPrompt: true });
  assert.deepEqual(JSON.parse(hiddenSettings('not json')), { skipDangerousModePermissionPrompt: true, skipAutoPermissionPrompt: true });
});
