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
  assert.match(app, /<StudioStage config=\{config\} bleed=\{sidebarWidth \+ 10\} \/>/);
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
  const src = read('src/renderer/src/scene/studio/life.tsx');
  assert.match(src, /window\.cth\.onHiveMessage\(/);
  assert.match(src, /export const MAX_TOKENS = 16;/);
  assert.match(src, /\.slice\(-MAX_TOKENS\)/);
  // An escalation always leaves from Michael's pod toward the Needs you board.
  assert.match(src, /const src = from === 'you' \? 'hub' : from;/);
  assert.match(src, /const \[x0, y0\] = HUB_TOP;/);
});

test('the studio moves on real events only: scheduled runs, mail, tools, done tasks (owner, 2026-09-30)', () => {
  const life = read('src/renderer/src/scene/studio/life.tsx');
  // A scheduled run is a hive message from the scheduler: the clock rings, then it travels.
  assert.match(life, /const scheduled = e\.from === 'scheduler';/);
  assert.match(life, /setClockRinging\(true\);/);
  // Mail tool calls move an envelope on the watcher's mail wire; reads come in, the rest go out.
  assert.match(life, /\/\^mcp__md-mail__\(\[a-z_\]\+\)\$\/\.exec\(e\.tool\)/);
  assert.match(life, /const dir: 'in' \| 'out' = op === 'read' \? 'in' : 'out';/);
  assert.match(life, /window\.cth\.onHiveHookEvent\(onHook\)/);
  // A done burst only for a task that newly reached Done, never on first load.
  assert.match(life, /if \(!before \|\| Date\.now\(\) - openedAt\.current < 6000 \|\| live\.current\.paused\) return;/);
  assert.match(life, /if \(\/\^Bash\$\|\^BashOutput\$\/\.test\(tool\)\) return 'terminal';/);
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  // No standing wires: a mailbox wire only while mail moves, Michael's wire only as work starts.
  assert.match(stage, /if \(!seat \|\| !life\.postActive\[m\.id\]\) return null;/);
  assert.match(stage, /plan\.pods\.map\(\(pod\) => kickoff\[pod\.members\[0\]\.id\] \? \(/);
  assert.doesNotMatch(stage, /dash="5 5"/, 'no standing red line from a broken mailbox');
  assert.match(stage, /busy=\{godBusy\} name=\{god\?\.name\} plateLit=\{[^}]+\} ringing=\{life\.clockRinging\}/);
  // Reduced motion: the ambient loops stop.
  assert.match(read('src/renderer/src/design/global.css'), /\.cth-st-scroll, \.cth-st-steam, \.cth-st-sway, \.cth-st-dot, \.cth-st-write, \.cth-st-bob, \.cth-st-flow, \.cth-st-doing \{ animation: none !important; \}/);
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
  assert.match(src, /const awake = \(pod: PodPlan<Agent>\) => pod\.members\.some\(\(a\) => \(!quietCards && ACTIVE\.has\(a\.status\)\) \|\| a\.id === selected\);/);
  // In the app quietCards is off, so a pod at work shows its card.
  assert.doesNotMatch(read('src/renderer/src/App.tsx'), /quietCards/);
  assert.match(src, /if \(!isAwake && peek !== key\) return chip;/);
  // The chip still carries anything waiting on the owner.
  const chip = src.slice(src.indexOf('function PodChip('));
  assert.match(chip.slice(0, 6000), /forYou > 0 &&/);
  // No stem to a card that is not showing.
  assert.match(src, /if \(!awake\(pod\) && peek !== podKey\(pod\)\) return null;/);
});

test('more life: plane to Needs you, pointing, conversations, owner messages, hires, closing lights, daylight (owner, 2026-09-30)', () => {
  const life = read('src/renderer/src/scene/studio/life.tsx');
  assert.match(life, /window\.dispatchEvent\(new Event\('cth:needs-you-ping'\)\)/);
  assert.match(read('src/renderer/src/shell/TopBar.tsx'), /window\.addEventListener\('cth:needs-you-ping', on\)/);
  assert.match(life, /const pointing = !scheduled && from === 'hub' && e\.act === 'request';/);
  assert.match(life, /filter\(\(\[, c\]\) => c\.ab && c\.ba\)/, 'an arc only for a real back and forth');
  assert.match(life, /now - c\.last < 60_000/);
  assert.match(life, /const fromOwner = e\.from === 'human';/);
  // Hires and Needs you planes ignore what was already there when the office opened.
  assert.match(life, /Date\.now\(\) - openedAt\.current < 6000/);
  assert.match(life, /Date\.now\(\) - openedAt\.current < 4000/);
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(stage, /window\.cth\.onClosingTime\(/);
  assert.match(stage, /if \(e\.phase === 'cancelled' \|\| e\.phase === 'error'\) \{ setState\(null\); return; \}/);
  assert.match(stage, /lightsOut=\{\(!!closing && pod\.members\.every\(\(a\) => closing\.out\.has\(a\.id\)\)\) \|\|/);
  assert.match(stage, /const night = hour >= 19 \|\| hour < 6;/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    assert.match(JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).studio.welcome, /\{\{name\}\}/, loc);
  }
});

test('lights come up as people clock in, the way closing time turns them off (owner, 2026-09-30)', () => {
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(stage, /if \(a\.action !== ACTION_CLOCKING_IN\) \{ since\.current\.delete\(a\.id\); continue; \}/);
  assert.match(stage, /now - \(since\.current\.get\(a\.id\) \?\? now\) < 60_000/, 'never dark for more than a minute');
  assert.match(stage, /\|\| pod\.members\.every\(\(a\) => away\.has\(a\.id\)\)\}/);
  assert.match(stage, /const hubAway = godStatus === 'booting' \|\| \(!!god && away\.has\(god\.id\)\);/);
  const art = read('src/renderer/src/scene/studio/StudioArt.tsx');
  assert.match(art, /if \(was\.current && !off\) \{/, 'a light flickers only as it comes on');
  assert.match(read('src/renderer/src/store/store.ts'), /status: 'idle',\n\s+action: ACTION_CLOCKING_IN,/, 'a saved team loads clocking in');
});

test('the idle quote belongs to the speaker\'s chip and never covers a card (owner, 2026-09-30)', () => {
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  // Rendered inside the pod chip, tail on the speaker's avatar, which gets a ring.
  const chip = stage.slice(stage.indexOf('function PodChip('));
  assert.match(chip.slice(0, 4000), /className=\{\['cth-st-quote'/);
  assert.match(chip.slice(0, 4000), /\['--q-tail' as string\]: `\$\{4 \+ speakerAt \* 14 \+ 4\}px`/);
  assert.match(chip.slice(0, 6000), /className=\{i === speakerAt \? 'cth-st-speak' : undefined\}/);
  assert.doesNotMatch(stage, /One in-character line over an idle pod/, 'no free floating bubble');
  // Only someone in a quiet pod (a chip) speaks; never someone clocking in.
  assert.match(stage, /const quietPeople = \(\) => quietPods\(\)\.flatMap\(\(p\) => p\.members\)\.filter\(isIn\);/);
  assert.match(stage, /a\.status === 'idle' && a\.action !== ACTION_CLOCKING_IN/);
  assert.match(stage, /const wait = first \? 8000 \+ Math\.random\(\) \* 7000 : 15_000 \+ Math\.random\(\) \* 15_000;/);
  // Up from the chip, up and leftward, or down under it: the first that covers no card.
  assert.match(stage, /const free = spots\.find\(/);
  assert.match(read('src/renderer/src/design/global.css'), /\.cth-st-quote-text \{ font-size: 12\.5px;/);
});

/**
 * Idle people talk to each other (owner, 2026-10-01: "kelly and ryan throwing
 * paper planes towards each other or mails which on landing shows a chat
 * bubble with the message"): a beat flies pod to pod, then shows on the
 * catcher's chip with the sender's name and color.
 */
test('idle banter: planes or mail between two quiet pods, the line shown where it lands', () => {
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  const life = read('src/renderer/src/scene/studio/life.tsx');
  assert.match(stage, /const partners = idle\.filter\(\(b\) => podOf\(b\.id\) !== podOf\(a\.id\)\);/, 'two different pods');
  assert.match(stage, /live\.current\.throwNote\(from\.id, to\.id, look\)/);
  assert.match(stage, /later\(FLIGHT_MS, \(\) => \{\n\s*show\(\{ agentId: to\.id, text, from: \{ name: from\.name, acc: live\.current\.accentOf\(from\.id\) \}/, 'the line shows on landing, at the catcher');
  assert.match(stage, /if \(!still\.includes\(from\.id\) \|\| !still\.includes\(to\.id\)\) \{ busyUntil = 0; return; \}/, 'work ends the chat');
  assert.match(stage, /\{\(quote\.from \|\| members\.length > 1\) && <span className="cth-st-quote-who">\{quote\.from\?\.name \?\? speaker\.name\}<\/span>\}/);
  assert.match(life, /kind: look === 'plane' \? 'note-plane' : 'note-mail', color: acc\(fromId\)/);
  assert.match(life, /kind === 'you' \|\| kind === 'note-plane' \?/);
});

test('Michael\'s numbers live on his walls; a chip replaces the always-on card (owner, 2026-09-30)', () => {
  const art = read('src/renderer/src/scene/studio/StudioArt.tsx');
  assert.match(art, /function StatsSign\(/);
  assert.match(art, /\{stats && <StatsSign at=\{P\(-0\.6, -a \+ 0\.01, z1 - 3\)\}/);
  assert.match(art, /<text key=\{n\} className="cth-st-tick"/, 'numbers tick when they change');
  // Board columns read left to right on the wall: To do, Doing, Blocked, Done.
  assert.match(art, /\[0\.15, '#9C97CC', board\.todo\], \[-0\.21, T\.blue, board\.doing\], \[-0\.57, T\.coral, board\.blocked\], \[-0\.93, T\.green, board\.done\]/);
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  // The name plate on his glass is the way in; no floating chip (owner, 2026-09-30).
  assert.doesNotMatch(stage, /HubChip/);
  assert.match(stage, /className="cth-st-plate"/);
  assert.match(stage, /onMouseEnter=\{\(\) => openPeek\('hub'\)\}\n\s+onMouseLeave=\{closePeek\}\n\s+onFocus=\{\(\) => openPeek\('hub'\)\}/);
  assert.match(stage, /\{\(sel \|\| peek === 'hub'\) && \(/);
});

test('a terminal that survived a reload is not shown clocking in', () => {
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /const running = new Set\(list\.filter\(\(p\) => p\.hasOutput\)\.map\(\(p\) => p\.id\)\);/);
  assert.match(app, /a\.ptyId && running\.has\(a\.ptyId\) && a\.action === ACTION_CLOCKING_IN\) useStore\.getState\(\)\.updateAgent\(a\.id, \{ action: '' \}\)/);
});

test('Michael\'s office has a name plate by the door, not an M badge (owner, 2026-09-30)', () => {
  const art = read('src/renderer/src/scene/studio/StudioArt.tsx');
  assert.match(art, /<NamePlate at=\{P\(\.\.\.plateAt\(name\)\)\} name=\{name\} busy=\{busy\}/);
  // The plate ends before the glass's corner (gx 1.05) for any name.
  assert.match(art, /return \[Math\.min\(0\.6, 0\.97 - plateWidth\(name\) \/ 100\), 1\.06, 44\];/);
  assert.doesNotMatch(art, /fontSize=\{12\} fill="#fff">M<\/text>/, 'the M badge is gone');
  assert.match(read('src/renderer/src/scene/studio/StudioStage.tsx'), /<Hub key="hub" T=\{T\} dark=\{dark\} board=\{snap\.board\} busy=\{godBusy\} name=\{god\?\.name\} plateLit=/);
});

test('the right column has no ground of its own; its cards sit on the office (owner, 2026-09-30)', () => {
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /<StudioStage config=\{config\} bleed=\{sidebarWidth \+ 10\} \/>/);
  const col = app.slice(app.indexOf("The right column has no ground of its own"), app.indexOf('{needsYouOpen || !agent ? ('));
  assert.doesNotMatch(col, /background:|backdropFilter|boxShadow/);
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(stage, /const fitW = Math\.max\(200, box\.w - bleed\);/);
  assert.match(stage, /right: -bleed, overflow: 'hidden'/);
});
