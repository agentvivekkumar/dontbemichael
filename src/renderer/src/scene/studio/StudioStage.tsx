/**
 * The Office view: the studio (branding/DESIGN.md 8), the v2 replacement for the
 * pixel floor. The SVG art is drawn on a fixed 1060 x 816 stage and scaled to
 * fit; the label cards, Michael's hub card and the mailbox tags sit over it as
 * HTML at their scaled positions but real size, so text never shrinks below the
 * type floor. Everything shown comes from real state: agent status and action,
 * the task ledger, the mailboxes in config, live hive messages.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, actionText, liveActivity, type Agent } from '@/store/store';
import type { HarnessConfig } from '@/store/config';
import type { DepartmentName } from '@/design/tokens';
import { useAppTheme } from '@/design/theme';
import { PixelBadge, type StatusKind } from '@/components/PixelBadge';
import { useHasTerminalDraft } from '@/components/terminalPool';
import { useMissions } from '@/components/triggers/ScheduleList';
import { parseTasks, waitsOnHuman } from '@/components/TasksKanban';
import { missionsFor, nextRunAt } from '@shared/missions';
import { pickSoloLine } from '@/scene/office/cafeteriaLines';
import { useNeedsYouCount } from '@/shell/useNeedsYou';
import { P, STAGE_H, STAGE_W, curvePts, dpath, hopPts, type Pt } from './iso';
import { family, sceneTokens, type Family } from './theme';
import { EXIT, HUB, HUB_CARD, HUB_TOP, POST_GY, cardRect, departmentOf, planStudio, postGx, roleOf, type PodPlan } from './layout';
import { Flow, Hub, MailPost, Platform, Pod, PodGlow, StudioDefs, type DeskState } from './StudioArt';

const POLL_MS = 5000;
const MAX_TOKENS = 16;

type Board = { todo: number; doing: number; blocked: number; done: number };

/* ── Data ─────────────────────────────────────────────────────────────────── */

interface TaskSnapshot { board: Board; doingBy: Record<string, number>; forYouBy: Record<string, number>; kept: number }

function useTaskSnapshot(godId: string): TaskSnapshot {
  const [snap, setSnap] = useState<TaskSnapshot>({ board: { todo: 0, doing: 0, blocked: 0, done: 0 }, doingBy: {}, forYouBy: {}, kept: 0 });
  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (document.hidden) return;
      void window.cth.hiveTasks().then((raw) => {
        if (!alive) return;
        const board: Board = { todo: 0, doing: 0, blocked: 0, done: 0 };
        const doingBy: Record<string, number> = {};
        const forYouBy: Record<string, number> = {};
        let kept = 0;
        for (const t of parseTasks(raw)) {
          board[t.status]++;
          if (t.status === 'doing' && t.assignee) doingBy[t.assignee] = (doingBy[t.assignee] ?? 0) + 1;
          if (waitsOnHuman(t) && t.assignee) forYouBy[t.assignee] = (forYouBy[t.assignee] ?? 0) + 1;
          if (t.status !== 'done' && (t.assignee === godId || t.assignee === 'god')) kept++;
        }
        setSnap({ board, doingBy, forYouBy, kept });
      }).catch(() => { /* keep the last snapshot */ });
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [godId]);
  return snap;
}

/** Jobs Michael handed out today: his `request` messages in the hive log. */
function useDelegatedToday(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (document.hidden) return;
      void window.cth.hiveLog(1000).then((log) => {
        if (!alive) return;
        const today = new Date().toDateString();
        let c = 0;
        for (const raw of log) {
          const e = raw as { kind?: string; from?: string; act?: string; created_at?: string; ts?: string };
          if (e.kind && e.kind !== 'message') continue;
          if (e.from !== 'god' || e.act !== 'request') continue;
          const at = e.created_at ?? e.ts;
          if (at && new Date(at).toDateString() === today) c++;
        }
        setN(c);
      }).catch(() => { /* keep the last count */ });
    };
    poll();
    const timer = setInterval(poll, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return n;
}

function useLiveConfig(initial: HarnessConfig): HarnessConfig {
  const [config, setConfig] = useState(initial);
  useEffect(() => setConfig(initial), [initial]);
  useEffect(() => window.cth.onConfigChanged((c) => setConfig(c as HarnessConfig)), []);
  return config;
}

function deskState(a: Agent): DeskState {
  switch (a.status) {
    case 'working': return 'working';
    case 'thinking': return 'thinking';
    case 'waiting': return 'waiting';
    case 'blocked': return 'needs';
    case 'compacting': return 'compacting';
    case 'looping': return 'looping';
    case 'success': return 'success';
    default: return 'idle';
  }
}

/* ── Stage ────────────────────────────────────────────────────────────────── */

export function StudioStage({ config: initialConfig }: { config: HarnessConfig }) {
  const { t } = useTranslation();
  const dark = useAppTheme() === 'dark';
  const T = sceneTokens(dark);
  const config = useLiveConfig(initialConfig);
  const agents = useStore((s) => s.agents);
  const selectedId = useStore((s) => s.selectedId);
  const needsYouOpen = useStore((s) => s.needsYouOpen);
  const floorView = useStore((s) => s.floorView);
  const fullscreenAgentId = useStore((s) => s.fullscreenAgentId);
  const god = agents.find((a) => a.isGod);
  const godId = god?.id ?? 'god';
  const snap = useTaskSnapshot(godId);
  const delegated = useDelegatedToday();
  const toYou = useNeedsYouCount();
  const { missions } = useMissions();

  const plan = useMemo(() => planStudio(agents), [agents]);
  const families = useMemo(() => {
    const out: Record<string, Family> = {};
    for (const d of ['front-desk', 'support', 'sales', 'finance', 'marketing', 'people', 'it', 'operations', 'team'] as DepartmentName[]) out[d] = family(d, dark);
    return out;
  }, [dark]);

  // Fit the stage into the container.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: STAGE_W, h: STAGE_H });
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  // Leave room for the floating bottom bar under the platform.
  const k = Math.min(box.w / STAGE_W, (box.h - 40) / STAGE_H, 1.25);
  const ox = (box.w - STAGE_W * k) / 2;
  const oy = Math.max(0, (box.h - 70 - STAGE_H * k) / 2);
  const at = (x: number, y: number): CSSProperties => ({ position: 'absolute', left: ox + x * k, top: oy + y * k });

  // Pause every animation while nobody can see the stage (DESIGN.md 11.2).
  const [docHidden, setDocHidden] = useState(document.hidden);
  useEffect(() => {
    const on = () => setDocHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const paused = docHidden || floorView !== 'office' || !!fullscreenAgentId;
  const svgRef = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (paused) svg.pauseAnimations(); else svg.unpauseAnimations();
  }, [paused]);

  // Where each agent sits, for tokens and the quote bubble.
  const seatOf = useMemo(() => {
    const m = new Map<string, { pod: PodPlan<Agent>; index: number }>();
    for (const pod of plan.pods) pod.members.forEach((a, index) => m.set(a.id, { pod, index }));
    return m;
  }, [plan]);

  const tokens = useHiveTokens(seatOf, godId, paused);
  const quote = useIdleQuote(plan.pods, paused);

  // Mailbox posts: every connected mailbox, and who watches it.
  const mailboxes = config.mailboxes ?? [];
  const ownerOf = (mailboxId: string): Agent | undefined => {
    const entry = Object.entries(config.agentCapabilities ?? {})
      .find(([, c]) => c.email?.enabled && c.email.mailboxes[0] === mailboxId);
    return entry ? agents.find((a) => a.id === entry[0]) : undefined;
  };

  const selected = needsYouOpen ? null : selectedId;
  const select = (id: string) => useStore.getState().select(id);

  // Arrow keys move between cards in reading order (DESIGN.md 12).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const cards = Array.from(hostRef.current?.querySelectorAll<HTMLElement>('[data-studio-card]') ?? []);
    const i = cards.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : i + 1;
    cards[(next + cards.length) % cards.length]?.focus();
  };

  if (plan.compact) {
    return (
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
        <CompactGrid plan={plan} families={families} snap={snap} selected={selected} onSelect={select} missions={missions} godId={godId} />
      </div>
    );
  }

  return (
    <div ref={hostRef} className={`cth-studio${paused ? ' cth-studio-paused' : ''}`} onKeyDown={onKeyDown} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* The stage's light (DESIGN.md 3.8) and a faint dot grid toward the edges. */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(900px 520px at 50% 48%, ${dark ? '#211F31' : '#FFFFFF'} 0%, transparent 70%)`
      }} />
      <svg
        ref={svgRef}
        aria-hidden="true"
        viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
        width={STAGE_W * k}
        height={STAGE_H * k}
        style={{ position: 'absolute', left: ox, top: oy, overflow: 'visible' }}
      >
        <StudioDefs T={T} families={families} />
        <Platform T={T} />
        {plan.pods.map((pod) => (
          <PodGlow key={`glow-${pod.dept}-${pod.members[0].id}`} grid={pod.grid} famKey={pod.dept} desks={pod.members.map((a) => ({ st: deskState(a) }))} />
        ))}
        {/* Paths: Michael to every pod, each mailbox to the person who watches it. */}
        {plan.pods.map((pod, i) => {
          const busy = pod.members.some((a) => a.status !== 'idle');
          return <Flow key={`f-${i}`} a={HUB} b={pod.grid} bend={bendFor(pod.grid)} color={T.req} width={busy ? 2.6 : 1.6} opacity={busy ? 0.55 : 0.32} dash={busy ? undefined : '2 6'} T={T} />;
        })}
        {mailboxes.map((m, i) => {
          const owner = ownerOf(m.id);
          const seat = owner ? seatOf.get(owner.id) : undefined;
          const from: Pt = [postGx(i, mailboxes.length), POST_GY - 0.3];
          if (m.status === 'needs-attention') {
            return <Flow key={`m-${m.id}`} a={from} b={seat?.pod.grid ?? HUB} bend={0} color={T.coral} width={2} opacity={0.9} dash="5 5" T={T} />;
          }
          return seat ? <Flow key={`m-${m.id}`} a={from} b={seat.pod.grid} bend={0.3} color={T.req} width={2.2} opacity={0.5} T={T} /> : null;
        })}
        {/* Objects, back to front. */}
        {[
          ...mailboxes.map((m, i) => {
            const gx = postGx(i, mailboxes.length);
            const owner = ownerOf(m.id);
            return {
              depth: gx + POST_GY,
              node: <MailPost key={`p-${m.id}`} gx={gx} gy={POST_GY} broken={m.status === 'needs-attention'} c={owner ? families[departmentOf(owner)] : null} T={T} />
            };
          }),
          ...plan.pods.map((pod) => ({
            depth: pod.grid[0] + pod.grid[1],
            node: (
              <Pod
                key={`pod-${pod.dept}-${pod.members[0].id}`}
                grid={pod.grid}
                desks={pod.members.map((a) => ({ st: deskState(a) }))}
                c={families[pod.dept]} famKey={pod.dept}
                selected={pod.members.some((a) => a.id === selected)}
                T={T} dark={dark}
              />
            )
          })),
          { depth: 0, node: <Hub key="hub" T={T} dark={dark} board={snap.board} /> }
        ].sort((a, b) => a.depth - b.depth).map((o) => o.node)}
        {tokens}
      </svg>

      {/* Stems from each card to its pod. */}
      <svg aria-hidden="true" width={box.w} height={box.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {plan.pods.map((pod) => {
          const r = cardRect(pod.slot, pod.members.length);
          const x = ox + r.stem.x * k;
          return (
            <g key={`stem-${pod.members[0].id}`}>
              <line x1={x} y1={oy + r.stem.y1 * k} x2={x} y2={oy + r.stem.y2 * k} stroke={T.stem} strokeWidth={1} strokeDasharray="2 3" />
              <circle cx={x} cy={oy + r.stem.y2 * k} r={2.2} fill={T.stem} />
            </g>
          );
        })}
      </svg>

      {/* Label cards. */}
      {plan.pods.map((pod) => {
        const r = cardRect(pod.slot, pod.members.length);
        // A card above its pod is anchored by its bottom edge, so a taller card
        // (more people, a context bar) grows away from the pod, not onto it.
        const above = pod.slot.mode === 'above';
        const cx = ox + r.left * k;
        const cy = oy + (above ? r.top + r.h : r.top) * k;
        return (
          <PodCard
            key={`card-${pod.members[0].id}`}
            style={{ position: 'absolute', left: cx, top: cy, width: r.w, transform: above ? 'translateY(-100%)' : undefined }}
            dept={pod.dept} members={pod.members} c={families[pod.dept]}
            snap={snap} selected={selected} onSelect={select} missions={missions} godId={godId}
          />
        );
      })}

      {/* Michael's hub card. */}
      {god && (
        <HubCard
          style={{ ...at(HUB_CARD.left, HUB_CARD.top), width: HUB_CARD.w }}
          god={god} selected={selected === god.id} onSelect={() => select(god.id)}
          delegated={delegated} toYou={toYou} kept={snap.kept} board={snap.board}
        />
      )}

      {/* Mailbox tags. */}
      {mailboxes.map((m, i) => {
        const [x, y] = P(postGx(i, mailboxes.length), POST_GY, 0);
        const owner = ownerOf(m.id);
        const broken = m.status === 'needs-attention';
        const w = broken ? 170 : 96;
        return (
          <MailTag key={m.id} style={{ position: 'absolute', left: ox + x * k - (broken ? w / 2 - 16 : w / 2), top: oy + (y + 20) * k, minWidth: w, width: 'max-content', maxWidth: 230 }}
            width={w} address={m.address} owner={owner?.name} acc={owner ? families[departmentOf(owner)].acc : T.req}
            broken={broken} reason={m.statusReason} />
        );
      })}

      {/* One in-character line over an idle pod (DESIGN.md 8.8). */}
      {quote && (() => {
        const seat = seatOf.get(quote.agentId);
        if (!seat) return null;
        const [x, y] = P(seat.pod.grid[0], seat.pod.grid[1] - 0.42, 57);
        return <div key={quote.key} className="cth-st-quote" style={{ ...at(x + 6, y - 16), transform: 'translateY(-100%)' }}>{quote.text}</div>;
      })()}

      <div className="cth-sr-only" aria-live="polite">{t('studio.summary', { count: agents.length })}</div>
    </div>
  );
}

function bendFor([gx, gy]: Pt): number {
  // Curve every delegation path a little, away from the platform's center line.
  return (gx - gy > 0 ? -0.5 : 0.5);
}

/* ── Label card (DESIGN.md 7.14) ──────────────────────────────────────────── */

function PodCard({ style, dept, members, c, snap, selected, onSelect, missions, godId }: {
  style: CSSProperties; dept: DepartmentName; members: Agent[]; c: Family; snap: TaskSnapshot;
  selected: string | null; onSelect: (id: string) => void; missions: ReturnType<typeof useMissions>['missions']; godId: string;
}) {
  const { t } = useTranslation();
  const lead = members[0];
  const doing = members.reduce((n, a) => n + (snap.doingBy[a.id] ?? 0), 0);
  const forYou = members.reduce((n, a) => n + (snap.forYouBy[a.id] ?? 0), 0);
  const isSel = members.some((a) => a.id === selected);
  const allIdle = members.every((a) => a.status === 'idle');
  return (
    <div style={{
      ...style, borderRadius: 'var(--cth-r-xl)', padding: '12px 10px 0 9px',
      background: `color-mix(in srgb, var(--cth-card) ${allIdle ? 86 : 96}%, transparent)`, backdropFilter: 'blur(6px)',
      boxShadow: isSel ? 'inset 0 0 0 1px var(--cth-ink), var(--cth-ring-select), var(--cth-shadow-md)' : 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-md)'
    }}>
      <div style={{ position: 'absolute', insetInlineStart: 9, top: -9, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={deptTab}>{t(`studio.dept.${dept}`)}</span>
        {doing > 0 && (
          <button title={t('studio.doing', { count: doing })} aria-label={t('studio.doing', { count: doing })}
            onClick={() => openFirstDoing(lead.id)} style={sticky}>{doing}</button>
        )}
        {forYou > 0 && (
          <span style={forYouBadge}><i style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cth-coral-base)', display: 'block' }} />{t('studio.forYou', { count: forYou })}</span>
        )}
      </div>
      {members.map((a, i) => (
        <MemberRow key={a.id} a={a} c={c} divider={i > 0} onSelect={onSelect} missions={missions} godId={godId} />
      ))}
    </div>
  );
}

function openFirstDoing(agentId: string) {
  void window.cth.hiveTasks().then((raw) => {
    const task = parseTasks(raw).find((x) => x.status === 'doing' && x.assignee === agentId);
    if (task) useStore.getState().openTaskDetail(task.id);
  }).catch(() => { /* nothing to open */ });
}

function MemberRow({ a, c, divider, onSelect, missions, godId }: {
  a: Agent; c: Family; divider: boolean; onSelect: (id: string) => void; missions: ReturnType<typeof useMissions>['missions']; godId: string;
}) {
  const { t } = useTranslation();
  const typing = useHasTerminalDraft(a.ptyId);
  const status: StatusKind = typing ? 'typing' : (a.status as StatusKind);
  const next = (() => {
    const now = Date.now();
    const times = missionsFor(missions, a.id, godId).filter((m) => m.enabled).map((m) => ({ at: nextRunAt(m, now), label: m.label })).filter((x): x is { at: number; label: string } => x.at !== null);
    if (!times.length) return null;
    const first = times.sort((x, y) => x.at - y.at)[0];
    return `${new Date(first.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}: ${first.label}`;
  })();
  const live = a.status !== 'idle' ? liveActivity(a) : '';
  const caption = (live ? actionText(live, t) : '') || next || '';
  const pct = Math.min(8, Math.max(0, a.progress ?? 0)) / 8;
  const gauge = (a.progress ?? 0) >= 7 ? 'var(--cth-coral-base)' : (a.progress ?? 0) >= 6 ? 'var(--cth-amber)' : c.acc;
  return (
    <button
      data-studio-card=""
      onClick={() => onSelect(a.id)}
      aria-label={`${a.name}, ${roleOf(a)}`}
      style={{
        display: 'block', width: '100%', padding: divider ? '7px 0 0' : 0, marginTop: divider ? 7 : 0, border: 'none',
        borderTop: divider ? '1px dashed var(--cth-line-2)' : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'start',
        fontFamily: 'var(--cth-font-ui)', borderRadius: 6
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, position: 'relative', paddingInlineEnd: 2 }}>
        <span style={{
          width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1,
          background: c.l, color: c.acc, boxShadow: `inset 0 0 0 1px ${c.m}`, fontSize: 11.5, fontWeight: 700
        }}>{a.name.slice(0, 1).toUpperCase()}</span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 12.5, fontWeight: 600, lineHeight: '15px', letterSpacing: '-0.02em', color: a.status === 'idle' ? 'var(--cth-ink-3)' : 'var(--cth-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingInlineEnd: 78 }}>{a.name}</b>
          <i style={{ fontStyle: 'normal', fontSize: 10, lineHeight: '13px', color: 'var(--cth-ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roleOf(a)}</i>
        </span>
        <PixelBadge status={status} style={{ position: 'absolute', insetInlineEnd: 0, top: 0, fontSize: 10, lineHeight: '13px', padding: '1px 7px' }} />
      </div>
      <div style={{ marginTop: 5, marginBottom: 8, fontSize: 10.5, lineHeight: '14px', color: a.status === 'idle' ? 'var(--cth-ink-3)' : 'var(--cth-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={caption}>{caption || t('studio.nothingNow')}</div>
      {pct > 0 && (
        <div title={t('studio.context')} style={{ height: 3, marginBottom: 6, borderRadius: 2, background: 'var(--cth-neutral-soft)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct * 100}%`, background: gauge, borderRadius: 2 }} />
        </div>
      )}
    </button>
  );
}

const deptTab: CSSProperties = {
  fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cth-ink-2)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', borderRadius: 6, padding: '2px 6px', lineHeight: '12px'
};
const sticky: CSSProperties = {
  fontFamily: 'var(--cth-font-mono)', fontSize: 10, fontWeight: 600, color: '#6B5200', background: '#FFE58A',
  border: 'none', borderRadius: '2px 2px 6px 2px', width: 17, height: 17, display: 'grid', placeItems: 'center', padding: 0,
  transform: 'rotate(-5deg)', boxShadow: '0 1px 2px rgba(120,90,0,.25)', cursor: 'pointer'
};
const forYouBadge: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 600, lineHeight: '12px', whiteSpace: 'nowrap',
  color: 'var(--cth-coral-text)', background: 'var(--cth-coral-soft)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--cth-coral-base) 35%, transparent)',
  borderRadius: 999, padding: '2px 7px 2px 5px'
};

/* ── Michael's hub card (DESIGN.md 7.17) ──────────────────────────────────── */

function HubCard({ style, god, selected, onSelect, delegated, toYou, kept, board }: {
  style: CSSProperties; god: Agent; selected: boolean; onSelect: () => void;
  delegated: number; toYou: number; kept: number; board: Board;
}) {
  const { t } = useTranslation();
  const ctx = god.contextTokens !== undefined && god.contextLimit ? Math.round((god.contextTokens / god.contextLimit) * 100) : null;
  const stat = (n: number, label: string, coral = false) => (
    <div style={{ padding: '6px 0 7px', textAlign: 'center' }}>
      <b style={{ display: 'block', fontFamily: 'var(--cth-font-mono)', fontSize: 16, fontWeight: 600, lineHeight: '19px', color: coral && n > 0 ? 'var(--cth-coral-text)' : 'var(--cth-ink)' }}>{n}</b>
      <span style={{ fontSize: 10, color: 'var(--cth-ink-3)' }}>{label}</span>
    </div>
  );
  const col = (n: number, label: string, key: string) => (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, fontSize: 10, color: 'var(--cth-ink-3)' }}>
      <b style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--cth-ink)', display: 'flex', alignItems: 'center', gap: 4, lineHeight: '15px' }}>
        <i style={{ width: 6, height: 6, borderRadius: 2, background: key, display: 'block' }} />{n}
      </b>{label}
    </span>
  );
  return (
    <div style={{
      ...style, borderRadius: 'var(--cth-r-2xl)', overflow: 'hidden', background: 'var(--cth-card)',
      boxShadow: selected ? 'inset 0 0 0 1px var(--cth-ink), var(--cth-ring-select), var(--cth-shadow-hub)' : 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-hub)'
    }}>
      <button data-studio-card="" onClick={onSelect} aria-label={god.name} style={{
        position: 'relative', display: 'block', width: '100%', padding: '9px 11px 8px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'start', fontFamily: 'var(--cth-font-ui)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--cth-ink)', color: 'var(--cth-bg)', fontSize: 12, fontWeight: 700 }}>
            {god.name.slice(0, 1).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <b style={{ fontSize: 12.5, fontWeight: 600, lineHeight: '15px', color: 'var(--cth-ink)', paddingInlineEnd: 76 }}>{god.name}</b>
            <i style={{ fontStyle: 'normal', fontSize: 10, color: 'var(--cth-ink-3)', whiteSpace: 'nowrap' }}>{t('studio.officeManager')}</i>
          </span>
          <PixelBadge status={god.status as StatusKind} style={{ position: 'absolute', insetInlineEnd: 11, top: 9, fontSize: 10, lineHeight: '13px', padding: '1px 7px' }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: '14px', color: 'var(--cth-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {god.action?.trim() ? actionText(god.action.trim(), t) : t('studio.runningTheOffice')}
        </div>
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid var(--cth-line)', background: 'var(--cth-card-2)' }}>
        {stat(delegated, t('studio.delegated'))}
        <div style={{ borderInline: '1px solid var(--cth-line)' }}>{stat(toYou, t('studio.toYou'), true)}</div>
        {stat(kept, t('studio.kept'))}
      </div>
      <button onClick={() => useStore.getState().setFloorView('tasks')} aria-label={t('floorView.tasks')} style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', width: '100%', padding: '6px 4px 7px', border: 'none', borderTop: '1px solid var(--cth-line)',
        background: 'transparent', cursor: 'pointer', fontFamily: 'var(--cth-font-ui)'
      }}>
        {col(board.todo, t('studio.todo'), 'var(--cth-ink-4)')}
        {col(board.doing, t('studio.doingCol'), 'var(--cth-blue)')}
        {col(board.blocked, t('studio.blocked'), 'var(--cth-coral-base)')}
        {col(board.done, t('studio.done'), 'var(--cth-green)')}
      </button>
      {ctx !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--cth-line)', padding: '7px 11px 8px', fontSize: 10, color: 'var(--cth-ink-3)', background: 'var(--cth-card-2)' }}>
          {t('studio.context')}
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--cth-neutral-soft)', overflow: 'hidden' }}>
            <i style={{ display: 'block', height: '100%', width: `${Math.min(100, ctx)}%`, borderRadius: 3, background: 'linear-gradient(90deg,#8E83F5,#6C5CE7)' }} />
          </span>
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontWeight: 600, color: 'var(--cth-ink-2)' }}>{ctx}%</span>
        </div>
      )}
    </div>
  );
}

/* ── Mailbox tag (DESIGN.md 7.18) ─────────────────────────────────────────── */

function MailTag({ style, width, address, owner, acc, broken, reason }: {
  style: CSSProperties; width: number; address: string; owner?: string; acc: string; broken: boolean; reason?: string;
}) {
  const { t } = useTranslation();
  const local = `${address.split('@')[0]}@`;
  const openMailboxes = () => window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'Connections' } }));
  return (
    <div title={address} style={{
      width, ...style, padding: broken ? '5px 9px 6px' : '4px 8px', borderRadius: 10,
      background: broken ? 'var(--cth-coral-soft)' : 'var(--cth-card)',
      boxShadow: `inset 0 0 0 1px ${broken ? 'color-mix(in srgb, var(--cth-coral-base) 35%, transparent)' : 'var(--cth-line)'}, var(--cth-shadow-md)`,
      borderTop: `2.5px solid ${broken ? 'var(--cth-coral-base)' : acc}`,
      display: 'flex', flexDirection: 'column', gap: 1
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <b style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, fontWeight: 600, lineHeight: '13px', color: 'var(--cth-ink)' }}>{local}</b>
        <span style={{ fontSize: 10, lineHeight: '12px', color: 'var(--cth-ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner ?? t('studio.noOwner')}</span>
      </div>
      {broken && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <em title={reason} style={{ fontStyle: 'normal', fontSize: 10, fontWeight: 600, color: 'var(--cth-coral-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('studio.mailboxBroken')}</em>
          <button onClick={openMailboxes} style={{
            marginInlineStart: 'auto', height: 18, padding: '0 8px', border: 'none', borderRadius: 999, cursor: 'pointer',
            background: 'var(--cth-coral-strong)', color: 'var(--cth-on-coral)', fontFamily: 'var(--cth-font-ui)', fontSize: 10, fontWeight: 600
          }}>{t('studio.fix')}</button>
        </div>
      )}
    </div>
  );
}

/* ── Compact grid for large teams (DESIGN.md 8.9) ─────────────────────────── */

function CompactGrid({ plan, families, snap, selected, onSelect, missions, godId }: {
  plan: ReturnType<typeof planStudio<Agent>>; families: Record<string, Family>; snap: TaskSnapshot;
  selected: string | null; onSelect: (id: string) => void; missions: ReturnType<typeof useMissions>['missions']; godId: string;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '24px 24px 110px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      {plan.groups.map((g) => (
        <div key={g.dept} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(186px, 1fr))', gap: 18, paddingTop: 10 }}>
          {g.members.map((a) => (
            <PodCard key={a.id} style={{ position: 'relative' }} dept={g.dept} members={[a]} c={families[g.dept]}
              snap={snap} selected={selected} onSelect={onSelect} missions={missions} godId={godId} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Live tokens (DESIGN.md 8.6) ──────────────────────────────────────────── */

type SeatMap = Map<string, { pod: PodPlan<Agent>; index: number }>;

interface Flight { key: string; d: string; kind: 'request' | 'question' | 'propose' | 'inform' | 'done' | 'refuse' | 'you' }

function useHiveTokens(seatOf: SeatMap, godId: string, paused: boolean) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const seatRef = useRef(seatOf);
  seatRef.current = seatOf;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const T = sceneTokens(useAppTheme() === 'dark');

  useEffect(() => {
    let n = 0;
    type Msg = { id: string; from: string; to: string; targets?: string[]; needsHuman?: boolean; act?: string };
    const fly = (e: Msg) => {
      if (pausedRef.current) return;
      const node = (id: string): Pt | 'hub' | 'you' | null => {
        if (id === godId || id === 'god') return 'hub';
        if (id === 'human') return 'you';
        const seat = seatRef.current.get(id);
        return seat ? seat.pod.grid : null;
      };
      const from = node(e.from);
      const targets = e.needsHuman ? ['human'] : (e.targets?.length ? e.targets : [e.to]);
      const add: Flight[] = [];
      for (const to of targets) {
        const dest = node(to);
        if (!from || !dest) continue;
        const kind: Flight['kind'] = e.needsHuman || dest === 'you' ? 'you'
          : e.act === 'query' ? 'question' : e.act === 'done' || e.act === 'agree' ? 'done'
          : e.act === 'propose' ? 'propose' : e.act === 'inform' ? 'inform' : e.act === 'refuse' ? 'refuse' : 'request';
        const d = flightPath(from === 'you' ? 'hub' : from, dest);
        if (d) add.push({ key: `${e.id}-${to}-${n++}`, d, kind });
      }
      if (!add.length) return;
      setFlights((prev) => [...prev, ...add].slice(-MAX_TOKENS));
      window.setTimeout(() => setFlights((prev) => prev.filter((f) => !add.includes(f))), 2000);
    };
    const off = window.cth.onHiveMessage(fly);
    // Demo mode has no real hive, so the mock loop sends its own handoffs.
    const onDemo = (ev: Event) => {
      const d = (ev as CustomEvent<{ from: string; to: string; act: string }>).detail;
      fly({ id: 'demo', from: d.from, to: d.to, act: d.act });
    };
    window.addEventListener('cth:demo-handoff', onDemo);
    return () => { off(); window.removeEventListener('cth:demo-handoff', onDemo); };
  }, [godId]);

  return flights.map((f) => <Token key={f.key} d={f.d} kind={f.kind} T={T} />);
}

function flightPath(from: Pt | 'hub', to: Pt | 'hub' | 'you'): string | null {
  if (to === 'you') {
    const [x0, y0] = HUB_TOP;
    return `M${x0 + 16},${y0 + 2} C700,400 960,400 ${EXIT[0]},${EXIT[1]}`;
  }
  if (from === 'hub' && to !== 'hub') return dpath(curvePts(HUB, to, bendFor(to), 13));
  if (from !== 'hub' && to === 'hub') return dpath(curvePts(from, HUB, -bendFor(from), 13));
  if (from !== 'hub' && to !== 'hub') return dpath(hopPts(from, to, 60, 60, 58));
  return null;
}

function Token({ d, kind, T }: { d: string; kind: Flight['kind']; T: ReturnType<typeof sceneTokens> }) {
  const ref = useRef<SVGAnimateMotionElement | null>(null);
  useEffect(() => { try { ref.current?.beginElement(); } catch { /* no SMIL */ } }, []);
  const color = kind === 'you' ? T.coral : kind === 'question' ? T.violet : kind === 'done' ? T.green
    : kind === 'propose' ? T.amber : kind === 'inform' ? '#B4B1C6' : kind === 'refuse' ? '#4A4660' : T.req;
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
      <g>
        <animateMotion ref={ref} dur="1.6s" begin="indefinite" fill="freeze" path={d} />
        <circle r={11} fill={color} opacity={0.16} />
        {kind === 'question' || kind === 'you' ? (
          <>
            <circle r={8.5} fill={color} />
            <text y={3.8} textAnchor="middle" fontFamily="Sora, sans-serif" fontWeight={700} fontSize={10.5} fill="#fff">{kind === 'you' ? '!' : '?'}</text>
          </>
        ) : kind === 'done' ? (
          <>
            <circle r={8.5} fill={color} />
            <path d="M-4,0 l3,2.8 l5.2,-5" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <rect x={-9} y={-6.5} width={18} height={13} rx={2.5} fill={T.tokBg} stroke={color} strokeWidth={1.4} />
            <path d="M-9,-6 L0,1 L9,-6" fill="none" stroke={color} strokeWidth={1.1} strokeLinejoin="round" />
          </>
        )}
      </g>
    </g>
  );
}

/* ── Idle quote (DESIGN.md 8.8) ───────────────────────────────────────────── */

function useIdleQuote(pods: PodPlan<Agent>[], paused: boolean): { agentId: string; text: string; key: number } | null {
  const [quote, setQuote] = useState<{ agentId: string; text: string; key: number } | null>(null);
  const podsRef = useRef(pods);
  podsRef.current = pods;
  useEffect(() => {
    if (paused || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setQuote(null); return; }
    let timer: number | undefined;
    let hide: number | undefined;
    let n = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        const idle = podsRef.current.flatMap((p) => p.members).filter((a) => a.status === 'idle');
        if (idle.length) {
          const a = idle[Math.floor(Math.random() * idle.length)];
          const text = pickSoloLine(a.character, 'coffee', Math.floor(Math.random() * 1000));
          setQuote({ agentId: a.id, text, key: n++ });
          hide = window.setTimeout(() => setQuote(null), 6000);
        }
        schedule();
      }, 45_000 + Math.random() * 45_000);
    };
    schedule();
    return () => { window.clearTimeout(timer); window.clearTimeout(hide); };
  }, [paused]);
  return quote;
}
