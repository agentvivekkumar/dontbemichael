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
  { id: 'T112', title: 'Refund for Northwind Cafe, Invoice #4471', status: 'blocked', assignee: 'kelly', priority: 4, createdAt: now, notes: 'Maria at Northwind Cafe was charged twice for September. Refund $240 or explain.', humanQA: [{ q: 'Refund it, or tell Kelly what to say?', askedAt: now, raisedBy: 'god' }] },
  { id: 'T118', title: 'Build sales pipeline and first forecast', status: 'blocked', assignee: 'dwight', createdAt: now, humanQA: [{ q: '**Two deals passed their 30 Sep close date and are still open in the CRM. Where does each stand?**\n\n1. `Lakeview Dental`, website refresh, `$10,000`, last contact 21 Sep.\n2. `Bayside Books`, training, `$8,000`, last contact 31 Aug.\n\nFor each: won, lost, or a new close date.', askedAt: ago(1), raisedBy: 'god' }] },
  { id: 'T119', title: 'Pipeline report', status: 'todo', assignee: 'dwight', dependsOn: ['T118'] },
  { id: 'T121', title: 'Close September support tickets', status: 'todo', assignee: 'kelly', dependsOn: ['T112'] },
  { id: 'T115', title: 'Reply to Maria', status: 'doing', assignee: 'kelly' },
  { id: 'T116', title: 'Returns', status: 'doing', assignee: 'kelly' },
  { id: 'T114', title: 'Lakeview follow up', status: 'doing', assignee: 'dwight' },
  { id: 'T113', title: 'Match payments', status: 'doing', assignee: 'oscar' },
  { id: 'T120', title: 'Billing email sign in', status: 'blocked', assignee: 'oscar', humanQA: [{ q: 'Sign in again?', askedAt: ago(5), raisedBy: 'god' }] },
  ...([['Board packet for Lakeview', 'pam'], ['Quarterly referral note', 'ryan'], ['Rotate shared passwords', 'nick'], ['Update PTO policy draft', 'toby'], ['Order printer toner', 'pam']] as const)
    .map(([title, assignee], i) => ({ id: `T${130 + i}`, title, status: 'todo', assignee })),
  ...([['August close', 'oscar'], ['3 lead follow ups', 'dwight'], ['Standup notes', 'god'], ['Website uptime report', 'nick'], ['Timesheet reminder', 'toby'], ['Weekly LinkedIn post', 'ryan'],
    ['Sort ceo@ inbox', 'pam'], ['Reply to Bayside Books', 'kelly'], ['Vendor invoice batch', 'oscar'], ['Renew domain', 'nick'], ['New hire checklist', 'toby'], ['Lakeview proposal', 'dwight']] as const)
    .map(([title, assignee], i) => ({ id: `T${140 + i}`, title, status: 'done', assignee }))
] };
const pairs: [string, string, string, number][] = [['god', 'kelly', 'request', 9], ['god', 'dwight', 'request', 7], ['god', 'pam', 'request', 4], ['god', 'oscar', 'request', 3], ['dwight', 'oscar', 'query', 6], ['kelly', 'god', 'query', 2], ['god', 'nick', 'request', 2], ['god', 'ryan', 'request', 1], ['god', 'toby', 'request', 1], ['pam', 'oscar', 'inform', 2]];
/** What each pair talks about, so the graph's topics read like a real week. */
const topics: Record<string, string> = {
  'god>kelly': 'Invoice #4471', 'god>dwight': 'Lakeview Dental', 'god>pam': 'Board packet', 'god>oscar': 'September close',
  'dwight>oscar': 'Pricing question for Lakeview Dental', 'kelly>god': 'Refund over $200', 'god>nick': 'Website uptime',
  'god>ryan': 'LinkedIn post', 'god>toby': 'Timesheets', 'pam>oscar': 'Board packet numbers'
};
const log = [
  ...Array.from({ length: 38 }, () => ({ kind: 'message', from: 'god', to: 'kelly', act: 'request', created_at: now, subject: topics['god>kelly'] })),
  ...pairs.flatMap(([f, t, a, n]) => Array.from({ length: n }, () => ({ kind: 'message', from: f, to: t, act: a, created_at: now, subject: topics[`${f}>${t}`] ?? 'Work' })))
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


/* ── The office: Harbor & Pine's people and settings ─────────────────────── */

type Seed = { id: string; name: string; character: string; status: string; action?: string; extra?: Record<string, unknown> };
export const agent = ({ id, name, character, status, action = '', extra = {} }: Seed) =>
  ({ id, name, character, status, action, description: '', accent: 'sky', project: '', cwd: '/tmp', progress: 3, ...extra });

/** Everyone on a normal mid-morning: most at work, a few idle. */
export const roster = () => [
  agent({ id: 'god', name: 'Michael', character: 'michael', status: 'working', action: 'Routing 2 new support emails', extra: { isGod: true, contextTokens: 84000, contextLimit: 200000 } }),
  agent({ id: 'pam', name: 'Pam', character: 'pam', status: 'working', action: 'Sorting 4 ceo@ emails' }),
  agent({ id: 'kelly', name: 'Kelly', character: 'kelly', status: 'working', action: 'Replying to Invoice #4471', extra: { progress: 6 } }),
  agent({ id: 'erin', name: 'Erin', character: 'erin', status: 'idle', extra: { sourceCard: 'pro-services/kelly' } }),
  agent({ id: 'dwight', name: 'Dwight', character: 'dwight', status: 'working', action: 'Lakeview Dental follow up' }),
  agent({ id: 'oscar', name: 'Oscar', character: 'oscar', status: 'working', action: 'Matching Sept payments' }),
  agent({ id: 'ryan', name: 'Ryan', character: 'ryan', status: 'idle' }),
  agent({ id: 'toby', name: 'Toby', character: 'toby', status: 'idle' }),
  agent({ id: 'nick', name: 'Nick', character: 'nick', status: 'thinking', action: 'Checking website uptime' })
];

export const officeConfig = {
  mailboxes: [
    { id: 'ceo', address: 'ceo@harborpine.com', status: 'connected' },
    { id: 'support', address: 'support@harborpine.com', status: 'connected' },
    { id: 'sales', address: 'sales@harborpine.com', status: 'connected' },
    { id: 'billing', address: 'billing@harborpine.com', status: 'needs-attention', statusReason: 'The mail provider rejected the app password' }
  ],
  agentCapabilities: {
    pam: { email: { enabled: true, mailboxes: ['ceo'], send: false } },
    kelly: { email: { enabled: true, mailboxes: ['support'], send: true } },
    dwight: { email: { enabled: true, mailboxes: ['sales'], send: true } },
    oscar: { email: { enabled: true, mailboxes: ['billing'], send: false } }
  }
};
