import { useTranslation } from 'react-i18next';
import { missionsFor, type ScheduledMission } from '@shared/missions';
import { useGodId, useMissions } from './triggers/ScheduleList';

/**
 * An agent's scheduled jobs as part of its Work style (docs/designs/
 * schedule-focus-areas.md, FA1): each job with its focus area, read only.
 * Each focus is edited on its job, where the schedule is defined; the agent
 * gets it only when that job runs (FA2). Nothing when the agent has no jobs.
 */
export function useScheduledJobs(agentId: string): ScheduledMission[] {
  const { missions } = useMissions();
  const godId = useGodId();
  return missionsFor(missions, agentId, godId).filter((m) => (m.kind ?? 'dispatch') === 'dispatch');
}

export function ScheduledJobsList({ agentId, compact }: { agentId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const jobs = useScheduledJobs(agentId);
  if (!jobs.length) return null;
  return (
    <ul data-scheduled-jobs style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      {jobs.map((m) => (
        <li key={m.id} style={{ fontSize: 13, lineHeight: '18px', color: m.enabled ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)' }}>
          <span style={{ fontWeight: 600 }}>{m.label}</span>
          {': '}
          {m.focus
            ? t('scheduledJobs.focus', { focus: m.focus })
            : <span style={{ color: 'var(--cth-ink-3)' }}>{t('scheduledJobs.noFocus')}</span>}
          {!m.enabled && ` (${t('schedulesSection.paused')})`}
        </li>
      ))}
    </ul>
  );
}
