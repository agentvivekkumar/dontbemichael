'use strict';

/**
 * Agent memory that improves instead of piling up (owner, 2026-09-25):
 *  - memory.md is an index of one-line entries only the app writes;
 *  - agents add notes to memory/inbox.md;
 *  - a background tidy-up on Haiku turns notes into itemised changes (never a
 *    whole-file rewrite), archives what it replaces, writes procedures;
 *  - nothing is forgotten for being unused.
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

const mi = loadTs('src/shared/memoryIndex.ts');
const { MemoryTidy, extractJson } = loadTs('src/main/memoryTidy.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const e = (id, kind, text, source = 'task', date = '2026-09-01', expires) => ({ id, kind, text, source, date, ...(expires ? { expires } : {}) });

test('an index round-trips, and an older free-form file is recognised as not one', () => {
  const entries = [e('m1', 'preference', 'Weekly money summary goes out Monday 9am', 'owner'), e('m2', 'fact', 'Supplier cutoff is Thursday noon', 'task', '2026-09-02', '2026-12-31')];
  const text = mi.renderIndex('Oscar', 'oscar', entries);
  assert.deepEqual(mi.parseIndex(text), { isIndex: true, entries });
  assert.equal(mi.parseIndex('# Memory — Oscar (oscar)\n\n## 2026-09-24 — Closing time\n- State: idle').isIndex, false);
  assert.match(mi.entryLine(entries[1]), /\| expires 2026-12-31$/);
});

test('notes: each bullet or paragraph is one; the old header is not a note', () => {
  assert.deepEqual(mi.parseInbox('- one\n- two\n  continued\n\nthree'), ['one', 'two continued', 'three']);
  assert.deepEqual(mi.legacyNotes('# Memory — Oscar (oscar)\n\n_Append durable facts, decisions, and context below._\n\n## 2026-09-24 — Closing time\n- State: idle'), ['State: idle']);
});

test('the model\'s ops are checked: unknown ids, kinds and ops are dropped, text stays one line', () => {
  const entries = [e('m1', 'fact', 'a')];
  const ops = mi.validateOps({ ops: [
    { op: 'add', kind: 'fact', text: 'x | y\nz', source: 'owner' },
    { op: 'add', kind: 'secret', text: 'no' },
    { op: 'update', id: 'm9', text: 'no' },
    { op: 'delete', id: 'm1', reason: 'wrong' },
    { op: 'rewrite', text: 'everything' },
    { op: 'procedure', name: 'Weekly money summary', steps: '1. a\n2. b' }
  ] }, entries);
  assert.deepEqual(ops.map((o) => o.op), ['add', 'delete', 'procedure']);
  assert.equal(ops[0].text, 'x / y z');
});

test('changes are itemised: add, update, delete, procedure; replaced entries are archived', () => {
  const entries = [e('m1', 'fact', 'Price list is v1'), e('m2', 'preference', 'Summaries in bullet points', 'owner')];
  const out = mi.applyOps(entries, [
    { op: 'update', id: 'm1', text: 'Price list is v2' },
    { op: 'update', id: 'm2', repeat: true },
    { op: 'add', kind: 'reference', text: 'Invoices live in Finance/Invoices', source: 'task' },
    { op: 'procedure', name: 'Weekly money summary', steps: '1. a', source: 'task' }
  ], '2026-09-25');
  assert.deepEqual(out.entries.map((x) => x.id), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(out.entries[0].text, 'Price list is v2');
  assert.deepEqual(out.archived.map((a) => a.entry.text), ['Price list is v1'], 'the replaced fact is kept in the archive');
  assert.equal(out.procedures[0].slug, 'weekly-money-summary');
  assert.equal(out.entries[3].text, 'Weekly money summary: steps in memory/procedures/weekly-money-summary.md');
  assert.deepEqual(out.stats, { added: 1, updated: 2, deleted: 0, procedures: 1, repeats: 1 });
  const del = mi.applyOps(out.entries, [{ op: 'delete', id: 'm3', reason: 'moved' }], '2026-09-26');
  assert.equal(del.entries.length, 3);
  assert.match(mi.archiveLines(del.archived, '2026-09-26'), /archived 2026-09-26: moved$/);
});

function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md memtidy-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dir = path.join(home, 'hive', 'agents', 'oscar');
  fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
  const log = [];
  let idle = false;
  const tidy = new MemoryTidy(() => home, () => 'claude', () => ({}), () => idle, () => 'Oscar', (ev) => log.push(ev));
  const asked = [];
  let reply = { ops: [] };
  tidy.askModel = async (_home, entries, notes) => { asked.push({ entries, notes }); return reply; };
  return { home, dir, tidy, log, asked, setReply: (r) => { reply = r; }, setIdle: (v) => { idle = v; } };
}

for (const [label, names] of [
  ['Chinese', ['客户退款流程', '供应商付款流程']],
  ['Arabic', ['إجراءات الاسترداد', 'إجراءات الدفع']],
  ['long names', ['x'.repeat(150) + ' refunds', 'x'.repeat(150) + ' payments']],
  ['readable names', ['Send invoices', 'Send-invoices']]
]) {
  test(`colliding procedures keep separate files and stable identities: ${label}`, async (t) => {
    // Value: protects=distinct learned workflows survive tidying and later updates; fails_when=lossy filenames or truncated index labels merge identities; why_new=only one procedure was covered; seam=model response
    const f = office(t);
    const indexPath = path.join(f.dir, 'memory.md');
    const inboxPath = path.join(f.dir, 'memory', 'inbox.md');
    const proceduresDir = path.join(f.dir, 'memory', 'procedures');
    fs.writeFileSync(indexPath, mi.renderIndex('Oscar', 'oscar', []));
    const op = (i, version) => ({ op: 'procedure', name: names[i], steps: `1. Workflow ${i}, version ${version}`, source: 'owner' });
    const run = async (ops) => {
      fs.writeFileSync(inboxPath, '- Keep these workflows.\n');
      f.setReply({ ops });
      const [result] = await f.tidy.tidyNow('oscar');
      assert.equal(result.tidied, true);
      return mi.parseIndex(fs.readFileSync(indexPath, 'utf8')).entries;
    };
    let entries = await run([op(0, 1), op(1, 1)]);
    assert.equal(entries.length, 2, 'neither procedure replaces the other');
    const originalIds = entries.map((entry) => entry.id);
    const slugs = entries.map((entry) => mi.procedurePointer(entry.text).slug);
    assert.equal(new Set(slugs).size, 2);
    assert.equal(slugs[0], mi.procedureSlug(names[0]), 'the first readable path stays unchanged');
    const hive = new HiveManager(() => f.home);
    for (const [i, slug] of slugs.entries()) {
      assert.equal(mi.isProcedureSlug(slug), true);
      assert.ok(slug.length <= 60);
      assert.ok(hive.procedure('oscar', slug).startsWith(`# ${names[i]}\n`));
    }
    assert.equal(hive.procedure('oscar', '../memory'), null);
    assert.equal(hive.procedure('oscar', 'x'.repeat(61)), null);
    assert.equal(fs.existsSync(inboxPath), false, 'notes leave only after both procedures are saved');

    // Separate passes read the persisted full names, not just in-memory state.
    for (const i of [1, 0, 1, 0]) {
      entries = await run([op(i, 2)]);
      assert.deepEqual(entries.map((entry) => entry.id), originalIds);
      assert.deepEqual(entries.map((entry) => mi.procedurePointer(entry.text).slug), slugs);
      assert.match(hive.procedure('oscar', slugs[i]), new RegExp(`Workflow ${i}, version 2`));
      assert.match(hive.procedure('oscar', slugs[1 - i]), new RegExp(`Workflow ${1 - i}, version`));
    }
    assert.equal(fs.readdirSync(proceduresDir).length, 2, 'updates create no duplicate files');
  });
}

test('a procedure name cannot take another procedure\'s allocated suffix', () => {
  // Value: protects=generated suffixes stay reserved across later operations; fails_when=a later natural slug overwrites an allocated one; why_new=collisions can involve suffixed paths too; seam=none
  const names = ['客户退款流程', '供应商付款流程', 'procedure-2'];
  const ops = names.map((name) => ({ op: 'procedure', name, steps: `1. ${name}`, source: 'task' }));
  const first = mi.applyOps([], ops, '2026-10-13');
  assert.equal(new Set(first.procedures.map((p) => p.slug)).size, 3);
  const storedNames = new Map(first.procedures.map((p) => [p.slug, p.name]));
  const entries = mi.parseIndex(mi.renderIndex('Oscar', 'oscar', first.entries)).entries;
  const again = mi.applyOps(entries, ops.slice().reverse(), '2026-10-14', storedNames);
  assert.deepEqual(again.entries.map((e) => [e.id, e.text]), first.entries.map((e) => [e.id, e.text]));
  for (const p of again.procedures) assert.equal(storedNames.get(p.slug), p.name);
});

test('a name clipped at a space still updates the same stored procedure', async (t) => {
  // Value: protects=the existing name limit preserves identity at a whitespace boundary; fails_when=reading the heading trims a character retained by validation; why_new=long names can end mid-word or at a space; seam=model response
  const f = office(t);
  const indexPath = path.join(f.dir, 'memory.md');
  const inboxPath = path.join(f.dir, 'memory', 'inbox.md');
  fs.writeFileSync(indexPath, mi.renderIndex('Oscar', 'oscar', []));
  for (const version of [1, 2]) {
    fs.writeFileSync(inboxPath, '- Keep this workflow.\n');
    f.setReply({ ops: [{ op: 'procedure', name: 'x'.repeat(199) + ' refunds', steps: `1. Version ${version}` }] });
    assert.equal((await f.tidy.tidyNow('oscar'))[0].tidied, true);
    const entries = mi.parseIndex(fs.readFileSync(indexPath, 'utf8')).entries;
    assert.deepEqual(entries.map((e) => e.id), ['m1']);
    const slug = mi.procedurePointer(entries[0].text).slug;
    assert.match(new HiveManager(() => f.home).procedure('oscar', slug), new RegExp(`Version ${version}`));
  }
  assert.equal(fs.readdirSync(path.join(f.dir, 'memory', 'procedures')).length, 1);
});

test('the model receives full procedure names so truncated labels remain updatable', async (t) => {
  // Value: protects=the model can identify an existing long-named procedure; fails_when=only shortened labels reach the model and updates become new identities; why_new=the full names differ beyond the label limit; seam=headless model response
  const f = office(t);
  const names = ['x'.repeat(150) + ' refunds', 'x'.repeat(150) + ' payments'];
  const indexPath = path.join(f.dir, 'memory.md');
  const inboxPath = path.join(f.dir, 'memory', 'inbox.md');
  fs.writeFileSync(indexPath, mi.renderIndex('Oscar', 'oscar', []));
  fs.writeFileSync(inboxPath, '- Keep both workflows.\n');
  f.setReply({ ops: names.map((name) => ({ op: 'procedure', name, steps: '1. Original steps' })) });
  assert.equal((await f.tidy.tidyNow('oscar'))[0].tidied, true);
  const before = mi.parseIndex(fs.readFileSync(indexPath, 'utf8')).entries;
  assert.ok(names.every((name) => !fs.readFileSync(indexPath, 'utf8').includes(name)), 'the index alone cannot convey either full name');
  delete f.tidy.askModel;
  const hidden = loadTs('src/main/hiddenClaude.ts');
  const model = t.mock.method(hidden, 'runHiddenClaude', async (prompt, options) => {
    const section = prompt.split('--- STORED PROCEDURES ---\n')[1]?.split('\n\n')[0];
    assert.ok(section, 'the model needs the full-name lookup');
    const stored = section.split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(stored.map((p) => p.name).sort(), names.slice().sort());
    assert.equal(options.noTools, true);
    return { ok: true, text: JSON.stringify({ ops: [{ op: 'procedure', name: stored.find((p) => p.name.endsWith('payments')).name, steps: '1. Updated payment steps' }] }) };
  });
  fs.writeFileSync(inboxPath, '- Update the payment workflow.\n');
  assert.equal((await f.tidy.tidyNow('oscar'))[0].tidied, true);
  assert.equal(model.mock.callCount(), 1);
  const after = mi.parseIndex(fs.readFileSync(indexPath, 'utf8')).entries;
  assert.deepEqual(after.map((e) => [e.id, e.text]), before.map((e) => [e.id, e.text]));
  const hive = new HiveManager(() => f.home);
  assert.match(hive.procedure('oscar', mi.procedurePointer(after[0].text).slug), /Original steps/);
  assert.match(hive.procedure('oscar', mi.procedurePointer(after[1].text).slug), /Updated payment steps/);
});

for (const failure of ['procedure', 'index']) {
  test(`a failed ${failure} write keeps source notes and a retry preserves procedure identities`, async (t) => {
    // Value: protects=notes survive partial persistence and retries cannot overwrite the first saved workflow; fails_when=notes are removed early or an unindexed file is reused for another name; why_new=only model failures were tested; seam=model response and one failed rename
    const f = office(t);
    const indexPath = path.join(f.dir, 'memory.md');
    const memDir = path.join(f.dir, 'memory');
    const proceduresDir = path.join(memDir, 'procedures');
    const inboxPath = path.join(memDir, 'inbox.md');
    const notes = '- Keep refund steps.\n- Keep supplier payment steps.\n';
    const emptyIndex = mi.renderIndex('Oscar', 'oscar', []);
    fs.writeFileSync(indexPath, emptyIndex);
    fs.writeFileSync(inboxPath, notes);
    const ops = ['客户退款流程', '供应商付款流程'].map((name, i) => ({ op: 'procedure', name, steps: `1. Workflow ${i}`, source: 'owner' }));
    f.setReply({ ops });
    const rename = fs.renameSync;
    let procedureWrites = 0;
    const blocked = t.mock.method(fs, 'renameSync', (from, to) => {
      if (path.dirname(to) === proceduresDir) procedureWrites++;
      if ((failure === 'procedure' && path.dirname(to) === proceduresDir && procedureWrites === 2)
        || (failure === 'index' && to === indexPath)) throw new Error('simulated write failure');
      return rename(from, to);
    });
    const [failed] = await f.tidy.tidyNow('oscar');
    blocked.mock.restore();
    assert.equal(failed.tidied, false);
    assert.equal(failed.reason, 'write-failed');
    assert.equal(fs.readFileSync(inboxPath, 'utf8'), notes);
    assert.equal(fs.readFileSync(indexPath, 'utf8'), emptyIndex);
    assert.equal(fs.existsSync(path.join(memDir, 'state.json')), false, 'no success timestamp before persistence');
    const saved = fs.readdirSync(proceduresDir).filter((file) => file.endsWith('.md'));
    assert.equal(saved.length, failure === 'procedure' ? 1 : 2);
    const firstPath = path.join(proceduresDir, saved.find((file) => fs.readFileSync(path.join(proceduresDir, file), 'utf8').startsWith(`# ${ops[0].name}\n`)));
    const firstContent = fs.readFileSync(firstPath, 'utf8');

    // Reverse the reply on retry: the orphaned first file must keep its owner.
    f.setReply({ ops: ops.slice().reverse() });
    const [retried] = await f.tidy.tidyNow('oscar');
    assert.equal(retried.tidied, true);
    const entries = mi.parseIndex(fs.readFileSync(indexPath, 'utf8')).entries;
    assert.equal(entries.length, 2);
    assert.equal(fs.readFileSync(firstPath, 'utf8'), firstContent);
    for (const entry of entries) {
      const { name, slug } = mi.procedurePointer(entry.text);
      const original = ops.find((op) => op.name === name);
      assert.ok(original);
      assert.ok(fs.readFileSync(path.join(proceduresDir, `${slug}.md`), 'utf8').includes(original.steps));
    }
    assert.equal(fs.existsSync(inboxPath), false);
    assert.equal(fs.existsSync(path.join(memDir, 'inbox.processing.md')), false);
  });
}

test('an unreadable procedure identity keeps notes and the existing file untouched', async (t) => {
  // Value: protects=an incomplete procedure cannot be mistaken for another workflow; fails_when=tidy guesses an identity and overwrites its file; why_new=updates now consult stored full names; seam=model response
  const f = office(t);
  const memDir = path.join(f.dir, 'memory');
  const dir = path.join(memDir, 'procedures');
  const inbox = path.join(memDir, 'inbox.md');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(f.dir, 'memory.md'), mi.renderIndex('Oscar', 'oscar', []));
  fs.writeFileSync(path.join(dir, 'procedure.md'), 'incomplete procedure without a heading');
  fs.writeFileSync(inbox, '- Keep these steps.\n');
  f.setReply({ ops: [{ op: 'procedure', name: '客户退款流程', steps: '1. Refund', source: 'owner' }] });
  const [result] = await f.tidy.tidyNow('oscar');
  assert.equal(result.tidied, false);
  assert.equal(fs.readFileSync(inbox, 'utf8'), '- Keep these steps.\n');
  assert.equal(fs.readFileSync(path.join(dir, 'procedure.md'), 'utf8'), 'incomplete procedure without a heading');
});

test('an old free-form memory is migrated once: lessons kept, the original backed up', async (t) => {
  const f = office(t);
  fs.writeFileSync(path.join(f.dir, 'memory.md'), '# Memory — Oscar (oscar)\n\n_Append durable facts, decisions, and context below._\n\n## 2026-09-24 — Closing time\n- State: idle, nothing assigned.\n- scheduler is not an addressable agent.\n');
  f.setReply({ ops: [{ op: 'add', kind: 'fact', text: 'scheduler is not an addressable agent', source: 'task' }] });
  const [r] = await f.tidy.tidyNow();
  assert.equal(r.reason, 'migrated');
  assert.deepEqual(f.asked[0].notes, ['State: idle, nothing assigned.', 'scheduler is not an addressable agent.']);
  const idx = mi.parseIndex(fs.readFileSync(path.join(f.dir, 'memory.md'), 'utf8'));
  assert.equal(idx.isIndex, true);
  assert.deepEqual(idx.entries.map((x) => x.text), ['scheduler is not an addressable agent']);
  const backups = fs.readdirSync(path.join(f.home, 'hive', 'backups'));
  assert.equal(backups.length, 1, 'the original is backed up');
  assert.equal(f.log[0].kind, 'memory-tidy');
});

test('notes wait until there are 10, a day has passed, or the office is idle', async (t) => {
  const f = office(t);
  fs.writeFileSync(path.join(f.dir, 'memory.md'), mi.renderIndex('Oscar', 'oscar', []));
  fs.writeFileSync(path.join(f.dir, 'memory', 'state.json'), JSON.stringify({ lastTidyAt: Date.now() }));
  fs.writeFileSync(path.join(f.dir, 'memory', 'inbox.md'), '- one note\n');
  assert.deepEqual(await f.tidy.tidyNow(), [], 'one note, a busy office, tidied recently: wait');
  f.setIdle(true);
  const [r] = await f.tidy.tidyNow();
  assert.equal(r.tidied, true, 'the office went quiet');
  assert.equal(fs.existsSync(path.join(f.dir, 'memory', 'inbox.md')), false, 'processed notes leave the inbox');
});

test('if the model call fails, the notes go back into the inbox untouched', async (t) => {
  const f = office(t);
  fs.writeFileSync(path.join(f.dir, 'memory.md'), mi.renderIndex('Oscar', 'oscar', []));
  fs.writeFileSync(path.join(f.dir, 'memory', 'inbox.md'), Array.from({ length: 10 }, (_, i) => `- note ${i}`).join('\n'));
  f.tidy.askModel = async () => { throw new Error('offline'); };
  const [r] = await f.tidy.tidyNow();
  assert.equal(r.tidied, false);
  assert.equal(mi.parseInbox(fs.readFileSync(path.join(f.dir, 'memory', 'inbox.md'), 'utf8')).length, 10);
  assert.equal(f.log[0].kind, 'memory-tidy-abort');
});

test('a reply without a list of changes puts the notes back', async (t) => {
  const f = office(t);
  fs.writeFileSync(path.join(f.dir, 'memory.md'), mi.renderIndex('Oscar', 'oscar', []));
  fs.writeFileSync(path.join(f.dir, 'memory', 'inbox.md'), Array.from({ length: 10 }, (_, i) => `- note ${i}`).join('\n'));
  f.setReply({ op: 'add', kind: 'fact', text: 'x', source: 'task' });
  const [r] = await f.tidy.tidyNow();
  assert.equal(r.tidied, false);
  assert.equal(mi.parseInbox(fs.readFileSync(path.join(f.dir, 'memory', 'inbox.md'), 'utf8')).length, 10);
});

test('a replaced procedure is backed up, and a long name keeps its path', async (t) => {
  const f = office(t);
  fs.writeFileSync(path.join(f.dir, 'memory.md'), mi.renderIndex('Oscar', 'oscar', []));
  fs.mkdirSync(path.join(f.dir, 'memory', 'procedures'), { recursive: true });
  const name = 'Weekly summary';
  const slug = mi.procedureSlug(name);
  const oldProcedure = `# ${name}\n\nold steps\n`;
  fs.writeFileSync(path.join(f.dir, 'memory', 'procedures', `${slug}.md`), oldProcedure);
  fs.writeFileSync(path.join(f.dir, 'memory', 'inbox.md'), Array.from({ length: 10 }, (_, i) => `- note ${i}`).join('\n'));
  f.setReply({ ops: [{ op: 'procedure', name, steps: '1. new', source: 'task' }] });
  await f.tidy.tidyNow();
  const stamp = fs.readdirSync(path.join(f.home, 'hive', 'backups'))[0];
  assert.equal(fs.readFileSync(path.join(f.home, 'hive', 'backups', stamp, 'oscar', 'procedures', `${slug}.md`), 'utf8'), oldProcedure);
  const long = 'x'.repeat(190);
  const a = mi.applyOps([], [{ op: 'procedure', name: long, steps: '1. a', source: 'task' }], '2026-09-25');
  const b = mi.applyOps(a.entries, [{ op: 'procedure', name: long, steps: '1. b', source: 'task' }], '2026-09-25', new Map(a.procedures.map((p) => [p.slug, p.name])));
  assert.equal(b.entries.length, 1, 'updated in place, not duplicated');
  assert.match(b.entries[0].text, /memory\/procedures\/.+\.md$/);
});

test('JSON is found in a fenced or chatty reply', () => {
  assert.deepEqual(extractJson('Here:\n```json\n{"ops":[]}\n```'), { ops: [] });
  assert.equal(extractJson('nothing'), undefined);
});

test('a new agent starts with an empty index, and the index reaches it once per session', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-memidx-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home });
  const file = path.join(home, 'hive', 'agents', 'oscar', 'memory.md');
  assert.equal(mi.parseIndex(fs.readFileSync(file, 'utf8')).isIndex, true);
  assert.equal(hive.memoryIndexFor('oscar'), null, 'nothing to give yet');
  fs.writeFileSync(file, mi.renderIndex('Oscar', 'oscar', [e('m1', 'preference', 'Bullet points please', 'owner')]));
  assert.match(hive.memoryIndexFor('oscar'), /^YOUR MEMORY\.[\s\S]*- \[m1\] preference \| Bullet points please \| owner/);
  const hooks = fs.readFileSync(path.resolve(__dirname, '../src/main/hooks.ts'), 'utf8');
  assert.match(hooks, /if \(event === 'SessionStart' \|\| this\.deliveredMemoryByAgent\.get\(agentId\) !== sessionId\)/);
});

test('agents are told to add notes, not logs, and closing time no longer writes to memory', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-memprompt-'));
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home });
  const prompt = inj.args[inj.args.indexOf('--append-system-prompt') + 1];
  assert.match(prompt, /add at most three short notes to .*memory.inbox\.md/);
  assert.match(prompt, /Don't write session logs or status updates/);
  assert.doesNotMatch(prompt, /append what you learned to memory\.md/);
  const closing = fs.readFileSync(path.resolve(__dirname, '../src/main/closingTime.ts'), 'utf8');
  assert.doesNotMatch(closing, /append (its|your) (current state|shift summary)[^']*memory\.md/);
});

test('the tidy up runs with no tools and no MCP servers', () => {
  const tidy = fs.readFileSync(path.resolve(__dirname, '../src/main/memoryTidy.ts'), 'utf8');
  const hidden = fs.readFileSync(path.resolve(__dirname, '../src/main/hiddenClaude.ts'), 'utf8');
  assert.match(tidy, /noTools: true,/);
  assert.match(hidden, /opts\.noTools \? \['--tools', '', '--strict-mcp-config'\]/);
});
