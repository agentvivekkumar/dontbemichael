import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Toggle, TriggerCard, MiniButton } from './triggers/ui';
import { AgentSchedules, useGodId, useMissions } from './triggers/ScheduleList';
import { useHarnessConfig } from '@/hooks/useHarnessConfig';
import { useStore, type Agent } from '@/store/store';
import { type EmailCapability, mailboxHolder } from '@shared/mailboxes';
import { missionsFor } from '@shared/missions';
import { quickbooksCapability, type QuickBooksCapability } from '@shared/quickbooks';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

type SectionKey = 'email' | 'books' | 'schedules';

/**
 * What a team member may do without asking, and the jobs it runs on a clock
 * (docs/designs/multi-mailbox.md, design review D-T3; schedules merged in by the
 * owner, 2026-09-26). Its own tab after Profile on every agent, Michael included.
 * Two sections, both closed whenever the tab opens, like every section on
 * every agent tab (owner, 2026-09-26); the header chip says what is inside:
 *
 * - Email: the section header carries the one on/off switch (owner,
 *   2026-09-26). With email on, the body is the agent's one mailbox, picked
 *   from a list (or a link to Settings when none is set up), then Sending with Draft only first chosen (6A), then
 *   the pending restart note (E2/E5).
 * - QuickBooks: the Claude account's QuickBooks connector (owner,
 *   2026-09-29), shown only once it is on in Settings. The header switch, then Read only or Can make changes. The
 *   hook reads it on the agent's next call, so nothing restarts. Before the
 *   owner chooses, roles that read the books (Oscar) are on, Read only.
 * - On a schedule: the agent's own jobs (docs/designs/per-agent-schedules.md),
 *   the same list and editor the Schedules tab had.
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
  // A mailbox another agent holds, waiting for the owner to confirm the move.
  const [moving, setMoving] = useState<string | null>(null);
  const agents = useStore((s) => s.agents);
  const name = agent.isGod ? godName : agent.name;
  const godId = useGodId();
  const { missions } = useMissions();
  const mine = missionsFor(missions, agent.id, godId);
  const schedulesOn = mine.filter((m) => m.enabled).length;
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({ email: true, books: true, schedules: true });
  // Unknown until main answers for this agent (the card stays hidden), so
  // Oscar's switch never shows off while the hook treats him as on, and
  // another agent's answer never shows.
  const [booksAnswer, setBooksAnswer] = useState<{ id: string; on: boolean } | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void window.cth.quickbooksRoleDefaults().then((ids) => { if (alive) setBooksAnswer({ id: agent.id, on: ids.includes(agent.id) }); }).catch(() => {});
    return () => { alive = false; };
  }, [agent.id]);
  const booksDefault = booksAnswer?.id === agent.id ? booksAnswer.on : undefined;
  const setFold = (key: SectionKey, open: boolean): void => setCollapsed({ ...collapsed, [key]: !open });

  if (!config) return null;
  const mailboxes = config.mailboxes ?? [];
  const email: EmailCapability = config.agentCapabilities?.[agent.id]?.email ?? { enabled: false, mailboxes: [], send: false };

  const save = async (next: EmailCapability, move = false): Promise<void> => {
    setFailed(false);
    try {
      const res = await window.cth.mailSetCapabilities(agent.id, { email: next, ...(move ? { move: true } : {}) });
      // Someone took the mailbox since the list was drawn: ask to move it.
      if (!res.ok && res.heldBy && next.mailboxes[0]) { setMoving(next.mailboxes[0]); return; }
      if (!res.ok) { setFailed(true); return; }
      setMoving(null);
      if (res.restartNeeded && agent.ptyId) useStore.getState().setPendingEmailRestart(agent.id, Date.now());
      if (!next.enabled) useStore.getState().setPendingEmailRestart(agent.id, undefined);
    } catch { setFailed(true); }
  };

  // One mailbox per agent (owner, 2026-09-26). Turning email on or off always
  // leaves the mailbox unpicked and sending on Draft only (design 6A).
  const known = new Set(mailboxes.map((m) => m.id));
  const current = email.mailboxes.find((id) => known.has(id));
  const toggleEmail = (): void => {
    // Off clears the mailbox and sending too, so turning email on again starts
    // from nothing picked (owner, 2026-09-26).
    if (email.enabled) { void save({ enabled: false, mailboxes: [], send: false }); return; }
    // Turning email on opens the section, so the mailbox and sending show.
    setCollapsed({ ...collapsed, email: false });
    // No mailbox is chosen for the owner (owner, 2026-09-26): the list starts on
    // "Pick a mailbox", and sending starts Draft only.
    void save({ enabled: true, mailboxes: [], send: false });
  };
  // One agent per mailbox (owner, 2026-09-27): a mailbox another agent holds
  // is moved only after the owner confirms, and the holder's email goes off.
  // An id no longer on the team (a fired or failed hire) doesn't hold anything.
  const onTeam = (id: string): boolean => agents.some((a) => a.id === id) || useStore.getState().archivedAgents.some((a) => a.id === id);
  const holderOf = (id: string): string | undefined => {
    const h = mailboxHolder(config.agentCapabilities, id, agent.id);
    return h && onTeam(h) ? h : undefined;
  };
  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.name ?? id;
  const pickMailbox = (id: string): void => {
    if (id === current) return;
    if (holderOf(id)) { setMoving(id); return; }
    // A left-over holder that isn't on the team is moved without asking.
    void save({ ...email, mailboxes: [id] }, !!mailboxHolder(config.agentCapabilities, id, agent.id));
  };
  const movingHolder = moving ? holderOf(moving) : undefined;
  const movingAddress = moving ? mailboxes.find((m) => m.id === moving)?.address ?? moving : '';
  const setSend = (send: boolean): void => { if (send !== email.send) void save({ ...email, send }); };

  // Just the address; a word only when the mailbox needs the owner.
  const mailboxOptions = mailboxes.map((m) => {
    const holder = holderOf(m.id);
    return {
      value: m.id,
      label: m.address,
      desc: [holder ? t('capabilities.heldBy', { name: nameOf(holder) }) : '', m.status === 'needs-attention' ? t('mailboxes.statusNeeds') : '']
        .filter(Boolean).join(t('profile.listJoiner')) || undefined
    };
  });

  const books = quickbooksCapability(config.agentCapabilities?.[agent.id]?.quickbooks, booksDefault === true);
  const saveBooks = async (next: QuickBooksCapability): Promise<void> => {
    setFailed(false);
    try {
      const res = await window.cth.quickbooksSetAccess(agent.id, next);
      if (!res.ok) setFailed(true);
    } catch { setFailed(true); }
  };
  // Turning QuickBooks on opens the section, so Read only shows; it always
  // starts Read only.
  const toggleBooks = (): void => {
    if (books.enabled) { void saveBooks({ enabled: false, changes: false }); return; }
    setCollapsed({ ...collapsed, books: false });
    void saveBooks({ enabled: true, changes: false });
  };

  const openSettings = (): void => { window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'Connections' } })); };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
      <div style={{ maxWidth: '72ch' }}>
        <div style={hint}>{t('capabilities.intro', { name })}</div>

        <div style={{ height: 8 }} />
        <TriggerCard
          title={t('capabilities.email')}
          blurb={t('capabilities.emailBlurb', { name })}
          action={<Toggle on={email.enabled} label={t('capabilities.canCheck', { name })} onClick={toggleEmail} />}
          open={!collapsed.email}
          onToggle={(open) => setFold('email', open)}
        >
          {!email.enabled ? (
            <div style={hint}>{t('capabilities.emailOff', { name })}</div>
          ) : (
            <>
              {mailboxes.length === 0 ? (
                <div style={{ ...notice, marginTop: 0, background: 'var(--cth-neutral-soft)' }}>
                  {t('capabilities.noMailboxes')}{' '}
                  <button type="button" onClick={openSettings} style={link}>{t('capabilities.addInSettings')}</button>
                </div>
              ) : (
                // A list to pick from (owner, 2026-09-26); "Pick a mailbox" until one is chosen.
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Select label={t('capabilities.mailbox', { name })} value={current ?? ''} onChange={(v) => { if (v) pickMailbox(v); }} style={{ maxWidth: '100%', fontFamily: 'var(--cth-font-mono)', fontSize: 12 }}>
                    {!current && <option value="">{t('capabilities.pickMailbox')}</option>}
                    {mailboxOptions.map((o) => <option key={o.value} value={o.value}>{o.desc ? `${o.label} (${o.desc})` : o.label}</option>)}
                  </Select>
                  <button type="button" onClick={openSettings} style={{ ...link, marginInlineStart: 'auto' }}>{t('capabilities.addMailbox')}</button>
                </div>
              )}
              {moving && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap', fontSize: 13 }}>
                  <span>{movingHolder
                    ? t('capabilities.moveMailbox', { address: movingAddress, from: nameOf(movingHolder), to: name })
                    : t('capabilities.moveMailboxFree', { address: movingAddress })}</span>
                  <MiniButton autoFocus onClick={() => { void save({ ...email, mailboxes: [moving] }, true); }}>{t('capabilities.moveIt')}</MiniButton>
                  <MiniButton onClick={() => setMoving(null)}>{t('capabilities.keepIt')}</MiniButton>
                </div>
              )}

              <div style={h13}>{t('capabilities.sending')}</div>
              <RadioRows
                label={t('capabilities.sending')}
                value={String(email.send)}
                options={[{ value: 'true', label: t('capabilities.canSend'), desc: t('capabilities.canSendDesc') }, { value: 'false', label: t('capabilities.draftOnly'), desc: t('capabilities.draftOnlyDesc') }]}
                onChange={(v) => setSend(v === 'true')}
              />
            </>
          )}
        </TriggerCard>

        {config.quickbooksClaude === true && booksDefault !== undefined && <TriggerCard
          title={t('capabilities.quickbooks')}
          blurb={t('capabilities.quickbooksBlurb', { name })}
          action={<Toggle on={books.enabled} label={t('capabilities.canUseBooks', { name })} onClick={toggleBooks} />}
          open={!collapsed.books}
          onToggle={(open) => setFold('books', open)}
        >
          {!books.enabled ? (
            <div style={hint}>{t('capabilities.quickbooksOff', { name })}</div>
          ) : (
            <>
              <div style={{ ...h13, marginTop: 0 }}>{t('capabilities.booksChanges')}</div>
              <RadioRows
                label={t('capabilities.booksChanges')}
                value={String(books.changes)}
                options={[{ value: 'false', label: t('capabilities.booksReadOnly'), desc: t('capabilities.booksReadOnlyDesc') }, { value: 'true', label: t('capabilities.booksCanChange'), desc: t('capabilities.booksCanChangeDesc') }]}
                onChange={(v) => { if ((v === 'true') !== books.changes) void saveBooks({ enabled: true, changes: v === 'true' }); }}
              />
            </>
          )}
          <div style={{ ...hint, marginTop: 10 }}>{t('capabilities.booksHow')}</div>
        </TriggerCard>}

        <TriggerCard
          title={t('capabilities.schedules')}
          blurb={t('capabilities.schedulesBlurb', { name })}
          summary={schedulesOn ? t('capabilities.schedulesOn', { count: schedulesOn }) : t('capabilities.schedulesNone')}
          open={!collapsed.schedules}
          onToggle={(open) => setFold('schedules', open)}
        >
          <AgentSchedules agentId={agent.id} agentName={name} />
        </TriggerCard>

        {/* Outside the sections, so a closed Email section still shows them. */}
        <div aria-live="polite">
          {pending !== undefined && email.enabled && <div style={{ ...notice, background: 'var(--cth-amber-soft)' }}>{t('capabilities.pending', { name })}</div>}
          {failed && <div role="alert" style={{ ...notice, background: 'var(--cth-coral-soft)', color: 'var(--cth-coral-text)' }}>! {t('capabilities.saveFailed')}</div>}
        </div>
      </div>
    </div>
  );
}

/** A one-choice list (DESIGN.md 7.10a Radio row): arrow keys move and choose,
 *  only the chosen row is in the tab order (the first when none is chosen). */
function RadioRows({ label, value, options, onChange }: {
  label: string; value: string | undefined; options: Array<{ value: string; label: string; desc?: string }>;
  onChange: (value: string) => void;
}) {
  const at = options.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step || options.length === 0) return;
    e.preventDefault();
    const next = options[(Math.max(at, 0) + step + options.length) % options.length];
    onChange(next.value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-value={o.value}
            aria-checked={checked}
            tabIndex={checked || (at < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            style={{ ...row, width: '100%', border: 'none', borderTop: i === 0 ? 'none' : row.borderTop, background: 'transparent', cursor: 'pointer', textAlign: 'start', fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink)' }}
          >
            <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, boxShadow: checked ? 'none' : 'inset 0 0 0 1px var(--cth-line-input)', background: checked ? 'var(--cth-ink)' : 'var(--cth-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {checked && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cth-bg)' }} />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: checked ? 600 : 500 }}>{o.label}</span>
              {o.desc && <span style={{ display: 'block', ...hint }}>{o.desc}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const hint: CSSProperties = { fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-3)' };
const h13: CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cth-ink-3)', margin: '14px 0 6px' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--cth-line)' };
const notice: CSSProperties = { padding: '8px 10px', borderRadius: 'var(--cth-r-md)', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)', marginTop: 8 };
const link: CSSProperties = { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, color: 'var(--cth-indigo-text)' };
