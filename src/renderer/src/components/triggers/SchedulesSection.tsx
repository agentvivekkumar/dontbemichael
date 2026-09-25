import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PixelButton } from '../PixelButton';
import { useStore } from '@/store/store';
import {
  Chip, Field, Hint, MiniButton, Muted, Select, SchedulePicker, SubCard, SubHeader,
  Toggle, fmtInterval, inputStyle, textareaStyle, weeklyDraft, weeklyIsUsable,
  type WeeklyDraft
} from './ui';
import { formatWeekly, nextWeeklyFireMs } from '@shared/weeklySchedule';
import { useRtl } from '@/i18n/useDirection';

/**
 * SCHEDULES — recurring auto-dispatched missions.
 *
 * A schedule says when and which job (owner, 2026-09-25): its label names the
 * job, and the agent does it the way its Work style says. There is no prompt:
 * a free-text prompt on each schedule competed with the Work style and drifted
 * from it. Every run sends the same short message (scheduleMessage.ts).
 *
 * An older schedule may still carry a prompt (`body`). It is shown on the card,
 * still sent after the standard message, and can be moved into the agent's Work
 * style or removed; it is never silently dropped. The heartbeat keeps its own
 * description box for now (TODOS.md).
 */

/** Mirrors `ScheduledMission` in src/main/config.ts (and preload). Declared here
 *  so this component owns no cross-package import. */
interface ScheduledMission {
  id: string;
  label: string;
  intervalMs: number;
  to: string;
  body: string;
  enabled: boolean;
  autoCompact?: boolean;
  lastFiredAt?: number;
  kind?: 'dispatch' | 'heartbeat' | 'compact';
  quietThresholdMs?: number;
  /** Day-of-week + time. Present ⇒ this replaces intervalMs (main/config.ts). */
  weekly?: { days: number[]; minute: number };
}

const DEFAULT_INTERVAL_MS = 3_600_000;

/** Relative-time label. Needs the translator because the qualifiers ("ago",
 *  "in", "just now") are UI copy, not data. */
function relTime(ms: number, t: TFunction): string {
  const past = ms >= 0;
  const a = Math.abs(ms);
  if (a < 45_000) return t('schedulesSection.justNow');
  const mins = Math.round(a / 60_000);
  const unit = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return past ? t('schedulesSection.ago', { unit }) : t('schedulesSection.in', { unit });
}

export function SchedulesSection({ onSummary }: { onSummary?: (s: string) => void }) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const agents = useStore((s) => s.agents);
  const [missions, setMissions] = useState<ScheduledMission[]>([]);
  const [adding, setAdding] = useState(false);
  const [mLabel, setMLabel] = useState('');
  const [mInterval, setMInterval] = useState<number>(DEFAULT_INTERVAL_MS);
  // null ⇒ the interval above is what runs. Non-null ⇒ days and a time do.
  const [mWeekly, setMWeekly] = useState<WeeklyDraft | null>(null);
  const [mTo, setMTo] = useState<string>('god');
  const updateAgent = useStore((s) => s.updateAgent);

  useEffect(() => {
    const load = () => { window.cth.listMissions().then(setMissions).catch(() => { /* noop */ }); };
    load();
    // Refresh "last fired" when the scheduler stamps a beat/dispatch.
    return window.cth.onMissionsUpdated(load);
  }, []);

  useEffect(() => {
    const on = missions.filter((m) => m.enabled).length;
    onSummary?.(missions.length === 0 ? t('schedulesSection.summaryNone') : t('schedulesSection.summary', { on, total: missions.length }));
  }, [missions, onSummary, t]);

  // Optimistic: the list is the truth on screen the moment you click, and the
  // write is fire-and-forget (the house pattern across the Command Center).
  const persist = (next: ScheduledMission[]) => {
    setMissions(next);
    void window.cth.saveMissions(next).catch(() => { /* noop */ });
  };
  const patch = (id: string, fields: Partial<ScheduledMission>) =>
    persist(missions.map((m) => (m.id === id ? { ...m, ...fields } : m)));
  // The backend merge in missions:save keeps only what the renderer sends back,
  // so deleting is "save the list without it".
  const remove = (id: string) => persist(missions.filter((m) => m.id !== id));

  const add = () => {
    if (!mLabel.trim() || !whenIsUsable) return;
    persist([...missions, {
      id: `m_${Date.now().toString(36)}`,
      label: mLabel.trim(),
      // The interval rides along even in weekly mode, so flipping back to
      // "every…" later restores the cadence rather than a default.
      intervalMs: mInterval,
      ...(mWeekly ? { weekly: mWeekly } : {}),
      to: mTo,
      body: '',
      enabled: true
    }]);
    setMLabel(''); setMWeekly(null); setAdding(false);
  };
  /** A weekly draft with no days picked would never fire, so it cannot be saved. */
  const whenIsUsable = !mWeekly || weeklyIsUsable(mWeekly);

  /** An older schedule's instructions, appended to the target agent's Work
   *  style (where the how belongs), then cleared from the schedule. */
  const moveToWorkStyle = (m: ScheduledMission) => {
    const agent = agents.find((a) => a.id === m.to);
    const text = m.body.trim();
    if (!agent || !text) return;
    updateAgent(agent.id, { goal: [agent.goal?.trim(), `${m.label}: ${text}`].filter(Boolean).join('\n\n') });
    patch(m.id, { body: '' });
  };

  const targetName = (to: string) =>
    to === 'broadcast' ? t('schedulesSection.everyone')
      : to === 'god' ? (agents.find((a) => a.isGod)?.name ?? 'the orchestrator')
        : agents.find((a) => a.id === to)?.name ?? to;

  return (
    <>
      {missions.length === 0 && <Muted>{t('schedulesSection.nothingScheduled')}</Muted>}
      {missions.map((m) => (
        <MissionRow
          key={m.id}
          mission={m}
          targetName={targetName}
          agents={agents}
          onPatch={(fields) => patch(m.id, fields)}
          onDelete={() => remove(m.id)}
          onMoveToWorkStyle={agents.some((a) => a.id === m.to) ? () => moveToWorkStyle(m) : undefined}
        />
      ))}

      {!adding && (
        <div style={{ marginTop: 8 }}>
          <PixelButton variant="secondary" size="sm" onClick={() => setAdding(true)}>{t('schedulesSection.addSchedule')}</PixelButton>
        </div>
      )}
      {adding && (
        <SubCard>
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-500)' }}>{t('schedulesSection.newSchedule')}</div>
          <Field label={t('schedulesSection.label')}>
            <input
              value={mLabel}
              onChange={(e) => setMLabel(e.target.value)}
              placeholder={t('schedulesSection.labelPlaceholder')}
              style={inputStyle}
            />
            <Hint>{t('schedulesSection.labelHint')}</Hint>
          </Field>
          <Field label={t('schedulesSection.goesTo')}>
            <Select value={mTo} onChange={setMTo} style={{ width: '100%' }}>
              <option value="broadcast">{t('schedulesSection.everyone')}</option>
              <option value="god">{agents.find((a) => a.isGod)?.name ?? 'the orchestrator'}</option>
              {agents.filter((a) => !a.isGod).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label={t('schedulesSection.when')}>
            <SchedulePicker
              intervalMs={mInterval}
              weekly={mWeekly}
              onInterval={setMInterval}
              onWeekly={setMWeekly}
            />
          </Field>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <PixelButton variant="primary" size="sm" onClick={add} disabled={!mLabel.trim() || !whenIsUsable}>
              {t('common.add')}
            </PixelButton>
            <PixelButton variant="ghost" size="sm" onClick={() => { setAdding(false); setMLabel(''); setMWeekly(null); }}>
              {t('common.cancel')}
            </PixelButton>
          </div>
        </SubCard>
      )}
    </>
  );
}

/* ─────────────────────────────── one mission ─────────────────────────────── */

interface RosterAgent { id: string; name: string; isGod?: boolean }

function MissionRow({ mission, targetName, agents, onPatch, onDelete, onMoveToWorkStyle }: {
  mission: ScheduledMission;
  targetName: (to: string) => string;
  agents: RosterAgent[];
  onPatch: (fields: Partial<ScheduledMission>) => void;
  onDelete: () => void;
  /** Present when the schedule goes to one agent whose Work style can take it. */
  onMoveToWorkStyle?: () => void;
}) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(mission.label);
  const [to, setTo] = useState(mission.to);
  const [intervalMs, setIntervalMs] = useState(mission.intervalMs);
  const [weekly, setWeekly] = useState<WeeklyDraft | null>(weeklyDraft(mission.weekly));
  const [body, setBody] = useState(mission.body);
  const [saved, setSaved] = useState(false);

  // Seed the draft when the row opens — never on every render, or the scheduler
  // stamping `lastFiredAt` mid-edit would wipe what you are typing.
  useEffect(() => {
    if (!open) return;
    setLabel(mission.label);
    setTo(mission.to);
    setIntervalMs(mission.intervalMs);
    setWeekly(weeklyDraft(mission.weekly));
    setBody(mission.body);
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const heartbeat = mission.kind === 'heartbeat';
  // Instructions an older schedule still carries (not the heartbeat's own box).
  const legacy = heartbeat ? '' : mission.body.trim();
  const storedWeekly = weeklyDraft(mission.weekly);
  // Compare the CANONICAL form, not the raw object: [1,3] and [3,1] mean the
  // same schedule, and a row that reads as dirty after a no-op click is noise.
  const weeklyKey = (w: WeeklyDraft | null) => (w ? `${[...w.days].sort((a, b) => a - b).join(',')}@${w.minute}` : '');
  const dirty = label !== mission.label || to !== mission.to
    || intervalMs !== mission.intervalMs || (heartbeat && body !== mission.body)
    || weeklyKey(weekly) !== weeklyKey(storedWeekly);
  const whenIsUsable = !weekly || weeklyIsUsable(weekly);

  const fired = mission.lastFiredAt
    ? t('schedulesSection.fired', { time: relTime(Date.now() - mission.lastFiredAt, t) })
    : t('schedulesSection.notFired');
  // A weekly mission's next run comes from the calendar, not from lastFiredAt +
  // interval — and unlike the interval case it is knowable before the first run,
  // so a schedule that has never fired can still say when it will.
  const nextAt = storedWeekly
    ? nextWeeklyFireMs(storedWeekly, Date.now())
    : mission.lastFiredAt ? mission.lastFiredAt + mission.intervalMs : null;
  const next = mission.enabled && nextAt !== null
    ? ` · ${t('schedulesSection.next', { time: relTime(Date.now() - nextAt, t) })}`
    : '';

  const save = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    // Fold the trim back into the draft too, or the row would read as still
    // dirty against a label that was only ever going to be stored trimmed.
    setLabel(trimmed);
    // `weekly: undefined` is the switch back to interval mode. It has to be sent
    // explicitly — the backend merges by id and spreads, so simply omitting the
    // key would leave the old schedule in place and the row would snap back.
    onPatch({ label: trimmed, to, intervalMs, ...(heartbeat ? { body } : {}), weekly: weekly ?? undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 1300);
  };

  return (
    <SubCard>
      <SubHeader
        open={open}
        onToggle={() => setOpen((o) => !o)}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Chip tone={mission.enabled ? 'on' : 'off'}>
              {heartbeat ? t('schedulesSection.beat') : storedWeekly ? formatWeekly(storedWeekly) : fmtInterval(mission.intervalMs)}
            </Chip>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mission.label}
            </span>
          </span>
        }
        sub={<>{`→ ${targetName(mission.to)}`} · {fired}{next}</>}
        right={<Toggle on={mission.enabled} onClick={() => onPatch({ enabled: !mission.enabled })} />}
      />

      {/* Closed: the heartbeat's description, or an older schedule's
          instructions still waiting to move into a Work style. */}
      {!open && (heartbeat || legacy) && (
        <div style={{
          marginTop: 6, padding: '4px 6px',
          background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
          fontFamily: 'var(--cth-font-mono)', fontSize: 11, lineHeight: '15px',
          color: 'var(--cth-ink-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{mission.body.trim() || t('schedulesSection.noPrompt')}</div>
      )}
      {!open && !heartbeat && !legacy && <Hint>{t('schedulesSection.runsLabel')}</Hint>}

      {open && (
        <div style={{ marginTop: 4 }}>
          <Field label={t('schedulesSection.label')}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t('schedulesSection.goesTo')}>
            <Select value={to} onChange={setTo} style={{ width: '100%' }}>
              <option value="broadcast">{t('schedulesSection.everyone')}</option>
              <option value="god">{agents.find((a) => a.isGod)?.name ?? 'the orchestrator'}</option>
              {agents.filter((a) => !a.isGod).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label={t('schedulesSection.when')}>
            {/* The heartbeat has no calendar: it is a cadence that adapts to how
                busy the floor is, so pinning it to Tuesdays would be a lie. */}
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
                fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-700)', whiteSpace: 'pre-wrap'
              }}>{legacy}</div>
              <Hint>{t('schedulesSection.olderInstructionsHint', { name: targetName(mission.to) })}</Hint>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {onMoveToWorkStyle && (
                  <MiniButton onClick={onMoveToWorkStyle}>{t('schedulesSection.moveToWorkStyle', { name: targetName(mission.to) })}</MiniButton>
                )}
                <MiniButton tone="danger" onClick={() => onPatch({ body: '' })}>{t('schedulesSection.removeOlder')}</MiniButton>
              </div>
            </Field>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <PixelButton variant="primary" size="sm" onClick={save} disabled={!dirty || !label.trim() || !whenIsUsable}>
              {saved && !dirty ? t('schedulesSection.saved') : t('common.save')}
            </PixelButton>
            <span style={{ flex: 1 }} />
            <MiniButton tone="danger" onClick={onDelete}>{t('common.delete')}</MiniButton>
          </div>
        </div>
      )}
    </SubCard>
  );
}
