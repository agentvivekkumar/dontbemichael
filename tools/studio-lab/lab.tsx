/**
 * Studio lab: the real office studio, on a fictional team, with a button for
 * every animation the app plays (branding/DESIGN.md 8.12). Each button fires
 * the same event the app listens to (a hive message, a tool call, closing
 * time, a new hire), so what you see is what the app does. For demos and
 * recordings; built into one self-contained HTML file by `npm run lab`.
 *
 * URL options, for scripted shots:
 *   #dark            dark theme
 *   ?hour=22         time of day (8 morning, 12 day, 17 evening, 22 night)
 *   ?play=<label>    fire one button after load, by its label
 *   ?autoplay        start autoplay on load
 *   ?clean           hide the controls (press H to toggle them any time)
 */
import './mock';
import '@/design/global.css';
import '@/i18n';
import { Component, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from '@/store/store';
import { StudioStage } from '@/scene/studio/StudioStage';
import { NeedsYouButton } from '@/shell/TopBar';
import { ClosingTimeBar, type ClosingTimeState } from '@/components/ClosingTimeBar';

const params = new URLSearchParams(location.search);
if (location.hash.includes('dark')) document.documentElement.dataset.cthTheme = 'dark';
document.body.style.margin = '0';

/* ── The fictional office ─────────────────────────────────────────────────── */

type Seed = { id: string; name: string; character: string; status: string; action?: string; extra?: Record<string, unknown> };
const agent = ({ id, name, character, status, action = '', extra = {} }: Seed) =>
  ({ id, name, character, status, action, description: '', accent: 'sky', project: '', cwd: '/tmp', progress: 3, ...extra });

useStore.setState({
  agents: [
    agent({ id: 'god', name: 'Michael', character: 'michael', status: 'working', action: 'Routing 2 new support emails', extra: { isGod: true, contextTokens: 84000, contextLimit: 200000 } }),
    agent({ id: 'pam', name: 'Pam', character: 'pam', status: 'working', action: 'Sorting 4 ceo@ emails' }),
    agent({ id: 'kelly', name: 'Kelly', character: 'kelly', status: 'working', action: 'Replying to Invoice #4471', extra: { progress: 6 } }),
    agent({ id: 'erin', name: 'Erin', character: 'erin', status: 'idle', extra: { sourceCard: 'pro-services/kelly' } }),
    agent({ id: 'dwight', name: 'Dwight', character: 'dwight', status: 'working', action: 'Lakeview Dental follow up' }),
    agent({ id: 'oscar', name: 'Oscar', character: 'oscar', status: 'working', action: 'Matching Sept payments' }),
    agent({ id: 'ryan', name: 'Ryan', character: 'ryan', status: 'idle' }),
    agent({ id: 'toby', name: 'Toby', character: 'toby', status: 'idle' }),
    agent({ id: 'nick', name: 'Nick', character: 'nick', status: 'thinking', action: 'Checking website uptime' })
  ] as never,
  selectedId: null,
  needsYouOpen: true,
  floorView: 'office',
  godStatus: 'ready'
} as never);

const config = {
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
} as never;

/* ── Events, as the app receives them ─────────────────────────────────────── */

const w = window as unknown as Record<string, any>;
const fire = (k: string, e: unknown) => (w.__L?.[k] ?? []).forEach((cb: (e: unknown) => void) => cb(e));
const msg = (from: string, to: string, act: string, subject = '', extra: Record<string, unknown> = {}) =>
  fire('onHiveMessage', { id: String(Math.random()), from, to, act, subject, targets: [to], ...extra });
const tool = (agentId: string, name: string) => fire('onHiveHookEvent', { agentId, event: 'PreToolUse', tool: name });
const at = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
const team = () => useStore.getState().agents.filter((a) => !a.isGod).map((a) => a.id);
let n = 0;

interface Play { group: string; label: string; run: () => void; loop?: boolean }
const PLAYS: Play[] = [
  { group: 'Everyday work', label: 'Someone starts working', loop: true, run: () => {
    const s = useStore.getState();
    const r = s.agents.find((a) => a.id === 'ryan');
    const on = r?.status !== 'working';
    s.updateAgent('ryan', { status: on ? 'working' : 'idle', action: on ? 'Drafting the LinkedIn post' : 'idle' } as never);
  } },
  { group: 'Everyday work', label: 'Message between two people', loop: true, run: () => msg('kelly', 'oscar', 'query', 'Was the late fee waived?') },
  { group: 'Everyday work', label: 'Back and forth (conversation)', run: () => {
    msg('kelly', 'oscar', 'query'); at(1200, () => msg('oscar', 'kelly', 'inform')); at(2600, () => msg('kelly', 'oscar', 'query')); at(4000, () => msg('oscar', 'kelly', 'done'));
  } },
  { group: 'Everyday work', label: 'Tool use', loop: true, run: () => { tool('nick', 'WebFetch'); tool('oscar', 'Bash'); tool('pam', 'Read'); tool('dwight', 'Grep'); } },
  { group: 'Everyday work', label: 'Mail read (in)', loop: true, run: () => tool('kelly', 'mcp__md-mail__search') },
  { group: 'Everyday work', label: 'Mail sent (out)', loop: true, run: () => tool('dwight', 'mcp__md-mail__send') },
  { group: 'Everyday work', label: 'A task reaches Done', loop: true, run: () => { w.__extraDone = [...(w.__extraDone ?? []), { id: `D${n++}`, title: 'Done', status: 'done', assignee: 'dwight' }]; } },
  { group: 'Everyday work', label: 'Someone idle says something', loop: true, run: () => window.dispatchEvent(new Event('cth:demo-quote')) },
  { group: 'Michael and you', label: 'Michael points, then delegates', loop: true, run: () => msg('god', 'dwight', 'request', 'Follow up with Lakeview Dental') },
  { group: 'Michael and you', label: 'A scheduled job starts', loop: true, run: () => msg('scheduler', 'ryan', 'inform', 'Weekly LinkedIn post') },
  { group: 'Michael and you', label: 'Michael asks you (paper plane)', loop: true, run: () => msg('god', 'human', 'query', 'Refund or explain?', { needsHuman: true }) },
  { group: 'Michael and you', label: 'You talk to Michael', loop: true, run: () => msg('human', 'god', 'request', 'Can someone call Lakeview?') },
  { group: 'The office day', label: 'Office opens, lights come up', run: () => {
    const st = useStore.getState();
    const before = new Map(st.agents.map((a) => [a.id, { status: a.status, action: a.action }]));
    useStore.setState({ godStatus: 'booting', agents: st.agents.map((a) => ({ ...a, status: 'idle', action: 'clocking in…' })) } as never);
    ['god', ...team()].forEach((id, i) => at(900 + i * 700, () => {
      if (id === 'god') useStore.setState({ godStatus: 'ready' } as never);
      useStore.getState().updateAgent(id, before.get(id) as never);
    }));
  } },
  { group: 'The office day', label: 'A new hire arrives', run: () => {
    useStore.setState({ agents: [...useStore.getState().agents, agent({ id: `jim${n++}`, name: 'Jim', character: 'jim', status: 'idle', extra: { description: 'Sales rep' } })] } as never);
  } },
  { group: 'The office day', label: 'Closing time, lights out', run: () => {
    const ids = team(); const done: string[] = []; const godId = 'god';
    fire('onClosingTime', { phase: 'started', acked: 0, total: ids.length, confirmed: [], excused: [], waiting: ids, godId });
    ids.forEach((id, i) => at(1400 + i * 900, () => {
      done.push(id);
      fire('onClosingTime', { phase: 'progress', acked: done.length, total: ids.length, confirmed: [...done], excused: [], waiting: ids.filter((x) => !done.includes(x)), godId });
    }));
    at(1600 + ids.length * 900, () => fire('onClosingTime', { phase: 'complete', acked: ids.length, total: ids.length, confirmed: done, excused: [], waiting: [], godId }));
  } },
  { group: 'The office day', label: 'Open the office again', run: () => fire('onClosingTime', { phase: 'cancelled' }) }
];
const HOURS: [string, number][] = [['Morning', 8], ['Day', 12], ['Evening', 17], ['Night', 22]];
const setHour = (h: number) => window.dispatchEvent(new CustomEvent('cth:demo-hour', { detail: h }));

/* ── The page ─────────────────────────────────────────────────────────────── */

function Lab() {
  const [hour, setHourState] = useState<number>(() => Number(params.get('hour') ?? new Date().getHours()));
  const [closing, setClosing] = useState<ClosingTimeState | null>(null);
  const [auto, setAuto] = useState(false);
  const [controls, setControls] = useState(!params.has('clean'));

  useEffect(() => {
    ((w.__L ??= {}).onClosingTime ??= []).push((ev: { phase: string } & ClosingTimeState) => setClosing(ev.phase === 'cancelled' ? null : ev));
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'h' && !(e.target instanceof HTMLInputElement)) setControls((v) => !v); };
    window.addEventListener('keydown', onKey);
    if (params.has('hour')) at(200, () => setHour(Number(params.get('hour'))));
    const play = params.get('play');
    if (play) at(1500, () => PLAYS.find((p) => p.label === play)?.run());
    if (params.has('autoplay')) at(800, () => toggleAuto());
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickHour = (h: number) => { setHourState(h); setHour(h); };
  const toggleAuto = () => {
    if (w.__auto) { window.clearInterval(w.__auto); w.__auto = undefined; setAuto(false); return; }
    setAuto(true);
    const steps = PLAYS.filter((p) => p.loop);
    let k = 0;
    const tick = () => { steps[k % steps.length].run(); k++; };
    tick();
    w.__auto = window.setInterval(tick, 2600);
  };
  const groups = [...new Set(PLAYS.map((p) => p.group))];

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--cth-bg)', fontFamily: 'var(--cth-font-ui)' }}>
      {controls && (
        <div style={{ width: 280, flexShrink: 0, padding: 18, overflowY: 'auto', borderRight: '1px solid var(--cth-line)', background: 'var(--cth-card-2)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--cth-ink)' }}>Studio lab</div>
          <div style={{ fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-3)', margin: '3px 0 14px' }}>
            Every button fires the event the app listens to. Press H to hide these controls for a recording.
          </div>
          <button style={btn(auto)} onClick={toggleAuto}>{auto ? 'Stop autoplay' : 'Autoplay'}</button>
          {groups.map((g) => (
            <div key={g} style={{ marginTop: 14 }}>
              <div style={groupHead}>{g}</div>
              {PLAYS.filter((p) => p.group === g).map((p) => <button key={p.label} style={btn()} onClick={p.run}>{p.label}</button>)}
            </div>
          ))}
          <div style={{ marginTop: 14 }}>
            <div style={groupHead}>Time of day</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {HOURS.map(([l, h]) => <button key={l} style={{ ...btn(hour === h), marginBottom: 0, textAlign: 'center' }} onClick={() => pickHour(h)}>{l}</button>)}
            </div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <div style={{ position: 'absolute', top: 14, right: 18, zIndex: 5 }}><NeedsYouButton /></div>
        <StudioStage config={config} />
        {closing && <ClosingTimeBar closing={closing} onCancel={() => fire('onClosingTime', { phase: 'cancelled' })} onForceQuit={() => {}} onRetry={() => {}} />}
      </div>
    </div>
  );
}

const btn = (on = false): CSSProperties => ({
  display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', marginBottom: 6, border: 'none', borderRadius: 10, cursor: 'pointer',
  background: on ? 'var(--cth-ink)' : 'var(--cth-card)', color: on ? 'var(--cth-bg)' : 'var(--cth-ink)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600
});
const groupHead: CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--cth-ink-3)', marginBottom: 7 };

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() {
    return this.state.error
      ? <pre style={{ padding: 24, color: 'var(--cth-coral-text)' }}>{String((this.state.error as Error)?.stack ?? this.state.error)}</pre>
      : this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<Boundary><Lab /></Boundary>);
