import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarAccess } from '@shared/calendars';
import { calendarAccess } from '@shared/calendars';
import type { HarnessConfig } from '../store/config';
import { useStore, type Agent } from '../store/store';
import { MiniButton, Select, Toggle, TriggerCard } from './triggers/ui';
import './calendars.css';

export function CalendarAccessSection({ agent, config }: { agent: Agent; config: HarnessConfig }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [failed, setFailed] = useState(false);
  const pending = useStore((s) => s.pendingRestart[agent.id]);
  const grants = config.agentCapabilities?.[agent.id]?.calendars ?? [];
  const calendars = (config.calendarAccounts ?? []).flatMap((a) => a.calendars.map((c) => ({ ...c, account: a.label })));
  const visible = calendars.filter((c) => c.enabled || grants.some((g) => g.calendar === c.id));
  const missing = grants.filter((g) => !calendars.some((c) => c.id === g.calendar));
  const save = async (id: string, access: CalendarAccess | null) => {
    if (working.current) return;
    working.current = true; setBusy(true); setFailed(false);
    try {
      const result = await window.cth.calendarSetGrant(agent.id, id, access);
      if (!result.ok) setFailed(true);
      else if (result.restartNeeded && agent.ptyId) useStore.getState().setPendingRestart(agent.id, { reason: 'calendar', at: Date.now() });
    } catch { setFailed(true); }
    working.current = false; setBusy(false);
  };
  return <TriggerCard title={t('calendars.title')} blurb={t('calendars.access.intro')} summary={t('calendars.access.count', { count: grants.length })}>
    <div className="calendar-stack" aria-busy={busy}>
      <p className="calendar-hint">{t('calendars.access.readOnlyPhase')}</p>
      {!visible.length && !missing.length && <p>{t('calendars.access.empty')} <MiniButton onClick={() => window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'Connections' } }))}>{t('calendars.access.settings')}</MiniButton></p>}
      {visible.map((c) => {
        const grant = grants.find((g) => g.calendar === c.id);
        const allowed = calendarAccess(config, agent.id, c.id, 'read').ok;
        return <div className="calendar-row" key={c.id}>
          <div className="calendar-actions"><strong className="calendar-heading">{c.name}</strong><Toggle on={!!grant} disabled={busy || (!c.enabled && !grant)} label={t('calendars.access.toggle', { name: c.name })} onClick={() => { void save(c.id, grant ? null : 'read'); }} /></div>
          <span className="calendar-hint">{c.account}</span>
          {grant ? <><fieldset disabled={busy || !c.enabled}><Select label={t('calendars.access.level', { name: c.name })} value={grant.access} onChange={(v) => { if (!busy && c.enabled) void save(c.id, v as CalendarAccess); }}>
            {(['read', 'approval', 'book'] as const).map((v) => <option key={v} value={v}>{t(`calendars.access.${v}`)}</option>)}
          </Select></fieldset><p className="calendar-hint">{t(`calendars.access.${grant.access}Hint`)}</p></> : <span>{t('calendars.access.none')}</span>}
          {grant && !allowed && <p className="calendar-attention">{t('calendars.access.unavailable')}</p>}
        </div>;
      })}
      {missing.map((g) => <div key={g.calendar} className="calendar-row"><span>{t('calendars.access.removed')}</span><MiniButton disabled={busy} onClick={() => { void save(g.calendar, null); }}>{t('calendars.remove')}</MiniButton></div>)}
      {failed && <p role="alert">{t('calendars.errors.save')}</p>}
      {pending?.reason === 'calendar' && <div role="status">{t('calendars.access.restart')} <MiniButton onClick={() => useStore.getState().setPendingRestart(agent.id, { ...pending, now: true, failed: false })}>{t('calendars.access.restartNow')}</MiniButton></div>}
    </div>
  </TriggerCard>;
}
