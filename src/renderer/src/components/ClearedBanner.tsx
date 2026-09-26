import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';

/**
 * After the app cleared this team member's conversation (safeClearer.ts), a
 * note saying so, with a way to bring the earlier conversation back. Nothing
 * is lost by a clear: Claude Code keeps the old conversation, and this
 * restarts the agent into it. Shown for a day after the clear, unless hidden.
 *
 * A stacked note like the 1:1 line and the "takes work from Michael" bar
 * (docs/designs/cleared-banner.md): the sentence, then the button row.
 */
const SHOW_FOR_MS = 24 * 60 * 60_000;

/** Hiding is per clear: the note comes back for the agent's next fresh start. */
export const hiddenKey = (agentId: string) => `cth.clearedBanner.hidden.${agentId}`;

function hiddenAt(agentId: string): number {
  try { return Number(window.localStorage.getItem(hiddenKey(agentId))) || 0; } catch { return 0; }
}

export function ClearedBanner({ agentId, name }: { agentId: string; name: string }) {
  const { t } = useTranslation();
  const [cleared, setCleared] = useState<{ at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    const load = () => {
      window.cth.hiveClearedState(agentId)
        .then((s) => {
          if (!alive) return;
          const show = s && Date.now() - s.at < SHOW_FOR_MS && hiddenAt(agentId) !== s.at;
          setCleared(show ? s : null);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [agentId]);

  if (!cleared) return null;
  const mins = Math.max(1, Math.round((Date.now() - cleared.at) / 60_000));
  const ago = mins < 60 ? t('clearedBanner.minutesAgo', { count: mins }) : t('clearedBanner.hoursAgo', { count: Math.round(mins / 60) });

  const bringBack = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const r = await window.cth.restoreConversation(agentId);
      if (r.ok) setCleared(null);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const hide = () => {
    try { window.localStorage.setItem(hiddenKey(agentId), String(cleared.at)); } catch { /* the note just hides for now */ }
    setCleared(null);
  };

  return (
    <div role="status" style={{
      margin: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
      background: 'var(--cth-sky-light)', boxShadow: 'inset 0 0 0 1px var(--cth-sky)'
    }}>
      <div style={{ fontSize: 14, lineHeight: '20px', color: failed ? 'var(--cth-coral)' : 'var(--cth-ink-900)' }}>
        {failed ? `! ${t('clearedBanner.restoreFailed')}` : t('clearedBanner.text', { name, ago })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <PixelButton variant="secondary" size="sm" onClick={bringBack} disabled={busy}>
          {busy ? t('clearedBanner.bringingBack') : t('clearedBanner.bringBack')}
        </PixelButton>
        <button type="button" onClick={hide} style={{
          marginInlineStart: 'auto', padding: '2px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
          fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-500)'
        }}>
          {t('clearedBanner.hide')}
        </button>
      </div>
    </div>
  );
}
