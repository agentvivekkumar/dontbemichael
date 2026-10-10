'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

function skill(source, name, revision = 'shipped') {
  const dir = path.join(source, name);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${revision} routine\n---\n\n# ${revision}\n`);
  fs.writeFileSync(path.join(dir, 'scripts', 'report.cjs'), `console.log(${JSON.stringify(revision)});\n`);
  return dir;
}

function contents(dir) {
  return Object.fromEntries(fs.readdirSync(dir).sort().map((name) => {
    const file = path.join(dir, name);
    return [name, fs.statSync(file).isDirectory() ? contents(file) : fs.readFileSync(file, 'utf8')];
  }));
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
  const start = (provider = 'codex', id = 'worker') => hive.ensureAgent(
    { id, name: id, provider, cwd }, { skillsDir: source }
  );
  return { cwd, source, hive, start };
}

test('Codex workers receive complete bundled skills in their private CODEX_HOME', async (t) => {
  const { source, hive, start } = setup(t);
  const injection = await start();

  assert.equal(injection.env.CODEX_HOME, path.join(hive.agentDir('worker'), '.codex'));
  assert.deepEqual(contents(path.join(injection.env.CODEX_HOME, 'skills')), contents(source));
  // Bundled commands still resolve their resources through AGENT_DIR.
  assert.deepEqual(contents(path.join(injection.env.AGENT_DIR, '.claude', 'skills')), contents(source));
});

test('Codex restarts refresh bundled skills, preserve existing skills and keep worker homes separate', async (t) => {
  const { source, hive, start } = setup(t);
  const privateSkills = path.join(hive.agentDir('worker'), '.codex', 'skills');
  const system = skill(path.join(privateSkills, '.system'), 'skill-creator', 'builtin');
  const custom = skill(privateSkills, 'custom-report', 'custom');
  const systemBefore = contents(system);
  const customBefore = contents(custom);
  const first = await start();
  const second = await start('codex', 'second');
  const secondBefore = contents(path.join(second.env.CODEX_HOME, 'skills'));
  assert.notEqual(first.env.CODEX_HOME, second.env.CODEX_HOME);

  skill(source, 'weekly-report', 'updated');
  const restart = await start();

  assert.equal(restart.env.CODEX_HOME, first.env.CODEX_HOME);
  assert.deepEqual(contents(path.join(privateSkills, 'weekly-report')), contents(path.join(source, 'weekly-report')));
  assert.deepEqual(contents(system), systemBefore);
  assert.deepEqual(contents(custom), customBefore);
  assert.deepEqual(contents(path.join(second.env.CODEX_HOME, 'skills')), secondBefore);
});

test('only Codex receives the private skill copy and every provider leaves the user working folder untouched', async (t) => {
  for (const provider of ['codex', 'claude', 'gemini', 'custom']) {
    await t.test(provider, async (t) => {
      const { cwd, source, hive, start } = setup(t);
      fs.writeFileSync(path.join(cwd, 'sales.csv'), 'total\n665\n');
      skill(path.join(cwd, '.agents', 'skills'), 'owner-report', 'owner');
      skill(path.join(cwd, '.gemini', 'skills'), 'owner-report', 'owner');
      const before = contents(cwd);

      const injection = await start(provider);

      assert.deepEqual(contents(cwd), before);
      const codexSkills = path.join(hive.agentDir('worker'), '.codex', 'skills');
      assert.equal(fs.existsSync(codexSkills), provider === 'codex');
      if (provider !== 'codex') assert.equal(injection.env.CODEX_HOME, undefined);
      assert.deepEqual(contents(path.join(injection.env.AGENT_DIR, '.claude', 'skills')), contents(source));
    });
  }
});
