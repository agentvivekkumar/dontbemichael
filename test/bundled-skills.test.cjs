'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

function skill(source, name, revision = 'shipped') {
  const dir = path.join(source, name);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${revision} routine\n---\n\n# ${revision}\n`);
  fs.writeFileSync(path.join(dir, 'scripts', 'report.cjs'), 'console.log(JSON.stringify({ ready: true }));\n');
  return dir;
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-bundled-skills-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'App Home');
  const userHome = path.join(dir, 'User Home');
  const cwd = path.join(dir, 'Business Folder');
  const source = path.join(dir, 'App Resources', 'skills');
  fs.mkdirSync(userHome, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  skill(source, 'weekly-report');
  t.mock.method(os, 'homedir', () => userHome);
  const hive = new HiveManager(() => home);
  const start = (provider = 'codex', id = 'worker', options = {}) => hive.ensureAgent(
    { id, name: id, provider, cwd: options.cwd ?? cwd },
    { skillsDir: options.source ?? source }
  );
  return { dir, home, cwd, source, hive, start, native: path.join(cwd, '.agents', 'skills') };
}

function runHelper(cwd, skillDir) {
  const result = spawnSync(process.execPath, [path.join(skillDir, 'scripts', 'report.cjs')], {
    cwd, encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ready: true });
}

function disableNativeLinks(t, cwd) {
  const original = fs.symlinkSync;
  const root = path.join(cwd, '.agents') + path.sep;
  t.mock.method(fs, 'symlinkSync', (target, destination, type) => {
    if (destination.startsWith(root)) {
      throw Object.assign(new Error('links unavailable'), { code: 'EPERM' });
    }
    return original(target, destination, type);
  });
}

test('Codex and Gemini discover bundled skills in their working folder; other providers stay unchanged', async (t) => {
  for (const provider of ['codex', 'gemini', 'claude', 'custom']) {
    await t.test(provider, async (t) => {
      const { cwd, source, native, start } = setup(t);
      const injection = await start(provider);
      const privateSkill = path.join(injection.env.AGENT_DIR, '.claude', 'skills', 'weekly-report');
      assert.equal(fs.readFileSync(path.join(privateSkill, 'SKILL.md'), 'utf8'),
        fs.readFileSync(path.join(source, 'weekly-report', 'SKILL.md'), 'utf8'));
      if (provider === 'codex' || provider === 'gemini') {
        const exposed = path.join(native, 'weekly-report');
        assert.equal(fs.realpathSync(exposed), fs.realpathSync(path.join(source, 'weekly-report')));
        runHelper(cwd, exposed);
      } else {
        assert.equal(fs.existsSync(native), false);
      }
    });
  }
});

test('shared and repeated worker starts leave skills usable after a private worker folder is removed', async (t) => {
  const { cwd, source, native, start } = setup(t);
  fs.mkdirSync(native, { recursive: true });
  fs.mkdirSync(path.join(cwd, '.gemini'));
  fs.symlinkSync(native, path.join(cwd, '.gemini', 'skills'), LINK_TYPE);
  const first = await start('codex', 'first');
  const exposed = path.join(native, 'weekly-report');
  const target = fs.readlinkSync(exposed);
  await start('gemini', 'second');
  assert.equal(fs.readlinkSync(exposed), target);
  await start('codex', 'first');
  assert.equal(fs.readlinkSync(exposed), target);
  fs.rmSync(first.env.AGENT_DIR, { recursive: true, force: true });
  assert.equal(fs.realpathSync(exposed), fs.realpathSync(path.join(source, 'weekly-report')));
  runHelper(cwd, exposed);
});

test('owner directories, files, live links and broken links at bundled names remain untouched', async (t) => {
  const { dir, source, native, start } = setup(t);
  fs.mkdirSync(native, { recursive: true });
  const ownedDir = path.join(native, 'weekly-report');
  fs.mkdirSync(ownedDir);
  fs.writeFileSync(path.join(ownedDir, 'SKILL.md'), 'owner routine');
  skill(source, 'owner-file');
  const ownedFile = path.join(native, 'owner-file');
  fs.writeFileSync(ownedFile, 'owner file');
  skill(source, 'owner-link');
  const linkTarget = skill(path.join(dir, 'Owner Skills'), 'custom');
  const liveLink = path.join(native, 'owner-link');
  fs.symlinkSync(linkTarget, liveLink, LINK_TYPE);
  skill(source, 'broken-link');
  const brokenLink = path.join(native, 'broken-link');
  fs.symlinkSync(path.join(dir, 'missing owner skill'), brokenLink, LINK_TYPE);
  const liveTarget = fs.readlinkSync(liveLink);
  const brokenTarget = fs.readlinkSync(brokenLink);

  await start();
  await start('gemini');

  assert.equal(fs.lstatSync(ownedDir).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(ownedDir, 'SKILL.md'), 'utf8'), 'owner routine');
  assert.equal(fs.readFileSync(ownedFile, 'utf8'), 'owner file');
  assert.equal(fs.readlinkSync(liveLink), liveTarget);
  assert.equal(fs.readFileSync(path.join(liveLink, 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(linkTarget, 'SKILL.md'), 'utf8'));
  assert.equal(fs.readlinkSync(brokenLink), brokenTarget);
});

test('Gemini owner skills take precedence by declared name, including when added after app provisioning', async (t) => {
  const { dir, cwd, native, start } = setup(t);
  const legacy = skill(path.join(cwd, '.gemini', 'skills'), 'owner-folder');
  const contents = "---\nname: 'weekly-report' # owner routine\ndescription: Owner routine\n---\n\nOwner procedure\n";
  fs.writeFileSync(path.join(legacy, 'SKILL.md'), contents);
  const exposed = path.join(native, 'weekly-report');

  await start('gemini');
  assert.equal(fs.existsSync(exposed), false);
  assert.equal(fs.readFileSync(path.join(legacy, 'SKILL.md'), 'utf8'), contents);

  const moved = path.join(dir, 'Owner Skill Backup');
  fs.renameSync(legacy, moved);
  await start('codex');
  assert.equal(fs.existsSync(exposed), true);
  fs.renameSync(moved, legacy);
  await start('gemini');

  assert.throws(() => fs.lstatSync(exposed), { code: 'ENOENT' });
  assert.equal(fs.readFileSync(path.join(legacy, 'SKILL.md'), 'utf8'), contents);
});

test('app relocation updates managed links and removes retired skills while preserving owner replacements', async (t) => {
  const { dir, source, native, start } = setup(t);
  skill(source, 'retired');
  skill(source, 'owner-replaced');
  await start();
  const replaced = path.join(native, 'owner-replaced');
  fs.unlinkSync(replaced);
  fs.mkdirSync(replaced);
  fs.writeFileSync(path.join(replaced, 'SKILL.md'), 'owner replacement');
  const moved = path.join(dir, 'Moved App Resources', 'skills');
  fs.mkdirSync(path.dirname(moved), { recursive: true });
  fs.renameSync(source, moved);
  skill(moved, 'weekly-report', 'updated');
  fs.rmSync(path.join(moved, 'retired'), { recursive: true });

  await start('gemini', 'worker', { source: moved });

  assert.equal(fs.realpathSync(path.join(native, 'weekly-report')),
    fs.realpathSync(path.join(moved, 'weekly-report')));
  assert.equal(fs.readFileSync(path.join(native, 'weekly-report', 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(moved, 'weekly-report', 'SKILL.md'), 'utf8'));
  assert.throws(() => fs.lstatSync(path.join(native, 'retired')), { code: 'ENOENT' });
  assert.equal(fs.readFileSync(path.join(replaced, 'SKILL.md'), 'utf8'), 'owner replacement');
});

test('redirected native roots do not modify the owner shared skills folder', async (t) => {
  for (const root of ['.agents', path.join('.agents', 'skills')]) {
    await t.test(root, async (t) => {
      const { dir, cwd, start } = setup(t);
      const external = path.join(dir, 'Owner Shared Folder');
      fs.mkdirSync(external);
      fs.writeFileSync(path.join(external, 'owner.txt'), 'owner contents');
      const destination = path.join(cwd, root);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(external, destination, LINK_TYPE);
      const target = fs.readlinkSync(destination);

      await start();

      assert.equal(fs.readlinkSync(destination), target);
      assert.deepEqual(fs.readdirSync(external), ['owner.txt']);
      assert.equal(fs.readFileSync(path.join(external, 'owner.txt'), 'utf8'), 'owner contents');
    });
  }
});

test('absent bundles and invalid working folders do not block worker startup or create native skills', async (t) => {
  const { dir, cwd, native, source, start } = setup(t);
  await start('gemini', 'missing-source', { source: path.join(dir, 'missing skills') });
  assert.equal(fs.existsSync(native), false);
  const emptySource = path.join(dir, 'Empty Resources');
  fs.mkdirSync(path.join(emptySource, 'not-a-skill'), { recursive: true });
  await start('gemini', 'empty-source', { source: emptySource });
  assert.equal(fs.existsSync(path.join(native, 'not-a-skill')), false);
  await start('gemini', 'relative-cwd', { cwd: path.relative(process.cwd(), cwd), source });
  assert.equal(fs.existsSync(path.join(native, 'weekly-report')), false);
  const missingCwd = path.join(dir, 'missing business folder');
  await start('gemini', 'missing-cwd', { cwd: missingCwd });
  assert.equal(fs.existsSync(missingCwd), false);
});

test('unavailable links fall back to complete copies, refreshing pristine copies but preserving owner edits', async (t) => {
  const { cwd, source, native, start } = setup(t);
  skill(source, 'edited-report');
  disableNativeLinks(t, cwd);

  await start('gemini');
  const copied = path.join(native, 'weekly-report');
  const edited = path.join(native, 'edited-report', 'SKILL.md');
  assert.equal(fs.lstatSync(copied).isSymbolicLink(), false);
  runHelper(cwd, copied);
  fs.writeFileSync(edited, 'owner edited routine');
  skill(source, 'weekly-report', 'updated');
  skill(source, 'edited-report', 'updated');

  await start('gemini');

  assert.equal(fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(source, 'weekly-report', 'SKILL.md'), 'utf8'));
  assert.equal(fs.readFileSync(edited, 'utf8'), 'owner edited routine');
});

test('a failed ownership save does not leave an unusable skill after the app moves', async (t) => {
  const { dir, cwd, source, native, start } = setup(t);
  const atomic = loadTs('src/main/atomicFile.ts');
  const original = atomic.writeFileAtomic;
  const root = path.join(cwd, '.agents') + path.sep;
  const save = t.mock.method(atomic, 'writeFileAtomic', (destination, ...args) => {
    if (destination.startsWith(root)) {
      throw Object.assign(new Error('ownership save failed'), { code: 'ENOSPC' });
    }
    return original(destination, ...args);
  });
  await start('gemini');
  save.mock.restore();
  const moved = path.join(dir, 'Moved Skills');
  fs.renameSync(source, moved);

  await start('gemini', 'worker', { source: moved });

  const exposed = path.join(native, 'weekly-report');
  assert.equal(fs.realpathSync(exposed), fs.realpathSync(path.join(moved, 'weekly-report')));
  runHelper(cwd, exposed);
});

test('a failed fallback copy refresh preserves the previous working routine', async (t) => {
  const { cwd, source, native, start } = setup(t);
  disableNativeLinks(t, cwd);
  await start('gemini');
  const copied = path.join(native, 'weekly-report');
  const previous = fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8');
  skill(source, 'weekly-report', 'updated');
  const bundle = fs.realpathSync(source);
  const original = fs.cpSync;
  t.mock.method(fs, 'cpSync', (from, ...args) => {
    if (from === bundle || from.startsWith(bundle + path.sep)) {
      throw Object.assign(new Error('copy refresh failed'), { code: 'ENOSPC' });
    }
    return original(from, ...args);
  });

  await start('gemini');

  assert.equal(fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8'), previous);
  runHelper(cwd, copied);
});
