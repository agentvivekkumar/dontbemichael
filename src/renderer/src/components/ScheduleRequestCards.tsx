import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import { useMissions, whenText } from './triggers/ScheduleList';
import { requestIsStale, type ScheduleRequest, type ScheduledMission } from '@shared/missions';

/**
 * ASK ME: schedule changes an agent asked for (docs/designs/per-agent-schedules.md, R6).
 *
 * An agent never changes a schedule itself (owner, 2026-09-25). It sends a
 * request; each one shows here with exactly what would change, and the owner's
 * Approve applies that one change and nothing else. No answer text is ever read
 * by an agent to decide it. A request whose schedule changed since it was asked
 * can't be approved, because the owner would be approving something they
 * haven't seen.
 */
export function useScheduleRequests(): { requests: ScheduleRequest[]; refresh: () => void } {
  const [requests, setRequests] = useState<ScheduleRequest[]>([]);
  const refresh = useCallback(() => {
    window.cth.listScheduleRequests().then(setRequests).catch(() => { /* keep last good */ });
  }, []);
  useEffect(() => {
    refresh();
    return window.cth.onScheduleRequestsUpdated(refresh);
  }, [refresh]);
  return { requests, refresh };
}

/** One line saying what the request would do. */
function describe(req: ScheduleRequest, target: ScheduledMission | undefined, t: TFunction): string {
  const label = target?.label ?? req.draft?.label ?? '';
  switch (req.op) {
    case 'add':
      return t('askMe.scheduleAdd', { label: req.draft?.label ?? '', when: req.draft ? whenText(req.draft, t) : '' });
    case 'update': {
      const before = target ? `${target.label}, ${whenText(target, t)}` : label;
      const after = req.draft ? `${req.draft.label}, ${whenText(req.draft, t)}` : '';
      return t('askMe.scheduleUpdate', { before, after });
    }
    case 'pause': return t('askMe.schedulePause', { label });
    case 'resume': return t('askMe.scheduleResume', { label });
    case 'delete': return t('askMe.scheduleDelete', { label });
  }
}

export function ScheduleRequestCards({ requests, refresh }: { requests: ScheduleRequest[]; refresh: () => void }) {
  const { t } = useTranslation();
  const { missions } = useMissions();
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id;

  const decide = async (req: ScheduleRequest, approve: boolean) => {
    setBusy(req.id);
    setFailed(null);
    try {
      const res = await window.cth.decideScheduleRequest(req.id, approve);
      if (!res.ok) setFailed(req.id);
    } catch {
      setFailed(req.id);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <>
      {requests.map((req) => {
        const name = nameOf(req.agentId);
        const target = missions.find((m) => m.id === req.missionId);
        const stale = requestIsStale(req, missions);
        return (
          <section
            key={req.id}
            aria-label={t('askMe.scheduleTitle', { name })}
            style={{ background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{
              padding: '6px 9px', background: 'var(--cth-lemon-light)', boxShadow: 'inset 0 -1px 0 var(--cth-ink-700)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 14, lineHeight: '20px', fontWeight: 600, color: 'var(--cth-ink-900)'
            }}>
              {t('askMe.scheduleTitle', { name })}
            </div>
            <div style={{ padding: 9, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--cth-font-ui)' }}>
              <div style={{ fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>{describe(req, target, t)}</div>
              {stale && (
                <div role="status" style={{ fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-700)' }}>
                  {t('askMe.scheduleStale', { name })}
                </div>
              )}
              {failed === req.id && (
                <div role="alert" style={{ fontSize: 14, lineHeight: '20px', color: 'var(--cth-coral)' }}>
                  ! {t('schedulesSection.saveFailed')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <PixelButton variant="primary" size="sm" disabled={stale || busy === req.id} onClick={() => void decide(req, true)}>
                  {t('askMe.approve')}
                </PixelButton>
                <PixelButton variant="secondary" size="sm" disabled={busy === req.id} onClick={() => void decide(req, false)}>
                  {t('askMe.decline')}
                </PixelButton>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
