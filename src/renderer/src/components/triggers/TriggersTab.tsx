import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentSchedules, OfficeSchedules, useGodId } from './ScheduleList';
import { useStore } from '@/store/store';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { OrgSection } from './OrgSection';
import { Muted, Scroll, TriggerCard } from './ui';
import { SHOW_ORG_TRIGGER } from '@shared/buildFeatures';

/**
 * TRIGGERS — every way the floor gets woken up without a human typing. Four
 * types exist (src/shared/triggers.ts is the contract); only schedules shows
 * here. Webhooks live in Settings → Connections and context upkeep in Settings
 * → Agents & Models (both apply to the whole office, not to Michael), and
 * organisation is hidden in this build (SHOW_ORG_TRIGGER).
 * Schedules is the oldest and used to BE this tab.
 *
 * Schedules belong to the agent that runs them (docs/designs/per-agent-schedules.md):
 * each team member edits its own on its panel's Schedules tab. Here, Michael's
 * own jobs are editable at the top, and below them the office schedule lists
 * everyone else's, read only, each row a jump to that agent's tab.
 *
 * This panel is a sidebar, so four flat forms would open as a wall. Each type is
 * a collapsed card carrying its name, a one-line "what this is", and a live
 * summary chip; schedules opens expanded because it is the incumbent and the
 * office calendar deep-links here. Inside a card, each row collapses the same
 * way, so nothing is more than two disclosures from legible.
 */
export function TriggersTab() {
  const { t } = useTranslation();
  const [orgSummary, setOrgSummary] = useState('');
  const godName = useResolvedGodName();
  const godId = useGodId();

  return (
    <Scroll>
      <Muted>{t('triggersTab.intro')}</Muted>
      <div style={{ height: 8 }} />

      <TriggerCard
        title={t('schedulesSection.ownJobs', { godName })}
        blurb={t('triggersTab.schedulesBlurb')}
        defaultOpen
      >
        <AgentSchedules agentId={godId} agentName={godName} />
      </TriggerCard>

      <TriggerCard
        title={t('schedulesSection.officeSchedule')}
        blurb={t('triggersTab.officeBlurb')}
        defaultOpen
      >
        <OfficeSchedules />
      </TriggerCard>

      {/* WEBHOOKS moved to Settings → Connections: one server and one tunnel
          serve the whole office, and everything that arrives goes to Michael
          to route. ORGANISATION is hidden in this build (SHOW_ORG_TRIGGER). */}
      {SHOW_ORG_TRIGGER && (
        <TriggerCard
          title={t('triggersTab.organisation')}
          blurb={t('triggersTab.organisationBlurb')}
          summary={orgSummary}
        >
          <OrgSection onSummary={setOrgSummary} />
        </TriggerCard>
      )}
    </Scroll>
  );
}
