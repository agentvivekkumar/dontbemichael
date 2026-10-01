/**
 * A stand in for the app's preload bridge (window.cth), with a small fictional
 * office (Harbor & Pine), so the studio renders without Electron. Any `on…`
 * subscription is recorded in window.__L so the lab can fire the same events
 * the app listens to; anything else resolves to null.
 */
try { localStorage.setItem('cth.theme', location.hash.includes('dark') ? 'dark' : 'light'); } catch { /* private window */ }

const now = new Date().toISOString();
const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const tasks = { tasks: [
  { id: 'T112', title: 'Refund for Northwind Cafe, Invoice #4471', status: 'blocked', assignee: 'kelly', priority: 4, createdAt: now, description: 'Maria at Northwind Cafe was charged twice for September. Refund $240 or explain.', humanQA: [{ q: 'Refund it, or tell Kelly what to say?', askedAt: now, raisedBy: 'god' }] },
  { id: 'T118', title: 'Build sales pipeline and first forecast', status: 'blocked', assignee: 'dwight', createdAt: now, humanQA: [{ q: '**Two deals passed their 30 Sep close date and are still open in the CRM. Where does each stand?**\n\n1. `Lakeview Dental`, website refresh, `$10,000`, last contact 21 Sep.\n2. `Bayside Books`, training, `$8,000`, last contact 31 Aug.\n\nFor each: won, lost, or a new close date.', askedAt: ago(1), raisedBy: 'god' }] },
  { id: 'T119', title: 'Pipeline report', status: 'todo', assignee: 'dwight', dependsOn: ['T118'] },
  { id: 'T121', title: 'Close September support tickets', status: 'todo', assignee: 'kelly', dependsOn: ['T112'] },
  { id: 'T115', title: 'Reply to Maria', status: 'doing', assignee: 'kelly' },
  { id: 'T116', title: 'Returns', status: 'doing', assignee: 'kelly' },
  { id: 'T114', title: 'Lakeview follow up', status: 'doing', assignee: 'dwight' },
  { id: 'T113', title: 'Match payments', status: 'doing', assignee: 'oscar' },
  { id: 'T120', title: 'billing@ mailbox', status: 'blocked', assignee: 'oscar', humanQA: [{ q: 'Sign in again?', askedAt: ago(5), raisedBy: 'god' }] },
  ...Array.from({ length: 5 }, (_, i) => ({ id: `T${130 + i}`, title: 'To do', status: 'todo', assignee: 'pam' })),
  ...Array.from({ length: 12 }, (_, i) => ({ id: `T${140 + i}`, title: 'Done', status: 'done', assignee: 'nick' }))
] };
const pairs: [string, string, string, number][] = [['god', 'kelly', 'request', 9], ['god', 'dwight', 'request', 7], ['god', 'pam', 'request', 4], ['god', 'oscar', 'request', 3], ['dwight', 'oscar', 'query', 6], ['kelly', 'god', 'query', 2], ['god', 'nick', 'request', 2], ['god', 'ryan', 'request', 1], ['god', 'toby', 'request', 1], ['pam', 'oscar', 'inform', 2]];
const log = [
  ...Array.from({ length: 38 }, () => ({ kind: 'message', from: 'god', to: 'kelly', act: 'request', created_at: now, subject: 'Work' })),
  ...pairs.flatMap(([f, t, a, n]) => Array.from({ length: n }, () => ({ kind: 'message', from: f, to: t, act: a, created_at: now, subject: 'Work' })))
];
const noop = () => () => {};
const w = window as unknown as Record<string, any>;
w.cth = new Proxy({
  hiveTasks: async () => (w.__extraDone ? { tasks: [...tasks.tasks, ...w.__extraDone] } : tasks),
  hiveLog: async () => log,
  listScheduleRequests: async () => [],
  onScheduleRequestsUpdated: noop,
  listMissions: async () => [{ id: 'm1', label: 'Weekly LinkedIn post', to: 'ryan', enabled: true, intervalMs: 0, weekly: { days: [2], minute: 14 * 60 }, body: '' }],
  onMissionsUpdated: noop,
  onConfigChanged: noop,
  packsList: async () => ({ packs: [], core: null }),
  quickbooksRoleDefaults: async () => ['oscar']
}, {
  get: (t: Record<string, unknown>, k: string) => (k in t ? t[k]
    : k.startsWith('on') ? ((cb: unknown) => { ((w.__L ??= {})[k] ??= []).push(cb); return () => {}; })
    : k.endsWith('Sync') ? (() => null)
    : (async () => null))
});
