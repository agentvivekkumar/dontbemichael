import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfficeSchedules } from './ScheduleList';
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
 * each agent, Michael included, edits its own in the On a schedule section of
 * its Capabilities tab (owner, 2026-09-26). This tab, named Office schedule, is
 * the read only list of everyone's, each row a jump to that agent's section.
 *
 * This panel is a sidebar, so four flat forms would open as a wall. Each type is
 * a collapsed card carrying its name, a one-line "what this is", and a live
 * summary chip. Every card starts closed, like every section on every agent
 * tab (owner, 2026-09-26). The office schedule is not a card: it is the one
 * section here, so it shows straight away under a one line description. Inside a card, each row collapses the same
 * way, so nothing is more than two disclosures from legible.
 */
export function TriggersTab() {
  const { t } = useTranslation();
  const [orgSummary, setOrgSummary] = useState('');
  const godName = useResolvedGodName();

  return (
    <Scroll>
      {/* The only section on this tab, so no fold and no heading: the tab is
          already called Office schedule (owner, 2026-09-26). */}
      <Muted>{t('triggersTab.officeBlurb', { godName })}</Muted>
      <OfficeSchedules />
      <div style={{ height: 12 }} />

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
