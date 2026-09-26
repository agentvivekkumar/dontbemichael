import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PixelButton } from '../PixelButton';
import { useStore } from '@/store/store';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { isComposingKey } from '@shared/imeGuard';
import {
  Field, Hint, MiniButton, SchedulePicker, Toggle, fmtInterval, inputStyle, textareaStyle,
  weeklyDraft, weeklyIsUsable, type WeeklyDraft
} from './ui';
import { formatWeekly } from '@shared/weeklySchedule';
import { GOD_ALIAS, missionsFor, nextRunAt, ownerOf, OWNER, type ScheduledMission } from '@shared/missions';
import { useRtl } from '@/i18n/useDirection';

/**
 * SCHEDULES, per agent (docs/designs/per-agent-schedules.md).
 *
 * A schedule belongs to the agent that runs it, so there is no "goes to"
 * picker: a schedule added on Pam's tab is Pam's. Two modes share one row:
 *
 * - `agent`: that agent's own schedules, editable. Lives in the agent panel's
 *   Schedules tab, and at the top of Michael's Triggers tab for his own jobs.
 * - `office`: every other agent's schedules, read only, grouped by agent. A row
 *   jumps to that agent's tab with the row open (design 1A).
 *
 * Each change is one operation on one schedule (upsert, delete, setEnabled), and
 * the row waits for main's answer: on a failure it goes back to what is saved
 * and says so, because a toggle that looks off while the job still runs is the
 * worst kind of wrong (design 7A).
 *
 * An agent never changes a schedule itself. It asks, and the owner decides in
 * ASK ME (owner, 2026-09-25); an approved change shows here as "added by Pam".
 */

/* ─────────────────────────── the shared list ─────────────────────────── */

let subscribed = false;
function refreshMissions(): void {
  window.cth.listMissions()
    .then((list) => useStore.getState().setMissions(list, 'ready'))
    .catch(() => useStore.getState().setMissions(useStore.getState().missions, 'error'));
}

/** Every schedule in the office, kept current from main. One subscription for
 *  the whole app, started by the first view that needs it. */
export function useMissions(): { missions: ScheduledMission[]; status: 'loading' | 'ready' | 'error'; retry: () => void } {
  const missions = useStore((s) => s.missions);
  const status = useStore((s) => s.missionsStatus);
  useEffect(() => {
    if (subscribed) return;
    subscribed = true;
    refreshMissions();
    // Refresh when the scheduler stamps a run or any view changes a schedule.
    window.cth.onMissionsUpdated(refreshMissions);
  }, []);
  return { missions, status, retry: () => { useStore.setState({ missionsStatus: 'loading' }); refreshMissions(); } };
}

/** The god agent's id on the floor, for ownership (schedules say 'god'). */
export function useGodId(): string {
  return useStore((s) => s.agents.find((a) => a.isGod)?.id) ?? GOD_ALIAS;
}

/** One save at a time: `busy` while it runs, `failed` if it didn't land (7A).
 *  `after` runs only on success. Shared by a row, the add form and ASK ME. */
export function useSaveOp(): {
  busy: boolean; failed: boolean; setFailed: (v: boolean) => void;
  run: (op: () => Promise<{ ok: boolean }>, after?: () => void) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async (op: () => Promise<{ ok: boolean }>, after?: () => void) => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await op();
      if (!res.ok) { setFailed(true); return; }
      after?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return { busy, failed, setFailed, run };
}

/** The loading line, or the load error with Try again, while nothing has loaded. */
function loadState(status: string, empty: boolean, errorText: string, retry: () => void, t: TFunction): ReactNode | null {
  if (!empty) return null;
  if (status === 'loading') return <Line>{t('schedulesSection.loading')}</Line>;
  if (status === 'error') {
    return (
      <div>
        <Line tone="error">{errorText}</Line>
        <PixelButton variant="secondary" size="sm" onClick={retry}>{t('schedulesSection.tryAgain')}</PixelButton>
      </div>
    );
  }
  return null;
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

const DEFAULT_INTERVAL_MS = 3_600_000;

/** Relative-time label ("now", "in 40 min", "2 hr. ago"), in the app language:
 *  `ms` is how long ago (positive) or how far ahead (negative). */
function relTime(ms: number, lang: string): string {
  const a = Math.abs(ms);
  const mins = Math.round(a / 60_000);
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    a < 45_000 ? [0, 'second'] : mins < 60 ? [mins, 'minute'] : mins < 1440 ? [Math.round(mins / 60), 'hour'] : [Math.round(mins / 1440), 'day'];
  try {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' }).format(ms >= 0 ? -n : n, unit);
  } catch {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }).format(ms >= 0 ? -n : n, unit);
  }
}

/** What the when chip says: the calendar, the interval, or the heartbeat. */
export function whenText(m: Pick<ScheduledMission, 'kind' | 'weekly' | 'intervalMs'>, t: TFunction): string {
  if (m.kind === 'heartbeat') return t('schedulesSection.beat');
  const w = weeklyDraft(m.weekly);
  return w ? formatWeekly(w) : fmtInterval(m.intervalMs);
}

/** The 14px when chip (owner-read text never goes below 14px). */
function WhenChip({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span style={{
      flexShrink: 0, padding: '2px 6px',
      fontFamily: 'var(--cth-font-ui)', fontSize: 14, lineHeight: '20px', fontWeight: 600,
      background: on ? 'var(--cth-lemon-light)' : 'var(--cth-cream-300)',
      color: on ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)'
    }}>{children}</span>
  );
}

function Line({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'error' }) {
  return (
    <div role={tone === 'error' ? 'alert' : undefined} style={{
      fontSize: 14, lineHeight: '20px', padding: '8px 0',
      color: tone === 'error' ? 'var(--cth-coral)' : 'var(--cth-ink-700)'
    }}>{tone === 'error' ? `! ${children}` : children}</div>
  );
}

/* ──────────────────────────────── one row ──────────────────────────────── */

interface RowProps {
  mission: ScheduledMission;
  /** Who a `createdBy` agent id is, for "added by Pam". */
  nameOf: (id: string) => string;
  /** Read only: no toggle and no editor. With `onJump`, the row jumps to the
   *  owner's tab; without it (a closed agent) the row is plain text. */
  readOnly?: boolean;
  onJump?: () => void;
  jumpLabel?: string;
  /** Open on mount (a jump from Michael's list landed here). */
  focusSeq?: number;
  /** Move an older schedule's instructions into the owner's Work style. */
  onMoveToWorkStyle?: () => void;
  ownerName: string;
}

function ScheduleRow({ mission, nameOf, readOnly, onJump, jumpLabel, focusSeq, onMoveToWorkStyle, ownerName }: RowProps) {
  const { t, i18n } = useTranslation();
  const rtl = useRtl();
  const godName = useResolvedGodName();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(mission.label);
  const [intervalMs, setIntervalMs] = useState(mission.intervalMs);
  const [weekly, setWeekly] = useState<WeeklyDraft | null>(weeklyDraft(mission.weekly));
  const [body, setBody] = useState(mission.body);
  const [saved, setSaved] = useState(false);
  const { busy, failed, setFailed, run } = useSaveOp();
  const [confirming, setConfirming] = useState(false);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);

  // A jump from Michael's list opens this row and brings it into view.
  useEffect(() => {
    if (!focusSeq) return;
    setOpen(true);
    headerRef.current?.scrollIntoView({ block: 'nearest' });
    headerRef.current?.focus();
  }, [focusSeq]);

  // Seed the draft when the row opens, never on every render, or the scheduler
  // stamping lastFiredAt mid-edit would wipe what you are typing.
  useEffect(() => {
    if (!open) return;
    setLabel(mission.label);
    setIntervalMs(mission.intervalMs);
    setWeekly(weeklyDraft(mission.weekly));
    setBody(mission.body);
    setSaved(false);
    setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const heartbeat = mission.kind === 'heartbeat';
  const legacy = heartbeat ? '' : mission.body.trim();
  const storedWeekly = weeklyDraft(mission.weekly);
  const weeklyKey = (w: WeeklyDraft | null) => (w ? `${[...w.days].sort((a, b) => a - b).join(',')}@${w.minute}` : '');
  const dirty = label !== mission.label || intervalMs !== mission.intervalMs
    || (heartbeat && body !== mission.body) || weeklyKey(weekly) !== weeklyKey(storedWeekly);
  const whenIsUsable = !weekly || weeklyIsUsable(weekly);

  const now = Date.now();
  const nextAt = nextRunAt(mission, now);
  const creator = !mission.createdBy || mission.createdBy === OWNER
    ? t('schedulesSection.addedByYou')
    : t('schedulesSection.addedBy', { name: nameOf(mission.createdBy) });
  const sub = [
    mission.lastFiredAt ? t('schedulesSection.fired', { time: relTime(now - mission.lastFiredAt, i18n.language) }) : t('schedulesSection.notFired'),
    nextAt !== null ? t('schedulesSection.next', { time: relTime(now - nextAt, i18n.language) }) : null,
    creator
  ].filter(Boolean).join(', ');

  const save = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setLabel(trimmed);
    // `weekly: undefined` is the switch back to interval mode.
    void run(() => window.cth.upsertMission({
      ...mission, label: trimmed, intervalMs, ...(heartbeat ? { body } : {}), weekly: weekly ?? undefined
    }), () => { setSaved(true); setTimeout(() => setSaved(false), 1300); });
  };
  const toggle = () => { void run(() => window.cth.setMissionEnabled(mission.id, !mission.enabled)); };
  const remove = () => { void run(() => window.cth.deleteMission(mission.id)); };
  const cancelDelete = () => { setConfirming(false); setTimeout(() => deleteRef.current?.focus(), 0); };

  const headerStyle = {
    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: rtl ? 'right' : 'left',
    padding: '8px 4px', border: 'none', background: 'transparent'
  } as const;
  const headerBody = (
    <>
      <WhenChip on={mission.enabled}>{whenText(mission, t)}</WhenChip>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontFamily: 'var(--cth-font-ui)', fontSize: 14, lineHeight: '20px',
          color: 'var(--cth-ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{mission.label}</span>
        <span style={{
          display: 'block', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-500)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{mission.enabled ? sub : `${t('schedulesSection.paused')}, ${creator}`}</span>
      </span>
      {onJump && <span aria-hidden style={{ flexShrink: 0, fontSize: 14, color: 'var(--cth-ink-500)' }}>{rtl ? '‹' : '›'}</span>}
    </>
  );
  const header = readOnly && !onJump
    ? <div style={headerStyle}>{headerBody}</div>
    : (
      <button
        ref={headerRef}
        type="button"
        onClick={onJump ?? (() => setOpen((o) => !o))}
        aria-expanded={onJump ? undefined : open}
        aria-label={onJump ? jumpLabel : undefined}
        className="cth-schedule-row"
        style={{ ...headerStyle, cursor: 'pointer' }}
      >{headerBody}</button>
    );

  return (
    <div style={{ boxShadow: 'inset 0 -1px 0 var(--cth-ink-100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {header}
        {!readOnly && (
          <Toggle
            on={mission.enabled}
            onClick={toggle}
            disabled={busy}
            label={t('schedulesSection.runAria', { job: mission.label })}
          />
        )}
      </div>
      {mission.relay && <Hint>{t('schedulesSection.relayHint', { godName })}</Hint>}
      {failed && !open && <Line tone="error">{t('schedulesSection.saveFailed')}</Line>}

      {open && !readOnly && (
        <div
          style={{ padding: '4px 8px 12px', background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || isComposingKey(e.nativeEvent)) return;
            e.stopPropagation();
            if (confirming) cancelDelete(); else { setOpen(false); headerRef.current?.focus(); }
          }}
        >
          <Field label={t('schedulesSection.label')}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...inputStyle, fontSize: 14, lineHeight: '20px' }} />
          </Field>
          <Field label={t('schedulesSection.when')}>
            {heartbeat
              ? <SchedulePicker intervalMs={intervalMs} weekly={null} onInterval={setIntervalMs} onWeekly={() => { /* interval only */ }} />
              : <SchedulePicker intervalMs={intervalMs} weekly={weekly} onInterval={setIntervalMs} onWeekly={setWeekly} />}
            {heartbeat && <Hint>{t('schedulesSection.beatCeiling')}</Hint>}
          </Field>
          {heartbeat && (
            <Field label={t('schedulesSection.prompt')}>
              <textarea
                dir={rtl ? 'auto' : undefined}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder={t('schedulesSection.promptPlaceholder')}
                style={textareaStyle}
              />
            </Field>
          )}
          {!heartbeat && <Hint>{t('schedulesSection.labelHint')}</Hint>}
          {legacy && (
            <Field label={t('schedulesSection.olderInstructions')}>
              <div style={{
                padding: '4px 6px', background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-700)', whiteSpace: 'pre-wrap'
              }}>{legacy}</div>
              <Hint>{t('schedulesSection.olderInstructionsHint', { name: ownerName })}</Hint>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {onMoveToWorkStyle && (
                  <MiniButton onClick={onMoveToWorkStyle}>{t('schedulesSection.moveToWorkStyle', { name: ownerName })}</MiniButton>
                )}
                <MiniButton tone="danger" onClick={() => void run(() => window.cth.upsertMission({ ...mission, body: '' }))}>
                  {t('schedulesSection.removeOlder')}
                </MiniButton>
              </div>
            </Field>
          )}
          {failed && <Line tone="error">{t('schedulesSection.saveFailed')}</Line>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
            {confirming ? (
              <>
                <span style={{ fontSize: 14, color: 'var(--cth-ink-900)' }}>{t('schedulesSection.sure')}</span>
                <MiniButton tone="destructive" onClick={remove} disabled={busy} autoFocus>{t('schedulesSection.deleteIt')}</MiniButton>
                <MiniButton onClick={cancelDelete}>{t('schedulesSection.keep')}</MiniButton>
              </>
            ) : (
              <MiniButton tone="danger" onClick={() => setConfirming(true)} buttonRef={deleteRef}>{t('common.delete')}</MiniButton>
            )}
            <span style={{ flex: 1 }} />
            <PixelButton variant="primary" size="sm" onClick={save} disabled={busy || !dirty || !label.trim() || !whenIsUsable}>
              {saved && !dirty ? t('schedulesSection.saved') : t('common.save')}
            </PixelButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── add form ─────────────────────────────── */

function AddSchedule({ to, ownerName }: { to: string; ownerName: string }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [intervalMs, setIntervalMs] = useState<number>(DEFAULT_INTERVAL_MS);
  const [weekly, setWeekly] = useState<WeeklyDraft | null>(null);
  const { busy, failed, setFailed, run } = useSaveOp();
  const whenIsUsable = !weekly || weeklyIsUsable(weekly);
  const reset = () => { setAdding(false); setLabel(''); setWeekly(null); setFailed(false); };

  const add = async () => {
    if (!label.trim() || !whenIsUsable) return;
    await run(() => window.cth.upsertMission({
      id: `m_${Date.now().toString(36)}`,
      label: label.trim(),
      // The interval rides along even in weekly mode, so flipping back to
      // "every..." later restores the cadence rather than a default.
      intervalMs,
      ...(weekly ? { weekly } : {}),
      to,
      body: '',
      enabled: true,
      createdBy: OWNER
    }), reset);
  };

  if (!adding) {
    return (
      <div style={{ marginTop: 12 }}>
        <PixelButton variant="secondary" size="sm" onClick={() => setAdding(true)}>
          {t('schedulesSection.addFor', { name: ownerName })}
        </PixelButton>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12, padding: '4px 8px 12px', background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
      <Field label={t('schedulesSection.label')}>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('schedulesSection.labelPlaceholder')}
          style={{ ...inputStyle, fontSize: 14, lineHeight: '20px' }}
        />
        <Hint>{t('schedulesSection.labelHint')}</Hint>
      </Field>
      <Field label={t('schedulesSection.when')}>
        <SchedulePicker intervalMs={intervalMs} weekly={weekly} onInterval={setIntervalMs} onWeekly={setWeekly} />
      </Field>
      {failed && <Line tone="error">{t('schedulesSection.saveFailed')}</Line>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <PixelButton variant="primary" size="sm" onClick={() => void add()} disabled={busy || !label.trim() || !whenIsUsable}>
          {t('common.add')}
        </PixelButton>
        <PixelButton variant="ghost" size="sm" onClick={reset}>{t('common.cancel')}</PixelButton>
      </div>
    </div>
  );
}

/* ───────────────────────────── the list modes ───────────────────────────── */

function useNameOf(): (id: string) => string {
  const agents = useStore((s) => s.agents);
  const godName = useResolvedGodName();
  const [registry, setRegistry] = useState<Record<string, { name: string }>>({});
  useEffect(() => {
    window.cth.hiveRegistry().then((r) => setRegistry(r.agents ?? {})).catch(() => { /* names fall back to ids */ });
  }, []);
  return (id: string) => {
    if (id === GOD_ALIAS) return godName;
    const live = agents.find((a) => a.id === id);
    if (live?.isGod) return godName;
    return live?.name ?? registry[id]?.name ?? id;
  };
}

/** One agent's own schedules, editable. `agentId` is its floor id. */
export function AgentSchedules({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { t } = useTranslation();
  const { missions, status, retry } = useMissions();
  const godId = useGodId();
  const nameOf = useNameOf();
  const agents = useStore((s) => s.agents);
  const updateAgent = useStore((s) => s.updateAgent);
  const focus = useStore((s) => s.scheduleFocus);
  const mine = useMemo(() => missionsFor(missions, agentId, godId), [missions, agentId, godId]);
  const isGod = agentId === godId;
  // Michael's schedules keep the 'god' alias the router understands.
  const to = isGod ? GOD_ALIAS : agentId;

  const waiting = loadState(status, missions.length === 0, t('schedulesSection.loadError', { name: agentName }), retry, t);
  if (waiting) return waiting;

  const on = mine.filter((m) => m.enabled);
  const next = on.map((m) => nextRunAt(m, Date.now())).filter((x): x is number => x !== null).sort((a, b) => a - b)[0];
  const ordered = [...mine].sort((a, b) => (nextRunAt(a, Date.now()) ?? Infinity) - (nextRunAt(b, Date.now()) ?? Infinity));

  /** An older schedule's instructions, appended to the owner's Work style. */
  const moveToWorkStyle = (m: ScheduledMission) => {
    const agent = agents.find((a) => a.id === agentId);
    const text = m.body.trim();
    if (!agent || !text) return;
    updateAgent(agent.id, { goal: [agent.goal?.trim(), `${m.label}: ${text}`].filter(Boolean).join('\n\n') });
    void window.cth.upsertMission({ ...m, body: '' });
  };

  return (
    <div>
      {mine.length === 0 ? (
        <Line>{t('schedulesSection.emptyAgent', { name: agentName })}</Line>
      ) : (
        <Line>
          {t(on.length === 1 ? 'schedulesSection.agentSummary' : 'schedulesSection.agentSummaryPlural', { name: agentName, count: on.length })}
          {next !== undefined && ` ${t('schedulesSection.nextAt', { time: new Date(next).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })}`}
        </Line>
      )}
      <div style={{ boxShadow: mine.length ? 'inset 0 1px 0 var(--cth-ink-100)' : undefined }}>
        {ordered.map((m) => (
          <ScheduleRow
            key={m.id}
            mission={m}
            nameOf={nameOf}
            ownerName={agentName}
            focusSeq={focus?.missionId === m.id ? focus.seq : undefined}
            onMoveToWorkStyle={agents.some((a) => a.id === agentId) ? () => moveToWorkStyle(m) : undefined}
          />
        ))}
      </div>
      <AddSchedule to={to} ownerName={agentName} />
    </div>
  );
}

/** Every other agent's schedules, read only, grouped by agent. */
export function OfficeSchedules() {
  const { t } = useTranslation();
  const { missions, status, retry } = useMissions();
  const godId = useGodId();
  const nameOf = useNameOf();
  const agents = useStore((s) => s.agents);
  const openAgentSchedule = useStore((s) => s.openAgentSchedule);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    window.cth.hiveRegistry()
      .then((r) => setClosed(Object.fromEntries(Object.entries(r.agents ?? {}).map(([id, a]) => [id, !!a.closedByOwner]))))
      .catch(() => { /* no closed groups */ });
  }, [missions]);

  const waiting = loadState(status, missions.length === 0, t('schedulesSection.loadErrorOffice'), retry, t);
  if (waiting) return waiting;

  // Group by owner, Michael excluded (his jobs are the editable section above).
  // Roster order first, then anyone off the floor, so a closed agent still shows.
  const others = missions.filter((m) => ownerOf(m, godId) !== godId);
  const owners = [...new Set(others.map((m) => ownerOf(m, godId)))];
  const rosterIndex = (id: string) => { const i = agents.findIndex((a) => a.id === id); return i < 0 ? Infinity : i; };
  owners.sort((a, b) => rosterIndex(a) - rosterIndex(b));
  if (owners.length === 0) return <Line>{t('schedulesSection.officeEmpty')}</Line>;

  return (
    <div>
      {owners.map((owner) => {
        const name = nameOf(owner);
        const isClosed = closed[owner];
        const rows = others
          .filter((m) => ownerOf(m, godId) === owner)
          .sort((a, b) => (nextRunAt(a, Date.now()) ?? Infinity) - (nextRunAt(b, Date.now()) ?? Infinity));
        return (
          <section key={owner} aria-label={name} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600, color: 'var(--cth-ink-900)' }}>
              {isClosed ? t('schedulesSection.closedGroup', { name }) : name}
            </div>
            {isClosed && <Hint>{t('schedulesSection.closedNote', { name })}</Hint>}
            <div style={{ boxShadow: 'inset 0 1px 0 var(--cth-ink-100)' }}>
              {rows.map((m) => (
                <ScheduleRow
                  key={m.id}
                  mission={m}
                  nameOf={nameOf}
                  ownerName={name}
                  readOnly
                  // A closed agent has no panel to jump to, so its rows only read.
                  onJump={isClosed || !agents.some((a) => a.id === owner) ? undefined : () => openAgentSchedule(owner, m.id)}
                  jumpLabel={t('schedulesSection.openRow', { name, job: m.label })}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The close confirmation. When the agent has schedules running, it says they
 *  will pause (design 6A); otherwise it is the plain close question. */
export function closeConfirmText(agentId: string, name: string, t: TFunction): string {
  // The same ownership rule the close uses to pause them (pauseMissionsOf).
  const st = useStore.getState();
  const godId = st.agents.find((a) => a.isGod)?.id ?? GOD_ALIAS;
  const count = missionsFor(st.missions, agentId, godId).filter((m) => m.enabled).length;
  return count > 0
    ? t(count === 1 ? 'agentDetail.killConfirmSchedules' : 'agentDetail.killConfirmSchedulesPlural', { name, count })
    : t('agentDetail.killConfirm', { name });
}
