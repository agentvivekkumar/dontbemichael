/**
 * Studio lab: the real office studio, on a fictional team, with a button for
 * every animation the app plays (branding/DESIGN.md 8.12). Each button fires
 * the same event the app listens to (a hive message, a tool call, closing
 * time, a new hire), so what you see is what the app does. For demos and
 * recordings; built into one self-contained HTML file by `npm run lab`.
 *
 * Every pod shows only its chip; a card pops up on hover, or for a moment
 * when a button involves someone in it, one at a time.
 *
 * URL options, for scripted shots:
 *   #dark            dark theme
 *   ?hour=22         time of day (8 morning, 12 day, 17 evening, 22 night)
 *   ?play=<label>    fire one button after load, by its label
 *   ?autoplay        start autoplay on load (closed office, opening, then
 *                    everyday events in random order)
 *   ?clean           hide the controls (press H to toggle them any time)
 */
import { agent, officeConfig, roster } from './mock';
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

useStore.setState({
  agents: roster() as never,
  selectedId: null,
  needsYouOpen: true,
  floorView: 'office',
  godStatus: 'ready'
} as never);

/** What each person is doing on a normal day, so the opening can restore it. */
const normal = new Map(useStore.getState().agents.map((a) => [a.id, { status: a.status, action: a.action }]));

/** The office closed: everyone clocked out, every light off. */
function closeOffice() {
  useStore.setState({ godStatus: 'booting', agents: useStore.getState().agents.map((a) => ({ ...a, status: 'idle', action: 'clocking in…' })) } as never);
}
// Autoplay starts from a closed office, dark from the very first frame.
if (params.has('autoplay')) closeOffice();

const config = officeConfig as never;

/* ── Events, as the app receives them ─────────────────────────────────────── */

const w = window as unknown as Record<string, any>;
const fire = (k: string, e: unknown) => (w.__L?.[k] ?? []).forEach((cb: (e: unknown) => void) => cb(e));
const msg = (from: string, to: string, act: string, subject = '', extra: Record<string, unknown> = {}) =>
  fire('onHiveMessage', { id: String(Math.random()), from, to, act, subject, targets: [to], ...extra });
const tool = (agentId: string, name: string) => fire('onHiveHookEvent', { agentId, event: 'PreToolUse', tool: name });
const at = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
/** Pop one person's card for a moment (cards stay folded otherwise in the lab). */
const spot = (agentId: string, ms = 0) => at(ms, () => window.dispatchEvent(new CustomEvent('cth:demo-spotlight', { detail: agentId })));
const team = () => useStore.getState().agents.filter((a) => !a.isGod).map((a) => a.id);
let n = 0;

/** The office opening: every light off, then Michael and each person clock in
 *  one by one. `hold` is how long the office stays dark first. Returns when
 *  (ms from now) the last person is in. */
function openOffice(hold: number, timers?: number[]): number {
  closeOffice();
  const order = ['god', ...team()];
  order.forEach((id, i) => {
    const t = at(hold + i * 700, () => {
      if (id === 'god') useStore.setState({ godStatus: 'ready' } as never);
      useStore.getState().updateAgent(id, (normal.get(id) ?? { status: 'idle', action: '' }) as never);
    });
    timers?.push(t);
  });
  return hold + (order.length - 1) * 700;
}

interface Play { group: string; label: string; run: () => void; loop?: boolean }
const PLAYS: Play[] = [
  { group: 'Everyday work', label: 'Someone starts working', loop: true, run: () => {
    const s = useStore.getState();
    const r = s.agents.find((a) => a.id === 'ryan');
    const on = r?.status !== 'working';
    s.updateAgent('ryan', { status: on ? 'working' : 'idle', action: on ? 'Drafting the LinkedIn post' : 'idle' } as never);
    spot('ryan', 150);
  } },
  { group: 'Everyday work', label: 'Message between two people', loop: true, run: () => { spot('kelly'); msg('kelly', 'oscar', 'query', 'Was the late fee waived?'); spot('oscar', 2000); } },
  { group: 'Everyday work', label: 'Back and forth (conversation)', run: () => {
    spot('kelly'); msg('kelly', 'oscar', 'query');
    at(1200, () => msg('oscar', 'kelly', 'inform')); at(2600, () => msg('kelly', 'oscar', 'query')); at(4000, () => msg('oscar', 'kelly', 'done'));
    spot('oscar', 3500);
  } },
  { group: 'Everyday work', label: 'Tool use', loop: true, run: () => { spot('nick'); tool('nick', 'WebFetch'); tool('oscar', 'Bash'); tool('pam', 'Read'); tool('dwight', 'Grep'); } },
  { group: 'Everyday work', label: 'Mail read (in)', loop: true, run: () => { spot('kelly'); tool('kelly', 'mcp__md-mail__search'); } },
  { group: 'Everyday work', label: 'Mail sent (out)', loop: true, run: () => { spot('dwight'); tool('dwight', 'mcp__md-mail__send'); } },
  { group: 'Everyday work', label: 'A task reaches Done', loop: true, run: () => { spot('dwight'); w.__extraDone = [...(w.__extraDone ?? []), { id: `D${n++}`, title: 'Done', status: 'done', assignee: 'dwight' }]; } },
  { group: 'Everyday work', label: 'Someone idle says something', loop: true, run: () => window.dispatchEvent(new Event('cth:demo-quote')) },
  { group: 'Michael and you', label: 'Michael points, then delegates', loop: true, run: () => { msg('god', 'dwight', 'request', 'Follow up with Lakeview Dental'); spot('dwight', 1600); } },
  { group: 'Michael and you', label: 'A scheduled job starts', loop: true, run: () => { msg('scheduler', 'ryan', 'inform', 'Weekly LinkedIn post'); spot('ryan', 1800); } },
  { group: 'Michael and you', label: 'Michael asks you (paper plane)', loop: true, run: () => msg('god', 'human', 'query', 'Refund or explain?', { needsHuman: true }) },
  { group: 'Michael and you', label: 'You talk to Michael', loop: true, run: () => msg('human', 'god', 'request', 'Can someone call Lakeview?') },
  { group: 'The office day', label: 'Office opens, lights come up', run: () => { openOffice(900); } },
  { group: 'The office day', label: 'A new hire arrives', run: () => {
    const id = `jim${n++}`;
    useStore.setState({ agents: [...useStore.getState().agents, agent({ id, name: 'Jim', character: 'jim', status: 'idle', extra: { description: 'Sales rep' } })] } as never);
    spot(id, 900);
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
    if (params.has('autoplay')) toggleAuto();
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickHour = (h: number) => { setHourState(h); setHour(h); };
  // Autoplay tells the office's day: closed (all lights off), the opening,
  // then everyday events in random order, never the same one twice running.
  const toggleAuto = () => {
    if (w.__auto) {
      window.clearInterval(w.__auto.loop);
      w.__auto.timers.forEach((t: number) => window.clearTimeout(t));
      w.__auto = undefined;
      setAuto(false);
      return;
    }
    setAuto(true);
    const timers: number[] = [];
    w.__auto = { loop: undefined, timers };
    const steps = PLAYS.filter((p) => p.loop);
    let last = -1;
    const tick = () => {
      let k = Math.floor(Math.random() * steps.length);
      if (k === last) k = (k + 1) % steps.length;
      last = k;
      steps[k].run();
    };
    const allIn = openOffice(1800, timers);
    timers.push(at(allIn + 1200, () => {
      tick();
      if (w.__auto) w.__auto.loop = window.setInterval(tick, 2600);
    }));
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
          <button style={btn(auto)} onClick={toggleAuto}>{auto ? 'Stop autoplay' : 'Autoplay the day'}</button>
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
        <StudioStage config={config} quietCards />
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
