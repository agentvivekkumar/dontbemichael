import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { ACTION_AT_PROMPT, useStore, type Agent } from '@/store/store';
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
/** The registry is the record of 1:1 and survives restarts, so the store's copy
 *  can be stale on a fresh launch. Read it back once per agent. (Moved here
 *  from the old top-strip 1:1 button, which this bar replaced, 2026-09-25.) */
function useSyncedHold(agentId: string): void {
  useEffect(() => {
    let alive = true;
    window.cth.hiveRegistry?.().then((reg) => {
      if (!alive) return;
      const onHold = !!(reg as { agents?: Record<string, { onHold?: boolean }> })?.agents?.[agentId]?.onHold;
      if (onHold !== !!useStore.getState().agents.find((a) => a.id === agentId)?.onHold) {
        useStore.getState().updateAgent(agentId, { onHold });
      }
    }).catch(() => { /* no hive: nothing to sync */ });
    return () => { alive = false; };
  }, [agentId]);
}

/** Take the agent aside (on) or end the 1:1 (off). Mirrors locally only after
 *  main confirms, so the panel never shows a 1:1 Michael never heard about. */
function useSetHold(agentId: string): { busy: boolean; err: boolean; setHold: (on: boolean) => void } {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const setHold = (on: boolean) => {
    setBusy(true);
    setErr(false);
    void Promise.resolve()
      .then(() => window.cth.hiveSetAgentHold?.(agentId, on))
      .then((r) => {
        if (r?.ok) useStore.getState().updateAgent(agentId, { onHold: on });
        else setErr(true);
      })
      .catch(() => setErr(true))
      .finally(() => setBusy(false));
  };
  return { busy, err, setHold };
}

/** Above the message box while in 1:1: who you're with, and the way out. */
export function OneOnOneLine({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  useSyncedHold(agent.id);
  const { busy, err, setHold } = useSetHold(agent.id);
  return (
    <div role="region" aria-label={t('ownerVia.inOneOnOne', { name: agent.name })} style={{
      margin: '8px 8px 0', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--cth-lemon-light)', boxShadow: 'inset 0 0 0 1px var(--cth-lemon)'
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
        {err ? `! ${t('ownerVia.holdFailed')}` : t('ownerVia.inOneOnOneNote', { name: agent.name, godName })}
      </span>
      <PixelButton variant="secondary" size="sm" onClick={() => setHold(false)} disabled={busy}>{t('ownerVia.endOneOnOne')}</PixelButton>
    </div>
  );
}

export function OwnerViaMichaelBar({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const godId = useStore((s) => s.agents.find((a) => a.isGod)?.id);
  useSyncedHold(agent.id);
  const { busy, err, setHold } = useSetHold(agent.id);
  // Team members read as "waiting" at a prompt, never "blocked" (usePtyParser,
  // useHive); the prompt marker is what says a person is needed in the terminal.
  const stuck = agent.status === 'waiting' && agent.action === ACTION_AT_PROMPT;

  const messageMichael = () => {
    if (!godId) return;
    const s = useStore.getState();
    const prefix = t('ownerVia.aboutPrefix', { name: agent.name });
    const current = s.drafts[godId] ?? '';
    // Start the message; keep anything already drafted to Michael.
    // Don't stack the prefix on repeat clicks (adversarial review, 2026-09-25).
    if (!current.trimEnd().endsWith(prefix.trimEnd())) {
      s.setDraft(godId, current.trim() ? `${current.trimEnd()}\n\n${prefix}` : prefix);
    }
    s.select(godId);
    s.requestCommandCenterTab('terminal');
  };

  const talkOneOnOne = () => setHold(true);

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
