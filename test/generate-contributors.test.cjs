'use strict';

/**
 * CONTRIBUTORS.md is generated from pull requests. The "never got the merged
 * badge" section only appears when .github/contributors-extra.json lists
 * something, and the head count reads as English for one person or many.
 *
 * The generator calls the GitHub API at top level, so each case runs it in a
 * child process inside a temp folder with global fetch stubbed before it loads.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'generate-contributors.mjs');

const user = (login) => ({ login, html_url: `https://github.com/${login}`, type: 'User' });

function generate({ closed, single = {}, extra }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contributors-'));
  try {
    if (extra) {
      fs.mkdirSync(path.join(dir, '.github'));
      fs.writeFileSync(path.join(dir, '.github', 'contributors-extra.json'),
        JSON.stringify({ landed_without_merged_badge: extra }));
    }
    const stub = `
      const closed = ${JSON.stringify(closed)};
      const single = ${JSON.stringify(single)};
      globalThis.fetch = async (url) => {
        const u = new URL(url);
        let body;
        const m = u.pathname.match(/\\/pulls\\/(\\d+)$/);
        if (m) body = single[m[1]];
        else body = u.searchParams.get('page') === '1' ? closed : [];
        if (body === undefined) return { ok: false, status: 404, text: async () => 'stub miss ' + url };
        return { ok: true, json: async () => body };
      };
    `;
    const stubPath = path.join(dir, 'stub-fetch.mjs');
    fs.writeFileSync(stubPath, stub);
    return execFileSync(process.execPath, ['--import', `file://${stubPath}`, SCRIPT], {
      cwd: dir,
      env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo', GH_TOKEN: '', GITHUB_TOKEN: '' },
      stdio: 'pipe'
    }) && fs.readFileSync(path.join(dir, 'CONTRIBUTORS.md'), 'utf8');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('one contributor and nothing unbadged: singular wording, no dagger section', () => {
  const out = generate({
    closed: [
      { merged_at: '2026-09-01T00:00:00Z', user: user('alice') },
      { merged_at: '2026-09-02T00:00:00Z', user: user('alice') },
      { merged_at: null, user: user('bob') },
      { merged_at: '2026-09-03T00:00:00Z', user: { login: 'dependabot[bot]', type: 'Bot' } }
    ],
    extra: []
  });
  assert.match(out, /\*\*1 person\*\* has contributed so far\./);
  assert.match(out, /_2 pull requests from 1 person\._/);
  assert.doesNotMatch(out, /never got the merged badge/);
  assert.doesNotMatch(out, /†/, 'no dagger on rows when nothing is unbadged');
  assert.match(out, /\| \[@alice\]\(https:\/\/github\.com\/alice\) \| 2 \| 2026-09-01 \| 2026-09-02 \|/);
  assert.match(out, /from 1 person\._\n\n---\n/, 'the rule follows the tally directly');
});

test('an unbadged pull request listed in extra: plural wording and the dagger section', () => {
  const out = generate({
    closed: [{ merged_at: '2026-09-01T00:00:00Z', user: user('alice') }],
    single: { 7: { merged_at: null, closed_at: '2026-09-05T00:00:00Z', user: user('bob') } },
    extra: [{ pr: 7, commits: ['abc1234'], note: 'landed by hand.' }]
  });
  assert.match(out, /\*\*2 people\*\* have contributed so far\./);
  assert.match(out, /_2 pull requests from 2 people\._/);
  assert.match(out, /## † Contributions that never got the merged badge/);
  assert.match(out, /The pull request below is in main and its author is a contributor, but GitHub shows it\nas closed/);
  assert.match(out, /\| \[#7\]\(https:\/\/github\.com\/owner\/repo\/pull\/7\) \| \[@bob\]\(https:\/\/github\.com\/bob\) \| \[`abc1234`\]/);
  assert.match(out, /\*\*#7\*\* landed by hand\./);
  assert.match(out, /\[@bob\]\(https:\/\/github\.com\/bob\) †/);
});

test('several unbadged pull requests: plural wording, sorted by number, notes only where given', () => {
  const out = generate({
    closed: [],
    single: {
      7: { merged_at: null, closed_at: '2026-09-05T00:00:00Z', user: user('bob') },
      9: { merged_at: null, closed_at: '2026-09-06T00:00:00Z', user: user('carol') }
    },
    extra: [{ pr: 9, commits: ['ccc3333'] }, { pr: 7, commits: ['aaa1111', 'bbb2222'], note: 'two commits.' }]
  });
  assert.match(out, /The 2 pull requests below are in main and their authors are contributors, but GitHub shows them\nas closed/);
  assert.ok(out.indexOf('| [#7]') < out.indexOf('| [#9]'), '#7 is listed before #9');
  assert.match(out, /\[`aaa1111`\]\([^)]*\), \[`bbb2222`\]/);
  assert.doesNotMatch(out, /\*\*#9\*\*/, 'no note line for an entry without a note');
  assert.doesNotMatch(out, /\n\n\n/, 'no run of blank lines');
});

test('no extra file at all: renders without the dagger section', () => {
  const out = generate({ closed: [{ merged_at: '2026-09-01T00:00:00Z', user: user('alice') }] });
  assert.doesNotMatch(out, /never got the merged badge/);
});

test('an extra entry that GitHub now shows as merged stops the run', () => {
  assert.throws(
    () => generate({
      closed: [],
      single: { 7: { merged_at: '2026-09-05T00:00:00Z', user: user('bob') } },
      extra: [{ pr: 7, commits: ['abc1234'] }]
    }),
    (err) => /#7 is merged on GitHub now/.test(String(err.stderr))
  );
});
