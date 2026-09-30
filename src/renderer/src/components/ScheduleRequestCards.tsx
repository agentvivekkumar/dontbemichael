import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import { useMissions, whenText } from './triggers/ScheduleList';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
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
    // Michael decides schedule requests; only the ones he passes on reach the
    // owner (owner, 2026-09-27).
    window.cth.listScheduleRequests().then((all) => setRequests(all.filter((r) => r.escalated))).catch(() => { /* keep last good */ });
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
  const godName = useResolvedGodName();
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
            style={{
              position: 'relative', flexShrink: 0, padding: '10px 12px 10px 13px', borderRadius: 'var(--cth-r-xl)',
              background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)',
              display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--cth-font-ui)'
            }}
          >
            {/* Design v2 (branding/DESIGN.md 7.9): the only card with Approve and
                Decline. Same frame as an Ask me card. */}
            <span aria-hidden="true" style={{
              position: 'absolute', insetInlineStart: 0, top: 12, bottom: 12, width: 3,
              borderStartEndRadius: 3, borderEndEndRadius: 3, background: 'var(--cth-coral-base)'
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, lineHeight: '17px', color: 'var(--cth-ink)' }}>
              <span style={{
                width: 17, height: 17, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', flexShrink: 0,
                background: 'var(--cth-amber-soft)', color: 'var(--cth-amber-text)', fontSize: 9, fontWeight: 700
              }}>{name.slice(0, 1).toUpperCase()}</span>
              {t('askMe.scheduleTitle', { name })}
            </div>
            <div style={{ fontSize: 12, lineHeight: '16.5px', color: 'var(--cth-ink)' }}>{describe(req, target, t)}</div>
            {/* Why the team member asks, then what Michael could not settle (owner, 2026-09-27). */}
            {req.reason && (
              <div style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)' }}>
                {t('askMe.scheduleWhy', { reason: req.reason })}
              </div>
            )}
            {req.escalation && (
              <div style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)' }}>
                {t('askMe.scheduleMichael', { name: godName, note: req.escalation })}
              </div>
            )}
            {stale && (
              <div role="status" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-3)' }}>
                {t('askMe.scheduleStale', { name })}
              </div>
            )}
            {failed === req.id && (
              <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>
                {t('schedulesSection.saveFailed')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
              <PixelButton variant="secondary" size="sm" disabled={busy === req.id} onClick={() => void decide(req, false)}>
                {t('askMe.decline')}
              </PixelButton>
              <PixelButton variant="primary" size="sm" disabled={stale || busy === req.id} onClick={() => void decide(req, true)}>
                {t('askMe.approve')}
              </PixelButton>
            </div>
          </section>
        );
      })}
    </>
  );
}
