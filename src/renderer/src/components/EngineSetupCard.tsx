import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { isClaudeProvider } from '@shared/agentProvider';
import type { EngineSetupStatus } from '@shared/engineSetup';
import { Dialog } from '@/shell/Dialog';
import { useStore } from '@/store/store';
import { refreshNeedsYou } from '@/shell/useNeedsYou';
import { PixelButton } from './PixelButton';
import { GetMichaelReady } from './GetMichaelReady';

/**
 * Michael can't start yet (docs/designs/get-michael-ready.md): on Ask me while
 * Claude Code is missing or signed out, so an owner who chose Set up later, or
 * whose Claude went away, is never left with an office that silently does
 * nothing. It opens the same Get Michael ready rows as setup's last step; once
 * they are green, everyone on Claude restarts at once.
 */
export function EngineSetupCard({ status }: { status: EngineSetupStatus | null }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const onReadyChange = useCallback((r: boolean) => setReady(r), []);
  if (!status?.applies || (!status.needed && !open)) return null;

  const done = () => {
    setOpen(false);
    if (ready) {
      // Everyone who runs on Claude starts again, now that it is there.
      const { agents, setPendingRestart } = useStore.getState();
      for (const a of agents) {
        if (a.ptyId && isClaudeProvider(a.provider ?? 'claude')) setPendingRestart(a.id, { at: Date.now(), reason: 'engine', now: true });
      }
    }
    refreshNeedsYou();
  };

  return (
    <>
      <section aria-label={t('engineSetup.cardTitle', { godName })} style={{
        position: 'relative', flexShrink: 0, padding: '13px 14px', borderRadius: 'var(--cth-r-xl)', background: 'var(--cth-card)',
        boxShadow: 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-md)'
      }}>
        <div style={{ fontSize: 11, color: 'var(--cth-ink-3)' }}>{t('engineSetup.cardFrom')}</div>
        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, lineHeight: '18px', color: 'var(--cth-ink)' }}>{t('engineSetup.cardTitle', { godName })}</div>
        <div style={{ marginTop: 2, fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)' }}>
          {status.installed ? t('engineSetup.cardSignedOut') : t('engineSetup.cardNotInstalled')}
        </div>
        <div style={{ marginTop: 10 }}>
          <PixelButton variant="primary" size="sm" onClick={() => setOpen(true)}>{t('engineSetup.cardAction', { godName })}</PixelButton>
        </div>
      </section>
      {open && (
        <Dialog
          title={t('engineSetup.title', { godName })}
          onClose={done}
          footer={<PixelButton variant="primary" size="md" onClick={done}>{ready ? t('engineSetup.done') : t('common.close')}</PixelButton>}
        >
          <GetMichaelReady onReadyChange={onReadyChange} />
        </Dialog>
      )}
    </>
  );
}
