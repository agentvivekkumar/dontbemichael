import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type SidebarTab } from '@/store/store';
import { type AccentColorName } from '@/design/tokens';
import { Icon, type IconName } from './Icon';
import { SHOW_GIT } from '@shared/buildFeatures';

// v0.3.4: the files tab is gone — the per-agent IDE button (header) opens the
// full Monaco editor + file tree, which superseded the read-only browser.
const ALL_TABS: { key: SidebarTab; labelKey: string; icon: IconName }[] = [
  // Owner-facing tabs first; the technical ones (terminal, git, traces) last
  // (owner, 2026-09-25).
  { key: 'messages', labelKey: 'sidebar.messages', icon: 'bell' },
  // The agent's own jobs on a clock (docs/designs/per-agent-schedules.md).
  { key: 'schedules', labelKey: 'sidebar.schedules', icon: 'clock' },
  { key: 'terminal', labelKey: 'sidebar.terminal', icon: 'terminal' },
  { key: 'git',      labelKey: 'sidebar.git',      icon: 'code' },
  { key: 'traces',   labelKey: 'sidebar.traces',   icon: 'web' }
];
/** GIT is hidden in this build (src/shared/buildFeatures.ts). */
const TABS = ALL_TABS.filter((tab) => tab.key !== 'git' || SHOW_GIT);

export interface SidebarTabsProps {
  current: SidebarTab;
  accent: AccentColorName;
  onChange: (tab: SidebarTab) => void;
}

export function SidebarTabs({ current, accent, onChange }: SidebarTabsProps) {
  const { t } = useTranslation();
  // Bring the selected tab into view when it changes (a jump from Michael's
  // office schedule can select one that is scrolled off), not on every render,
  // which would fight the owner scrolling the strip.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  return (
    // Labels are 14px (the floor for text an owner reads, design 14C). Four of
    // them can outgrow a narrow panel, so the strip scrolls sideways instead of
    // clipping, and the selected tab scrolls itself into view.
    <div ref={stripRef} role="tablist" style={{
      display: 'flex',
      gap: 0,
      background: 'var(--cth-cream-200)',
      boxShadow: 'inset 0 -2px 0 var(--cth-ink-900)',
      flexShrink: 0,
      overflowX: 'auto',
      scrollbarWidth: 'thin'
    }}>
      {TABS.map(tab => {
        const active = current === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            style={{
              flex: '1 0 auto',
              height: 36,
              padding: '0 10px',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--cth-cream-100)' : 'transparent',
              boxShadow: active
                ? `inset 0 -3px 0 var(--cth-${accent}), inset 1px 0 0 var(--cth-ink-900), inset -1px 0 0 var(--cth-ink-900)`
                : 'inset 0 0 0 0',
              fontFamily: 'var(--cth-font-ui)',
              fontSize: 14,
              lineHeight: '20px',
              whiteSpace: 'nowrap',
              color: active ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4
            }}
          >
            <Icon name={tab.icon} /> {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
