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
import { Spark } from '@/components/UpdateToast';
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

  return (
    // Top right, under the top bar: the bottom right corner belongs to the
    // app update and completion toasts, and these can all be up at once.
    <div className="cth-toast" style={{ right: 16, top: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Spark />
        <span className="cth-toast-title">
          Your team has an upgrade waiting
        </span>
      </div>
      <span role="status" className="cth-toast-body">
        Claude Code {status.installed} is installed, but {status.behind === 1 ? '1 agent is' : `${status.behind} agents are`} still
        on the older version. Close the office and reopen to switch everyone over. Each agent
        saves its work first, so nothing is lost. Nothing restarts until you say so.
      </span>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="cth-toast-btn" onClick={later}>
          Later
        </button>
        <button className="cth-toast-btn primary" onClick={go}>
          Close office &amp; reopen
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
        height: 26, padding: '0 10px', margin: 0,
        background: 'var(--cth-green-soft)', color: 'var(--cth-green-text)',
        border: 'none', borderRadius: 999,
        fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
      }}
    >
      Team upgrade ready
    </button>
  );
}
