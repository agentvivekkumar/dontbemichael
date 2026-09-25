import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { useStore, type Agent } from '@/store/store';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

/**
 * In place of the message box on a team member's panel, outside 1:1
 * (docs/designs/owner-talks-via-michael.md). Team members take work from
 * Michael, so the owner reaches them through him, or takes them 1:1.
 *
 * "Message Michael about Pam" jumps to Michael with "About Pam: " started in his
 * message box (design 4A); nothing is sent until the owner sends it. When the
 * agent is stuck on something in its own terminal ("needs you"), Talk 1:1 leads.
 */
export function OwnerViaMichaelBar({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const godId = useStore((s) => s.agents.find((a) => a.isGod)?.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const stuck = agent.status === 'blocked';

  const messageMichael = () => {
    if (!godId) return;
    const s = useStore.getState();
    const prefix = t('ownerVia.aboutPrefix', { name: agent.name });
    const current = s.drafts[godId] ?? '';
    // Start the message; keep anything already drafted to Michael.
    s.setDraft(godId, current.trim() ? `${current.trimEnd()}\n\n${prefix}` : prefix);
    s.select(godId);
    s.requestCommandCenterTab('terminal');
  };

  const talkOneOnOne = () => {
    setBusy(true);
    setErr(false);
    void Promise.resolve()
      .then(() => window.cth.hiveSetAgentHold?.(agent.id, true))
      .then((r) => {
        if (r?.ok) useStore.getState().updateAgent(agent.id, { onHold: true });
        else setErr(true);
      })
      .catch(() => setErr(true))
      .finally(() => setBusy(false));
  };

  return (
    <div role="region" aria-label={t('ownerVia.regionAria', { name: agent.name })} style={{
      margin: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
      background: stuck ? 'var(--cth-coral-light)' : 'var(--cth-sky-light)',
      boxShadow: `inset 0 0 0 1px ${stuck ? 'var(--cth-coral)' : 'var(--cth-sky)'}`
    }}>
      <div style={{ fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
        {stuck
          ? t('ownerVia.stuck', { name: agent.name })
          : t('ownerVia.explain', { name: agent.name, godName })}
      </div>
      {err && <div role="alert" style={{ fontSize: 14, color: 'var(--cth-coral)' }}>! {t('ownerVia.holdFailed')}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {stuck ? (
          <>
            <PixelButton variant="primary" size="sm" onClick={talkOneOnOne} disabled={busy}>{t('ownerVia.talk')}</PixelButton>
            <PixelButton variant="secondary" size="sm" onClick={messageMichael} disabled={!godId}>{t('ownerVia.message', { godName, name: agent.name })}</PixelButton>
          </>
        ) : (
          <>
            <PixelButton variant="primary" size="sm" onClick={messageMichael} disabled={!godId}>{t('ownerVia.message', { godName, name: agent.name })}</PixelButton>
            <PixelButton variant="secondary" size="sm" onClick={talkOneOnOne} disabled={busy}>{t('ownerVia.talk')}</PixelButton>
          </>
        )}
      </div>
    </div>
  );
}
