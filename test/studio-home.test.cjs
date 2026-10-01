'use strict';

/**
 * Design v2 "Studio" (branding/DESIGN.md 8, docs/designs/studio-home.md): the
 * pixel floor is replaced by an isometric studio. Team members sit in
 * department pods around Michael's glass pod; mailboxes are posts on the front
 * edge; live hive messages travel as tokens. The studio shows only what the app
 * really does.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const L = loadTs('src/renderer/src/scene/studio/layout.ts');
const iso = loadTs('src/renderer/src/scene/studio/iso.ts');

test('the projection is 2:1 isometric around Michael, and G undoes P on the floor', () => {
  assert.deepEqual(iso.P(0, 0), [545, 425]);
  const [x, y] = iso.P(1, 0);
  assert.equal(x - 545, 50);
  assert.equal(y - 425, 25);
  for (const [gx, gy] of [[2, -3], [-4.2, 1.1], [0.5, 0.5]]) {
    const back = iso.G(...iso.P(gx, gy));
    assert.ok(Math.abs(back[0] - gx) < 1e-9 && Math.abs(back[1] - gy) < 1e-9);
  }
});

test('a department comes from the hired job card, then the character, then the role line', () => {
  assert.equal(L.departmentOf({ id: 'kelly', character: 'kelly' }), 'support');
  assert.equal(L.departmentOf({ id: 'oscar', character: 'oscar' }), 'finance');
  // Erin hired into Kelly's job sits in Support, whatever Erin usually does.
  assert.equal(L.departmentOf({ id: 'erin', character: 'erin', sourceCard: 'pro-services/kelly' }), 'support');
  // A character hired into another's job goes where the job is.
  assert.equal(L.departmentOf({ id: 'pam2', character: 'pam', sourceCard: 'retail-shop/dwight' }), 'sales');
  assert.equal(L.departmentOf({ id: 'x', character: 'nobody', description: 'Bookkeeper for the shop' }), 'finance');
  assert.equal(L.departmentOf({ id: 'y', character: 'nobody', description: 'Makes the tea' }), 'team');
  // IT Engineer and IT Security share the IT pod; supply, inventory and quality share Operations.
  assert.equal(L.departmentOf({ id: 'nick', character: 'nick' }), 'it');
  assert.equal(L.departmentOf({ id: 'sadiq', character: 'sadiq' }), 'it');
  for (const c of ['creed', 'meredith', 'darryl']) assert.equal(L.departmentOf({ id: c, character: c }), 'operations', c);
});

test('pods are departments on a seven slot ring; Michael is never a pod', () => {
  const team = ['pam', 'kelly', 'dwight', 'oscar', 'ryan', 'toby', 'nick'].map((c) => ({ id: c, character: c }));
  const plan = L.planStudio([{ id: 'god', character: 'michael', isGod: true }, ...team, { id: 'erin', character: 'erin', sourceCard: 'x/kelly' }]);
  assert.equal(plan.compact, false);
  assert.equal(plan.pods.length, 7);
  const support = plan.pods.find((p) => p.dept === 'support');
  assert.deepEqual(support.members.map((m) => m.id), ['kelly', 'erin'], 'two people share the Support pod');
  assert.ok(!plan.pods.some((p) => p.members.some((m) => m.id === 'god')));
  // Each department keeps its own slot, so the office looks the same every day.
  const slotOf = (d) => plan.pods.find((p) => p.dept === d).slot;
  assert.deepEqual([slotOf('front-desk').x, slotOf('support').x, slotOf('sales').x, slotOf('finance').x], [400, 660, 765, 900]);
  // No two pods share a slot.
  assert.equal(new Set(plan.pods.map((p) => `${p.slot.x},${p.slot.y}`)).size, plan.pods.length);
});

test('a fifth person opens a second pod; past the ring the view goes compact', () => {
  const five = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, character: 'x', description: 'Sales rep' }));
  const plan = L.planStudio(five);
  assert.equal(plan.pods.length, 2);
  assert.deepEqual(plan.pods.map((p) => p.members.length), [4, 1]);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, character: 'x', description: 'Makes the tea' }));
  assert.equal(L.planStudio(many).compact, true);
  const eightDepts = ['Sales', 'Support', 'Finance', 'Marketing', 'HR', 'IT', 'Inventory', 'Admin', 'Tea'].map((d, i) => ({ id: `d${i}`, character: 'x', description: d }));
  assert.equal(L.planStudio(eightDepts).compact, true, 'more departments than slots');
});

test('a card above its pod is anchored by its bottom edge, so it grows away from the pod', () => {
  const src = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(src, /const cy = oy \+ \(above \? r\.top \+ r\.h : r\.top\) \* k;/);
  assert.match(src, /transform: above \? 'translateY\(-100%\)' : undefined/);
  const r = L.cardRect({ x: 660, y: 270, mode: 'above', dx: 84, gap: 92 }, 2);
  assert.equal(r.top + r.h, 270 - 92, 'the bottom edge sits a fixed gap above the pod');
});

test('the app shows the studio, not the pixel floor', () => {
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /<StudioStage config=\{config\} \/>/);
  assert.doesNotMatch(app, /<OfficeFloor \/>/);
});

test('only what is real: mail paths run to the person who watches the mailbox, and nothing is invented', () => {
  const src = read('src/renderer/src/scene/studio/StudioStage.tsx');
  // A mailbox's owner is whoever has it on their Capabilities (config.agentCapabilities).
  assert.match(src, /c\.email\?\.enabled && c\.email\.mailboxes\[0\] === mailboxId/);
  // A broken mailbox is the config's own needs-attention status, with a Fix into Settings.
  assert.match(src, /m\.status === 'needs-attention'/);
  assert.match(src, /section: 'Connections'/);
  // Counts come from the ledger and the hive log, never from sample numbers.
  assert.match(src, /e\.from !== 'god' \|\| e\.act !== 'request'/, 'delegated = Michael\'s requests today');
  assert.match(src, /waitsOnHuman\(t\) && t\.assignee/, 'for you = Ask me cards tagged to that person');
  assert.doesNotMatch(src, /closes 6:00|Harbor|Northwind/);
});

test('live tokens come from hive messages, only Michael escalates to the owner, and at most 16 fly', () => {
  const src = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(src, /window\.cth\.onHiveMessage\(/);
  assert.match(src, /const MAX_TOKENS = 16;/);
  assert.match(src, /\.slice\(-MAX_TOKENS\)/);
  // An escalation always leaves from Michael's pod toward the Needs you board.
  assert.match(src, /flightPath\(from === 'you' \? 'hub' : from, dest\)/);
  assert.match(src, /const \[x0, y0\] = HUB_TOP;/);
});

test('the stage pauses when nobody can see it, and honours reduced motion', () => {
  const src = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(src, /const paused = docHidden \|\| floorView !== 'office' \|\| !!fullscreenAgentId;/);
  assert.match(src, /svg\.pauseAnimations\(\); else svg\.unpauseAnimations\(\);/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(read('src/renderer/src/design/global.css'), /\.cth-studio-paused \* \{ animation-play-state: paused !important; \}/);
});

test('every label card is a button, and arrow keys move between them', () => {
  const src = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(src, /data-studio-card=""/);
  assert.match(src, /\['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'\]\.includes\(e\.key\)/);
});

test('a quiet pod is a chip; its card shows while someone works, it is selected, or hovered (owner, 2026-09-30)', () => {
  const src = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(src, /const ACTIVE = new Set<string>\(\['thinking', 'working', 'blocked', 'compacting', 'looping'\]\);/);
  assert.match(src, /const awake = \(pod: PodPlan<Agent>\) => pod\.members\.some\(\(a\) => ACTIVE\.has\(a\.status\) \|\| a\.id === selected\);/);
  assert.match(src, /if \(!isAwake && peek !== key\) return chip;/);
  // The chip still carries anything waiting on the owner.
  const chip = src.slice(src.indexOf('function PodChip('));
  assert.match(chip.slice(0, 2500), /forYou > 0 &&/);
  // No stem to a card that is not showing.
  assert.match(src, /if \(!awake\(pod\) && peek !== podKey\(pod\)\) return null;/);
});
