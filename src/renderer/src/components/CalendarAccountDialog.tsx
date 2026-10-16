import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarAccount } from '@shared/calendars';
import { PixelButton } from './PixelButton';
import { CALENDAR_SERVERS, saveCalendarDraft, type CalendarDraft } from './calendarAccountActions';
import './calendars.css';

export function CalendarAccountDialog({ account, onClose, onSaved }: { account?: CalendarAccount; onClose(): void; onSaved(): void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<CalendarDraft>(() => ({ id: account?.id ?? `calendar-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`,
    label: account?.label ?? '', username: account?.username ?? '', provider: account?.provider ?? 'icloud', serverUrl: account?.serverUrl ?? CALENDAR_SERVERS.icloud }));
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { previous?.focus(); };
  }, []);
  useEffect(() => { if (busy) root.current?.focus(); }, [busy]);
  const update = (key: 'label' | 'username' | 'serverUrl', value: string) => setDraft((d) => ({ ...d, [key]: value }));
  return <div className="calendar-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting.current) onClose(); }}>
    <div className="calendar-dialog" ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} onKeyDown={(e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (!submitting.current) onClose(); }
      if (e.key !== 'Tab') return;
      const nodes = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
      if (!nodes?.length) { e.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { e.preventDefault(); first.focus(); }
    }} tabIndex={-1}>
      <h2 id={titleId}>{t(account ? 'calendars.edit' : 'calendars.add')}</h2>
      <p className="calendar-hint">{t('calendars.passwordHint')}</p>
      <form className="calendar-stack" onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current) return;
        submitting.current = true; setBusy(true); setError(null);
        const typedPassword = password.current?.value || undefined;
        if (password.current) password.current.value = '';
        const result = await saveCalendarDraft(window.cth, draft, typedPassword, !!account);
        submitting.current = false; setBusy(false);
        if (result.ok) onSaved(); else setError(result.code);
      }}>
        <fieldset disabled={busy} className="calendar-stack">
          <label>{t('calendars.provider')}<select value={draft.provider} onChange={(e) => {
            const provider = e.target.value as CalendarDraft['provider'];
            setDraft((d) => ({ ...d, provider, serverUrl: CALENDAR_SERVERS[provider] }));
          }}>{Object.keys(CALENDAR_SERVERS).map((p) => <option key={p} value={p}>{t(`calendars.providers.${p}`)}</option>)}</select></label>
          <label>{t('calendars.label')}<input required maxLength={120} value={draft.label} onChange={(e) => update('label', e.target.value)} /></label>
          <label>{t('calendars.username')}<input required autoComplete="username" maxLength={320} value={draft.username} onChange={(e) => update('username', e.target.value)} /></label>
          <label>{t('calendars.server')}<input required type="url" maxLength={2048} value={draft.serverUrl} onChange={(e) => update('serverUrl', e.target.value)} /></label>
          <span className="calendar-hint">{t('calendars.serverHint')}</span>
          <label>{t('calendars.password')}<input ref={password} type="password" autoComplete="new-password" maxLength={4096} /></label>
          {account && <span className="calendar-hint">{t('calendars.passwordKeep')}</span>}
        </fieldset>
        {error && <p role="alert">{t(`calendars.errors.${error}`, { defaultValue: t('calendars.errors.connection') })}</p>}
        <div className="calendar-actions">
          <PixelButton disabled={busy} onClick={onClose}>{t('calendars.cancel')}</PixelButton>
          <PixelButton type="submit" variant="primary" disabled={busy}>{t(busy ? 'calendars.testing' : 'calendars.saveTest')}</PixelButton>
        </div>
      </form>
    </div>
  </div>;
}
