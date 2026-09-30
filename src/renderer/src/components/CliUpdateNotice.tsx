/**
 * "Claude Code updated underneath the team" — the business-owner half of
 * src/shared/cliUpdate.ts.
 *
 * Claude Code updates itself on disk, and each agent's terminal footer then says
 * "Update installed · Restart to update". Owners never read the terminal tab, so
 * the app says it here instead: a corner toast plus a title-bar chip. Nothing
 * restarts on its own. The only action is the owner's click, which runs closing
 * time (every agent saves its work and confirms) and then reopens the app, so
 * every agent starts again on the new version.
 *
 * "Later" hides the toast until a NEWER Claude Code arrives, not until the next
 * app start: Claude Code ships several times a week, and a notice that returns
 * every morning gets ignored. The chip stays up while agents are behind, and a
 * click on it brings the toast back.
 */
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { cliUpdateToastVisible, type CliUpdateStatus } from '@shared/cliUpdate';

/** The installed version the owner said "later" to. `cth.`-prefixed renderer
 *  memory, like UpdateToast's star ask. */
const LATER_KEY = 'cth.cliUpdateLaterFor';
const SHOW_EVENT = 'cth:show-cli-update';

function readLater(): string | null {
  try { return window.localStorage.getItem(LATER_KEY); } catch { return null; }
}

function writeLater(version: string | null): void {
  try {
    if (version) window.localStorage.setItem(LATER_KEY, version);
    else window.localStorage.removeItem(LATER_KEY);
  } catch { /* storage unavailable: the toast just comes back next time */ }
}

function useCliUpdate(): CliUpdateStatus | null {
  const [status, setStatus] = useState<CliUpdateStatus | null>(null);
  useEffect(() => {
    // Subscribe first, then pull: main may have pushed before this window loaded.
    const off = window.cth.onCliUpdateStatus?.(setStatus);
    void window.cth.cliUpdateCurrent?.().then((cur) => setStatus((prev) => prev ?? cur)).catch(() => { /* push still works */ });
    return off;
  }, []);
  return status;
}

export function CliUpdateToast({ onCloseAndReopen }: { onCloseAndReopen: (liveAgents: number) => Promise<boolean> }) {
  const status = useCliUpdate();
  const [laterFor, setLaterFor] = useState<string | null>(readLater);

  useEffect(() => {
    const onShow = () => { writeLater(null); setLaterFor(null); };
    window.addEventListener(SHOW_EVENT, onShow);
    return () => window.removeEventListener(SHOW_EVENT, onShow);
  }, []);

  if (!status || !cliUpdateToastVisible(status, laterFor)) return null;

  const later = () => { writeLater(status.installed); setLaterFor(status.installed); };
  // Hidden only once closing time really started: a refused start (Michael's
  // terminal ended) keeps the toast, so the offer is still there after.
  const go = () => { void onCloseAndReopen(status.live).then((ok) => { if (ok) later(); }); };

  const buttonStyle: React.CSSProperties = {
    padding: '3px 10px 1px',
    background: 'var(--cth-mint-light, #d0f0e0)',
    boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
    fontFamily: 'var(--cth-font-ui)', fontSize: 12,
    color: 'var(--cth-ink-900)', cursor: 'pointer', border: 'none'
  };

  return (
    <div style={{
      // Top-right, under the title bar: the bottom-right corner belongs to the
      // app-update and completion toasts, and these can all be up at once.
      position: 'fixed', right: 16, top: 48, zIndex: 400,
      maxWidth: 340,
      background: 'var(--cth-cream-50)',
      boxShadow: '0 0 0 2px var(--cth-ink-900), 0 6px 18px rgba(62,52,140,.08)',
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 8,
      fontFamily: 'var(--cth-font-ui)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="sparkle" />
        <span style={{ fontSize: 13, color: 'var(--cth-ink-900)', fontWeight: 600 }}>
          Your team has an upgrade waiting
        </span>
      </div>
      <span role="status" style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>
        Claude Code {status.installed} is installed, but {status.behind === 1 ? '1 agent is' : `${status.behind} agents are`} still
        on the older version. Close the office and reopen to switch everyone over. Each agent
        saves its work first, so nothing is lost. Nothing restarts until you say so.
      </span>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={later} style={{ ...buttonStyle, background: 'var(--cth-cream-100)' }}>
          later
        </button>
        <button onClick={go} style={buttonStyle}>
          close office &amp; reopen
        </button>
      </div>
    </div>
  );
}

/** Title-bar chip: quiet, but there for as long as agents are behind. */
export function CliUpdateBadge() {
  const status = useCliUpdate();
  if (!status) return null;
  return (
    <button
      className="cth-titlebar-nodrag"
      onClick={() => window.dispatchEvent(new Event(SHOW_EVENT))}
      title={`Claude Code ${status.installed} is installed. Close the office and reopen to use it.`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 8px', margin: 0,
        background: 'var(--cth-mint-light, #d0f0e0)',
        border: 'none', borderRadius: 2,
        boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px',
        color: 'var(--cth-ink-900)', fontWeight: 600, cursor: 'pointer'
      }}
    >
      team upgrade ready
    </button>
  );
}
