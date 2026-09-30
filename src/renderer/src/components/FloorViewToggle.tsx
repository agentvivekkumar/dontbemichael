import { useTranslation } from 'react-i18next';
import { useStore, type FloorView } from '@/store/store';

/**
 * One plain line at the top of the TASKS and GRAPH views, saying what the owner
 * is looking at and how to use it (owner, 2026-09-24).
 */
export function FloorViewIntro({ view }: { view: Exclude<FloorView, 'office'> }) {
  const { t } = useTranslation();
  const godName = useStore((s) => s.agents.find((a) => a.isGod)?.name) ?? 'Michael';
  return (
    <div style={{
      flexShrink: 0, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
      background: 'var(--cth-cream-100)', borderBottom: '1px solid var(--cth-ink-300)',
      fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-700)'
    }}>
      {/* Colour, not bold, carries the emphasis (DESIGN.md 4.2: never bold). */}
      <span style={{ color: 'var(--cth-ink-900)' }}>
        {view === 'tasks' ? t('floorView.tasksIntroTitle') : t('floorView.graphIntroTitle')}
      </span>
      <span>{view === 'tasks' ? t('floorView.tasksIntro') : t('floorView.graphIntro', { godName })}</span>
    </div>
  );
}
