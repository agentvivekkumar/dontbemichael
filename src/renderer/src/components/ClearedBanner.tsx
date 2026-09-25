import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * After the app cleared this team member's conversation (safeClearer.ts), a
 * note saying so, with a way to bring the earlier conversation back. Nothing
 * is lost by a clear: Claude Code keeps the old conversation, and this
 * restarts the agent into it. Shown for a day after the clear.
 */
const SHOW_FOR_MS = 24 * 60 * 60_000;

export function ClearedBanner({ agentId, name }: { agentId: string; name: string }) {
  const { t } = useTranslation();
  const [cleared, setCleared] = useState<{ at: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      window.cth.hiveClearedState(agentId)
        .then((s) => { if (alive) setCleared(s && Date.now() - s.at < SHOW_FOR_MS ? s : null); })
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
    try {
      const r = await window.cth.restoreConversation(agentId);
      if (r.ok) setCleared(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      background: 'var(--cth-sky-light)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
      fontSize: 14, lineHeight: '19px', color: 'var(--cth-ink-900)'
    }}>
      <span style={{ flex: 1 }}>{t('clearedBanner.text', { name, ago })}</span>
      <button type="button" onClick={bringBack} disabled={busy} style={{
        padding: '3px 10px 1px', border: 'none', cursor: busy ? 'wait' : 'pointer',
        background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 14, color: 'var(--cth-ink-900)'
      }}>
        {t('clearedBanner.bringBack')}
      </button>
    </div>
  );
}
