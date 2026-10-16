import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarAccount } from '@shared/calendars';
import { PixelButton } from './PixelButton';
import { CalendarAccountDialog } from './CalendarAccountDialog';
import './calendars.css';

export function CalendarsSettings() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<CalendarAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [dialog, setDialog] = useState<{ account?: CalendarAccount } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    try {
      const res = await window.cth.calendarAccountsList();
      if (seq !== sequence.current) return;
      if (res.ok) { setAccounts(res.accounts); setError((current) => current === 'settings' ? null : current); } else { setAccounts(null); setError('settings'); }
    } catch { if (seq === sequence.current) { setAccounts(null); setError('settings'); } }
  }, []);
  useEffect(() => {
    void load();
    const off = window.cth.onConfigChanged(() => { void load(); });
    return () => { ++sequence.current; off(); };
  }, [load]);
  const run = async (action: () => Promise<{ ok: boolean; code?: string; cleanupPending?: boolean }>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.code ?? 'save');
      else if (result.cleanupPending) setError('cleanup');
    } catch { setError('save'); }
    await load(); working.current = false; setBusy(false);
  };
  return <section className="calendar-stack" aria-label={t('calendars.title')} aria-busy={busy}>
    <div className="calendar-actions"><h2 className="calendar-heading">{t('calendars.title')}</h2><PixelButton size="sm" variant="primary" disabled={busy} onClick={() => setDialog({})}>{t('calendars.add')}</PixelButton></div>
    <p className="calendar-hint">{t('calendars.intro')}</p>
    {error && <div role="alert">{t(`calendars.errors.${error}`, { defaultValue: t('calendars.errors.connection') })}</div>}
    {accounts === null ? <div role="status">{t(error ? 'calendars.unavailable' : 'calendars.loading')} {error && <PixelButton size="sm" onClick={() => { setError(null); void load(); }}>{t('calendars.retry')}</PixelButton>}</div>
      : accounts.length === 0 ? <p>{t('calendars.empty')}</p>
        : accounts.map((a) => <div key={a.id} className="calendar-row">
          <div className="calendar-actions"><strong className="calendar-heading">{a.label}</strong><span className={a.status === 'connected' ? 'calendar-ok' : 'calendar-attention'}>{t(a.status === 'connected' ? 'calendars.connected' : 'calendars.attention')}</span></div>
          <div className="calendar-hint">{t(`calendars.providers.${a.provider}`)} · {a.username}</div>
          {a.status === 'needs-attention' && <p className="calendar-hint">{t('calendars.reconnect')}</p>}
          <div className="calendar-actions">
            <PixelButton size="sm" disabled={busy} onClick={() => { void run(() => window.cth.calendarAccountsTest(a.id)); }}>{t(busy ? 'calendars.testing' : 'calendars.test')}</PixelButton>
            <PixelButton size="sm" disabled={busy} onClick={() => setDialog({ account: a })}>{t('calendars.edit')}</PixelButton>
            <PixelButton size="sm" disabled={busy} onClick={() => setRemoving(a.id)}>{t('calendars.remove')}</PixelButton>
          </div>
          {removing === a.id && <div role="group" aria-label={t('calendars.remove')} className="calendar-actions"><span>{t('calendars.confirmRemove', { label: a.label })}</span>
            <PixelButton size="sm" disabled={busy} onClick={() => { void run(() => window.cth.calendarAccountsRemove(a.id)); setRemoving(null); }}>{t('calendars.confirm')}</PixelButton>
            <PixelButton size="sm" disabled={busy} onClick={() => setRemoving(null)}>{t('calendars.cancel')}</PixelButton></div>}
          {a.calendars.length === 0 && <p className="calendar-hint">{t('calendars.noCalendars')}</p>}
          {a.calendars.map((c) => <label key={c.id} className="calendar-selection"><input type="checkbox" checked={c.enabled} disabled={busy || a.status !== 'connected'} onChange={(e) => { const enabled = e.target.checked; void run(() => window.cth.calendarAccountsSelect(a.id, c.id, enabled)); }} />{c.name}</label>)}
        </div>)}
    {dialog && <CalendarAccountDialog account={dialog.account} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setError(null); void load(); }} />}
  </section>;
}
