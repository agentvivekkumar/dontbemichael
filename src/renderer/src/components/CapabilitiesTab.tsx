import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Toggle, TriggerCard } from './triggers/ui';
import { AgentSchedules, useGodId, useMissions } from './triggers/ScheduleList';
import { useHarnessConfig } from '@/hooks/useHarnessConfig';
import { useStore, type Agent } from '@/store/store';
import { PROVIDER_PRESETS, type EmailCapability } from '@shared/mailboxes';
import { missionsFor } from '@shared/missions';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

type SectionKey = 'email' | 'schedules';
const LS_COLLAPSED = 'cth.capabilities.collapsed';
let handledFocusSeq: number | undefined;

/** Which sections this viewer folded away. A convenience only: every section
 *  opens when storage is missing or blocked. */
function readCollapsed(): Record<SectionKey, boolean> {
  try {
    const v = JSON.parse(window.localStorage.getItem(LS_COLLAPSED) ?? '{}') as Partial<Record<SectionKey, boolean>>;
    return { email: v.email === true, schedules: v.schedules === true };
  } catch { return { email: false, schedules: false }; }
}
function writeCollapsed(v: Record<SectionKey, boolean>): void {
  try { window.localStorage.setItem(LS_COLLAPSED, JSON.stringify(v)); } catch { /* noop */ }
}

/**
 * What a team member may do without asking, and the jobs it runs on a clock
 * (docs/designs/multi-mailbox.md, design review D-T3; schedules merged in by the
 * owner, 2026-09-26). Its own tab after Profile on every agent, Michael included.
 * Two sections, each folds away and the fold is remembered per viewer:
 *
 * - Email (design 2A): "Can check email", one Toggle row per mailbox (5A),
 *   Sending as two radio rows with Draft only first chosen (6A), one note, then
 *   the pending restart note (E2/E5).
 * - On a schedule: the agent's own jobs (docs/designs/per-agent-schedules.md),
 *   the same list and editor the Schedules tab had. A jump from the office
 *   schedule opens this section even if it was folded.
 *
 * Every change saves at once through main, which checks it and says whether
 * email just turned on; if it did and the agent is running, it is queued for a
 * restart (useHive effect 8).
 */
export function CapabilitiesTab({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const config = useHarnessConfig();
  const godName = useResolvedGodName();
  const pending = useStore((s) => s.pendingEmailRestart[agent.id]);
  const [failed, setFailed] = useState(false);
  const name = agent.isGod ? godName : agent.name;
  const godId = useGodId();
  const { missions } = useMissions();
  const mine = missionsFor(missions, agent.id, godId);
  const schedulesOn = mine.filter((m) => m.enabled).length;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const setFold = (key: SectionKey, open: boolean): void => {
    const next = { ...collapsed, [key]: !open };
    setCollapsed(next);
    writeCollapsed(next);
  };
  // A jump to one of this agent's schedules unfolds the section in the same
  // render, so the row can take focus (its effect runs before ours would).
  // The tab usually mounts because of the jump, so the last handled jump is
  // kept outside the component.
  const focus = useStore((s) => s.scheduleFocus);
  if (focus && focus.seq !== handledFocusSeq) {
    handledFocusSeq = focus.seq;
    if (collapsed.schedules && mine.some((m) => m.id === focus.missionId)) setCollapsed({ ...collapsed, schedules: false });
  }

  if (!config) return null;
  const mailboxes = config.mailboxes ?? [];
  const email: EmailCapability = config.agentCapabilities?.[agent.id]?.email ?? { enabled: false, mailboxes: [], send: false };

  const save = async (next: EmailCapability): Promise<void> => {
    setFailed(false);
    try {
      const res = await window.cth.mailSetCapabilities(agent.id, { email: next });
      if (!res.ok) { setFailed(true); return; }
      if (res.restartNeeded && agent.ptyId) useStore.getState().setPendingEmailRestart(agent.id, Date.now());
      if (!next.enabled) useStore.getState().setPendingEmailRestart(agent.id, undefined);
    } catch { setFailed(true); }
  };

  const toggleEmail = (): void => {
    // Design 6A: Draft only is chosen the first time email is turned on.
    void save(email.enabled ? { ...email, enabled: false } : { enabled: true, mailboxes: email.mailboxes, send: email.mailboxes.length ? email.send : false });
  };
  const toggleMailbox = (id: string): void => {
    const has = email.mailboxes.includes(id);
    void save({ ...email, mailboxes: has ? email.mailboxes.filter((m) => m !== id) : [...email.mailboxes, id] });
  };
  const setSend = (send: boolean): void => { if (send !== email.send) void save({ ...email, send }); };

  // Arrow keys move between the two sending choices (design 7A).
  const onRadioKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    setSend(!email.send);
    const target = e.currentTarget.querySelector<HTMLElement>(`[data-send="${!email.send}"]`);
    target?.focus();
  };

  const rows: Array<{ id: string; label: string; sub: string }> = [
    // Only mailboxes added in Settings. The Claude account's Gmail is not a
    // capability: one Settings switch covers every agent (owner, 2026-09-26).
    ...mailboxes.map((m) => ({ id: m.id, label: m.address, sub: (m.provider === 'other' ? t('mailboxes.other') : PROVIDER_PRESETS[m.provider].label) + (m.status === 'needs-attention' ? ` · ${t('mailboxes.statusNeeds')}` : '') }))
  ];

  const openSettings = (): void => { window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'Connections' } })); };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, background: 'var(--cth-paper-200)' }}>
      <div style={{ maxWidth: '72ch' }}>
        <div style={hint}>{t('capabilities.intro', { name })}</div>

        <div style={{ height: 8 }} />
        <TriggerCard
          title={t('capabilities.email')}
          blurb={t('capabilities.emailBlurb', { name })}
          summary={email.enabled ? t('capabilities.on') : t('capabilities.off')}
          open={!collapsed.email}
          onToggle={(open) => setFold('email', open)}
        >
        <div style={{ ...row, borderTop: 'none' }}>
          <div style={{ flex: 1, fontSize: 14 }}>{t('capabilities.canCheck')}</div>
          <Toggle on={email.enabled} label={t('capabilities.canCheck')} onClick={toggleEmail} />
        </div>

        {email.enabled && (
          <>
            {mailboxes.length === 0 && (
              <div style={{ ...notice, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
                {t('capabilities.noMailboxes')}{' '}
                <button type="button" onClick={openSettings} style={link}>{t('capabilities.addInSettings')}</button>
              </div>
            )}
            <div role="list">
              {rows.map((r) => (
                <div key={r.id} role="listitem" style={row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, wordBreak: 'break-all' }}>{r.label}</div>
                    <div style={hint}>{r.sub}</div>
                  </div>
                  <Toggle on={email.mailboxes.includes(r.id)} label={t('capabilities.mailboxToggle', { name, address: r.label })} onClick={() => toggleMailbox(r.id)} />
                </div>
              ))}
            </div>

            <div style={h13}>{t('capabilities.sending')}</div>
            <div role="radiogroup" aria-label={t('capabilities.sending')} onKeyDown={onRadioKey}>
              {[{ send: true, label: t('capabilities.canSend'), desc: t('capabilities.canSendDesc') }, { send: false, label: t('capabilities.draftOnly'), desc: t('capabilities.draftOnlyDesc') }].map((o, i) => (
                <button
                  key={String(o.send)}
                  type="button"
                  role="radio"
                  data-send={String(o.send)}
                  aria-checked={email.send === o.send}
                  tabIndex={email.send === o.send ? 0 : -1}
                  onClick={() => setSend(o.send)}
                  style={{ ...row, borderTop: i === 0 ? 'none' : row.borderTop, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'start', fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink-900)' }}
                >
                  <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, boxShadow: 'inset 0 0 0 1px var(--cth-ink-500)', background: 'var(--cth-paper-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {email.send === o.send && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cth-ink-900)' }} />}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 14 }}>{o.label}</span>
                    <span style={{ display: 'block', ...hint }}>{o.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            <div style={{ ...hint, marginTop: 10 }}>{t('capabilities.note', { name })}</div>
          </>
        )}

        <div aria-live="polite">
          {pending !== undefined && email.enabled && <div style={{ ...notice, background: 'var(--cth-lemon-light)' }}>{t('capabilities.pending', { name })}</div>}
          {failed && <div role="alert" style={{ ...notice, background: 'var(--cth-coral-light)' }}>! {t('capabilities.saveFailed')}</div>}
        </div>
        </TriggerCard>

        <TriggerCard
          title={t('capabilities.schedules')}
          blurb={t('capabilities.schedulesBlurb', { name })}
          summary={schedulesOn ? t('capabilities.schedulesOn', { count: schedulesOn }) : t('capabilities.schedulesNone')}
          open={!collapsed.schedules}
          onToggle={(open) => setFold('schedules', open)}
        >
          <AgentSchedules agentId={agent.id} agentName={name} />
        </TriggerCard>
      </div>
    </div>
  );
}

const hint: CSSProperties = { fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-500)' };
const h13: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--cth-ink-700)', margin: '16px 0 6px' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--cth-ink-100)' };
const notice: CSSProperties = { padding: '8px 10px', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-900)', marginTop: 8 };
const link: CSSProperties = { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)' };
