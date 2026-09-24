import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type FloorView } from '@/store/store';
import { Icon, type IconName } from './Icon';
import { parseTasks } from './TasksKanban';

const POLL_MS = 5000;

/**
 * OFFICE | TASKS | GRAPH: what the big floor area shows (owner, 2026-09-24). The
 * office is the animated floor; TASKS is the whole task board in its place, the
 * quickest read of who is doing what, what is blocked and what is done; GRAPH is
 * who talks to whom and what they remember, which needs the room.
 *
 * The TASKS side carries a count of blocked cards, so trouble is visible while
 * the office is showing. Polls the same tasks.json the board reads.
 */
export function FloorViewToggle() {
  const { t } = useTranslation();
  const view = useStore((s) => s.floorView);
  const setView = useStore((s) => s.setFloorView);
  const [blocked, setBlocked] = useState(0);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      void window.cth.hiveTasks()
        .then((raw) => { if (alive) setBlocked(parseTasks(raw).filter((x) => x.status === 'blocked').length); })
        .catch(() => { /* keep the last count */ });
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const option = (key: FloorView, icon: IconName, label: string, badge?: number) => {
    const on = view === key;
    return (
      <button
        key={key}
        onClick={() => setView(key)}
        aria-pressed={on}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--cth-font-display)', fontSize: 10, lineHeight: '14px',
          background: on ? 'var(--cth-ink-900)' : 'transparent',
          color: on ? 'var(--cth-cream-50)' : 'var(--cth-ink-700)'
        }}
      >
        <Icon name={icon} /> {label}
        {!!badge && (
          <span
            title={t('floorView.blockedTitle', { count: badge })}
            style={{
              minWidth: 16, padding: '0 4px', textAlign: 'center',
              fontFamily: 'var(--cth-font-ui)', fontSize: 10, lineHeight: '14px',
              background: 'var(--cth-coral)', color: 'var(--cth-ink-900)',
              boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
            }}
          >{badge}</span>
        )}
      </button>
    );
  };

  return (
    <div role="group" aria-label={t('floorView.label')} style={{
      display: 'inline-flex', padding: 2, gap: 2,
      background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
    }}>
      {option('office', 'mcp', t('floorView.office'))}
      {option('tasks', 'check', t('floorView.tasks'), blocked)}
      {option('graph', 'web', t('floorView.graph'))}
    </div>
  );
}

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
      fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-700)'
    }}>
      <strong style={{ color: 'var(--cth-ink-900)' }}>
        {view === 'tasks' ? t('floorView.tasksIntroTitle') : t('floorView.graphIntroTitle')}
      </strong>
      <span>{view === 'tasks' ? t('floorView.tasksIntro') : t('floorView.graphIntro', { godName })}</span>
    </div>
  );
}
