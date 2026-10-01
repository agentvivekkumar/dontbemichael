import { useTranslation } from 'react-i18next';
import { useStore, type Agent } from '@/store/store';
import type { HarnessConfig } from '@/store/config';
import { AskMeTab } from '@/components/AskMeTab';
import { InfoTip } from '@/components/InfoTip';
import { PixelButton } from '@/components/PixelButton';
import { useRestoreTeam } from '@/hooks/useRestoreTeam';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useNeedsYouCount } from './useNeedsYou';

/**
 * The Needs you board (branding/DESIGN.md 7.6 and 7.8): the right column's
 * default state. It is the Ask me board that used to be a tab in Michael's
 * panel: the questions Michael could not settle, and the schedule requests he
 * passed on. Last session's team, when it is not back yet, sits on top.
 */
export function NeedsYouBoard({ config }: { config: HarnessConfig }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const count = useNeedsYouCount();
  return (
    <div style={{
      height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12,
      padding: '14px 16px 12px',
      // A tinted ground so each white card stands on its own (owner, 2026-09-30).
      background: 'var(--cth-neutral-soft)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--cth-ink)' }}>
          {t('shell.needsYou')}
        </h2>
        {count > 0 && (
          <span style={{
            minWidth: 20, height: 20, padding: '0 6px', borderRadius: 'var(--cth-r-pill)', display: 'inline-grid', placeItems: 'center',
            background: 'var(--cth-coral-strong)', color: 'var(--cth-on-coral)',
            fontFamily: 'var(--cth-font-mono)', fontSize: 11, fontWeight: 600
          }}>{count}</span>
        )}
        <InfoTip text={t('shell.needsYouInfo', { godName })} />
      </div>
      <RestoreTeamBanner config={config} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AskMeTab />
      </div>
    </div>
  );
}

/** Last session's team, not started yet: bring them all back, or leave one out.
 *  Was the restore dropdown at the end of the agent strip. */
function RestoreTeamBanner({ config }: { config: HarnessConfig }) {
  const { t } = useTranslation();
  const restorable = useStore((s) => s.restorableAgents);
  const { restoring, autoRestoring, restoreTeam } = useRestoreTeam(config);
  const busy = restoring || autoRestoring;
  if (!restorable.length && !busy) return null;
  return (
    <div style={{
      flexShrink: 0, padding: '10px 12px', borderRadius: 'var(--cth-r-xl)',
      background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)',
      display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--cth-ink)' }}>
        {busy ? t('shell.restoring') : t('shell.restoreTitle')}
      </div>
      {!busy && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {restorable.map((a: Agent) => (
              <span key={a.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 4px 0 10px',
                borderRadius: 'var(--cth-r-pill)', background: 'var(--cth-neutral-soft)',
                fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-2)'
              }}>
                {a.name}
                <button
                  onClick={() => useStore.getState().removeRestorableAgent(a.id)}
                  aria-label={t('shell.dismiss', { name: a.name })}
                  title={t('shell.dismiss', { name: a.name })}
                  style={{
                    width: 18, height: 18, padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer',
                    background: 'transparent', color: 'var(--cth-ink-3)', fontSize: 11, lineHeight: 1
                  }}
                >✕</button>
              </span>
            ))}
          </div>
          <div>
            <PixelButton variant="primary" size="sm" onClick={() => void restoreTeam()}>
              {t('shell.restoreAll', { count: restorable.length })}
            </PixelButton>
          </div>
        </>
      )}
    </div>
  );
}
