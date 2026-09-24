import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SchedulesSection } from './SchedulesSection';
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
 * This panel is a sidebar, so four flat forms would open as a wall. Each type is
 * a collapsed card carrying its name, a one-line "what this is", and a live
 * summary chip; schedules opens expanded because it is the incumbent and the
 * office calendar deep-links here. Inside a card, each row collapses the same
 * way, so nothing is more than two disclosures from legible.
 */
export function TriggersTab() {
  const { t } = useTranslation();
  const [schedulesSummary, setSchedulesSummary] = useState('');
  const [orgSummary, setOrgSummary] = useState('');

  return (
    <Scroll>
      <Muted>{t('triggersTab.intro')}</Muted>
      <div style={{ height: 8 }} />

      <TriggerCard
        title={t('triggersTab.schedules')}
        blurb={t('triggersTab.schedulesBlurb')}
        summary={schedulesSummary}
        defaultOpen
      >
        <SchedulesSection onSummary={setSchedulesSummary} />
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
