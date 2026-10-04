'use strict';

/**
 * The floor's character (owner, 2026-10-03: "the small letter icon next to each
 * name does not add any value"; approved direction: D, Living office, without
 * painted floor signs). Every person is drawn as their character's signature
 * prop, departments carry a job icon, desks carry their person's prop, and
 * plants and a water cooler stand on open floor.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const props = read('src/renderer/src/scene/office/props.tsx');
const cast = read('src/renderer/src/scene/office/cast.ts');
const art = read('src/renderer/src/scene/studio/StudioArt.tsx');
const L = loadTs('src/renderer/src/scene/studio/layout.ts');

const block = (src, name) => src.slice(src.indexOf(`export const ${name}`), src.indexOf('\n};', src.indexOf(`export const ${name}`)));

test('every cast member has a signature prop', () => {
  const names = [...cast.matchAll(/\{ name: '([a-z]+)',/g)].map((m) => m[1]);
  assert.ok(names.length >= 19);
  const art = block(props, 'PROP_ART');
  for (const n of names) assert.match(art, new RegExp(`\\n  ${n}: <>`), `${n} has no prop`);
});

test('every department has an icon', () => {
  const tokens = read('src/renderer/src/design/tokens.ts');
  const depts = [...block(tokens, 'departments').matchAll(/^\s+'?([a-z-]+)'?:\s+\{ l:/gm)].map((m) => m[1]);
  assert.equal(depts.length, 9);
  const icons = block(props, 'DEPT_ART');
  for (const d of depts) assert.match(icons, new RegExp(`'${d}': <>`), `${d} has no icon`);
});

test('no person is drawn as a letter any more, outside the no-character fallback', () => {
  const files = [
    'src/renderer/src/scene/studio/StudioStage.tsx', 'src/renderer/src/shell/PanelChrome.tsx',
    'src/renderer/src/components/AskMeTab.tsx', 'src/renderer/src/components/ScheduleRequestCards.tsx',
    'src/renderer/src/components/WorkStyleUpdateCards.tsx', 'src/renderer/src/components/TasksKanban.tsx',
    'src/renderer/src/components/OnboardingWizard.tsx', 'src/renderer/src/components/SpritePortrait.tsx'
  ];
  for (const f of files) {
    assert.doesNotMatch(read(f), /(name|who|first|character|assigneeName)\.slice\(0, 1\)\.toUpperCase\(\)/, f);
  }
  assert.match(props, /\(who\.name \?\? who\.id\)\.slice\(0, 1\)\.toUpperCase\(\)/);
});

test('a prop keeps the light pastel in dark theme, and Michael stays on ink', () => {
  assert.match(props, /background: fam \? \(prop \? fam\.lit : fam\.l\) : INK_FIXED/);
  assert.match(props, /export const INK_FIXED = '#1E1B2E';/);
});

test('the department tab shows its icon, and desks carry their person\'s prop', () => {
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(stage, /<DeptIcon dept=\{dept\} size=\{10\} color=\{c\.acc\} \/>/);
  assert.match(stage, /prop: a\.character/);
  assert.match(art, /prop=\{d\.prop\}/);
  assert.match(art, /<DeskProp at=\{P\(-0\.48, -0\.06, ph \+ 22\)\} size=\{14\}>\{PROP_ART\.michael\}<\/DeskProp>/);
});

test('plants and the water cooler stand clear of every ring slot, the mailboxes and Michael', () => {
  const spots = [...block(art, 'DECOR').matchAll(/kind: '(plant|cooler)', at: \[(-?[\d.]+), (-?[\d.]+)\]/g)]
    .map((m) => ({ kind: m[1], g: [Number(m[2]), Number(m[3])] }));
  assert.equal(spots.filter((s) => s.kind === 'cooler').length, 1);
  assert.ok(spots.filter((s) => s.kind === 'plant').length >= 2);
  // A full ring: nine departments of three, so every pod has its widest slab.
  const roles = { 'front-desk': 'Executive Admin', support: 'Customer Support', sales: 'Sales', finance: 'Finance', marketing: 'Marketing', people: 'HR', it: 'IT', operations: 'Supply chain', team: 'Researcher' };
  const agents = Object.keys(roles).flatMap((d) => [0, 1, 2].map((i) => ({ id: `${d}-${i}`, description: roles[d] })));
  const plan = L.planStudio(agents);
  assert.equal(plan.compact, false);
  assert.equal(plan.pods.length, 9);
  for (const s of spots) {
    for (const pod of plan.pods) {
      const n = pod.members.length;
      const hw = (n === 1 ? 0.65 : 1.0) + 0.15;
      const hd = (n <= 2 ? 0.65 : 1.2) + 0.15;
      const inside = Math.abs(s.g[0] - pod.grid[0]) < hw && Math.abs(s.g[1] - pod.grid[1]) < hd;
      assert.ok(!inside, `${s.kind} at ${s.g} sits on the ${pod.dept} pod`);
    }
    assert.ok(Math.hypot(s.g[0], s.g[1]) > 1.6, `${s.kind} at ${s.g} sits in Michael's office`);
    assert.ok(s.g[1] < 3.8 || s.g[0] > 0, `${s.kind} at ${s.g} sits on the mailbox row`);
    assert.ok(Math.abs(s.g[0]) <= 4.7 && Math.abs(s.g[1]) <= 4.7, `${s.kind} at ${s.g} is off the platform`);
  }
});

test('the bottom bar has no pack caption beside Hire; each wizard job names its pack', () => {
  const bar = read('src/renderer/src/shell/BottomBar.tsx');
  assert.doesNotMatch(bar, /teamFromPack|cth-bb-pack|packsList/);
  assert.match(bar, /function HireButton\(\)/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    assert.equal(JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).shell.teamFromPack, undefined, loc);
  }
  assert.match(read('src/shared/hireTemplates.ts'), /business: pack\.displayName/);
});

test('Who talks to whom draws each person as their prop, the letter only without a character', () => {
  const graph = read('src/renderer/src/components/MemoryGraphPanel.tsx');
  assert.match(graph, /import \{ INK_FIXED, PROP_ART, hasProp \} from '@\/scene\/office\/props';/);
  assert.match(graph, /\{PROP_ART\[hasProp\(n\.character\) \? n\.character : 'michael'\]\}/);
  assert.match(graph, /hasProp\(n\.character\) \|\| n\.isGod \? \(/);
  assert.match(graph, /fill=\{n\.isGod \? INK_FIXED : \(hasProp\(n\.character\) \? fam\?\.lit : fam\?\.l\)/);
});
