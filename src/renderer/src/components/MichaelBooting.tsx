import { useTranslation } from 'react-i18next';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

/**
 * Loader shown on the empty floor while the god agent is clocking in on
 * launch. Replaces the "add agent" prompt so a returning user doesn't see the
 * empty-floor call-to-action before god has booted.
 *
 * Rendered while `agentCount === 0` — before the store has god's live agent
 * object (and so before `agent.name` exists anywhere to read) — so this reads
 * the persisted name directly, the same way useHive.ts's spawn effect does,
 * rather than assuming the default.
 */
export function MichaelBooting() {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  // DESIGN.md 7.24: the studio stays visible; a small card over Michael's pod
  // says he is clocking in, with the slow indigo pulse.
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none'
    }}>
      <div role="status" style={{
        pointerEvents: 'auto', maxWidth: 340, display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 16px', borderRadius: 'var(--cth-r-xl)', background: 'var(--cth-card)',
        boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)', fontFamily: 'var(--cth-font-ui)'
      }}>
        <span aria-hidden="true" style={{
          width: 10, height: 10, marginTop: 4, borderRadius: '50%', flexShrink: 0, background: 'var(--cth-indigo)',
          boxShadow: '0 0 0 4px var(--cth-indigo-soft)', animation: 'cth-pulse 1.6s ease-in-out infinite'
        }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cth-ink)' }}>{t('office.activity.clockingIn').replace(/^./, (c) => c.toUpperCase())}</div>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)' }}>
            {godName} is settling into the corner office and getting the floor ready. Hang tight…
          </p>
        </div>
      </div>
    </div>
  );
}
