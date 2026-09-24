'use strict';

/**
 * Standing rule from the owner (2026-09-23): no dashes in user-facing content.
 * No em dash, no en dash, and no hyphen used as punctuation or to join words
 * ("follow-up" reads as "follow up"). The product is for small business owners,
 * and dashes read as machine-written. Rephrase with a comma, colon, period or
 * parentheses; never swap the character blindly.
 *
 * Covered: every UI string in all three languages, every shipped Office Pack,
 * the text built in code that the owner reads (an agent's card and standing
 * goal), and the user-facing code (components, the IDE and markdown views,
 * floor speech, update and setup copy, error reasons shown in the app).
 *
 * Deliberately NOT covered: instructions written for the AI agents themselves
 * (hive.ts, the voice model's prompts, closing-time and heartbeat protocols),
 * developer logs, and code comments. Those are not user-facing.
 *
 * Code that must MATCH a dash in content writes it as \u2014 rather than the
 * literal character, so a literal dash in user-facing code is always a mistake.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
/** Hyphen, figure dash, en dash, em dash, horizontal bar, minus sign, and small/fullwidth hyphens. */
const DASH = /[\u002D\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/;

/**
 * Names the user must type or recognise exactly, where the hyphen IS the name.
 * Anything added here needs a reason: it is a hole in the rule.
 */
const IDENTIFIERS = [
  'whisper-large-v3-turbo', // Groq model id, chosen in Settings → Voice
  'whisper-large-v3',
  'x-md-webhook-secret', // the HTTP header a webhook caller must send
  'abubakarsiddik31/claude-skills-collection' // the GitHub repo the skills list comes from
];
const withoutIdentifiers = (s) => IDENTIFIERS.reduce((t, id) => t.split(id).join(''), s);

test('no shipped Office Pack puts a dash in anything the owner reads', () => {
  const dir = path.join(root, 'resources/packs');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const texts = [
      ['displayName', p.displayName], ['tagline', p.tagline],
      ...p.agents.flatMap((a) => [
        [`${a.id}.role`, a.role], [`${a.id}.summary`, a.summary], [`${a.id}.firstAction`, a.firstAction],
        ...a.does.map((d, i) => [`${a.id}.does[${i}]`, d]),
        ...a.wontDo.map((d, i) => [`${a.id}.wontDo[${i}]`, d])
      ])
    ];
    for (const [where, t] of texts) {
      if (typeof t === 'string') assert.doesNotMatch(t, DASH, `${f} ${where}: ${t}`);
    }
  }
});

for (const locale of ['en', 'zh-CN', 'ar']) {
  test(`no UI string in the whole app has a dash (${locale})`, () => {
    const d = JSON.parse(fs.readFileSync(path.join(root, `src/renderer/src/i18n/locales/${locale}.json`), 'utf8'));
    let checked = 0;
    (function walk(o, p) {
      for (const [k, v] of Object.entries(o)) {
        const key = p ? `${p}.${k}` : k;
        if (typeof v === 'string') {
          checked++;
          assert.doesNotMatch(withoutIdentifiers(v), DASH, `${locale} ${key}: ${v}`);
        } else walk(v, key);
      }
    })(d, '');
    assert.ok(checked > 1000, `sanity: only ${checked} strings found`);
  });
}

test('an agent\'s card and standing goal, as the owner sees them, have no dashes', () => {
  const { teamMemberRole, teamMemberGoal } = loadTs('src/shared/teamPlan.ts');
  const dir = path.join(root, 'resources/packs');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    for (const a of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).agents) {
      assert.doesNotMatch(teamMemberRole(a), DASH, `${f} ${a.id} card`);
      assert.doesNotMatch(teamMemberGoal(a, { name: 'Pho Saigon Kitchen', city: 'Austin, TX' }), DASH, `${f} ${a.id} goal`);
    }
  }
});

/** User-facing code. Whole directories where possible, so a new file is covered by default. */
const UI_CODE = [
  'src/renderer/src/components',
  'src/renderer/src/ide',
  'src/renderer/src/markdown',
  'src/renderer/src/scene/office/cafeteriaLines.ts',
  'src/renderer/src/hooks/useRestoreTeam.ts',
  ...['updateState', 'toolCatalog', 'releaseDrop', 'claudeCommands', 'codexCommands', 'hire', 'integrations',
    'manifestFields', 'ossModels', 'imageTypes', 'triggers', 'agentDefinition', 'officePack', 'officeRoles',
    'teamPlan', 'businessProfile'].map((f) => `src/shared/${f}.ts`),
  ...['docText', 'docTextCli', 'agentFolders', 'skills', 'git', 'webhook', 'control', 'breaker', 'hooks',
    'cliInstall', 'realtime', 'harnessGuard', 'packs'].map((f) => `src/main/${f}.ts`)
];

function codeFiles(entry) {
  const abs = path.join(root, entry);
  if (!fs.statSync(abs).isDirectory()) return [abs];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? codeFiles(path.join(entry, e.name))
      : /\.(tsx?|cjs)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [path.join(abs, e.name)] : []);
}

test('user-facing code carries no em or en dash', () => {
  // Comments are for developers; blank them (keeping line numbers). Developer
  // logs are skipped. Hyphens can't be judged in code (CSS, identifiers,
  // regexes), so this checks the two characters that only ever appear in prose.
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  let files = 0;
  for (const entry of UI_CODE) {
    for (const f of codeFiles(entry)) {
      files++;
      stripComments(fs.readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        if (/console\.(log|warn|error|info|debug)/.test(line)) return;
        assert.doesNotMatch(line, /[\u2013\u2014]/, `${path.relative(root, f)}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.ok(files > 50, `sanity: only ${files} files scanned`);
});
