/**
 * The release drop: a centered, full-bleed "what's new" moment.
 *
 * A corner toast with three clipped bullets is a changelog notification. This is
 * the other thing: a page the release author designs, shown once, at the size the
 * work deserves.
 *
 * The chrome is a v2 dialog (branding/DESIGN.md 7.23): a card with a title row
 * and a close. What is inside the frame is the release author's page, styled
 * by its own tokens (shared/releaseDrop.ts), which follow the website.
 *
 * There is NO chrome button here, on purpose. The app frames the drop and gets
 * out of the way; every action the release wants to offer (read the notes, star
 * the repo, join the Discord) is authored INSIDE the HTML as an ordinary link,
 * where the person writing the release controls the wording and the placement.
 *
 * The authored HTML runs in an iframe with a `default-src 'none'` CSP and a
 * sandbox that grants exactly one capability: `allow-popups` (see
 * shared/releaseDrop.ts for why everything else stays shut). That is what makes
 * an authored `<a target="_blank">` work: the frame cannot navigate anything
 * itself, it can only ASK for a window, and main's setWindowOpenHandler denies
 * the window and hands the URL to the OS browser if and only if it is http(s).
 * No scripts, no same-origin, no forms, no top-level navigation.
 *
 * One consequence still shapes the layout: the frame's height cannot be measured
 * (that needs a postMessage bridge, which needs allow-scripts). So the modal is a
 * fixed viewport-relative box and the drop pages itself inside it, rather than
 * the box growing to fit.
 *
 * Dismissal is Esc, the title bar's close, or a click on the backdrop. A modal
 * this large with no visible way out is a trap, so the close is a real control
 * out here even though the drop itself holds none.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildDropSrcDoc } from '../../../shared/releaseDrop';
import { useBackdropClose } from '@/hooks/useBackdropClose';

export interface ReleaseDropProps {
  version: string;
  /** Authored HTML, already extracted from the release body. */
  html: string;
  onDismiss: () => void;
}

/** The frame's own ground (shared/releaseDrop.ts --paper, the v2 `card`), so
 *  the area under the loader never flashes a different color before the page
 *  paints. */
const PAPER = '#FFFFFF';

const REVEAL_TIMEOUT_MS = 2500;

export function ReleaseDrop({ version, html, onDismiss }: ReleaseDropProps) {
  const srcDoc = useMemo(() => buildDropSrcDoc(html), [html]);
  const backdrop = useBackdropClose(onDismiss);

  // The loader covers the frame until it is ready to be seen. `revealed` latches
  // true on the FIRST of two signals — the iframe's onLoad or the timeout cap —
  // and never flips back, so the reveal is monotonic and cannot flicker.
  const [revealed, setReveal] = useState(false);
  const reveal = () => setReveal(true);

  // The timeout cap. Cleared on unmount so a dismissed-early drop schedules
  // nothing, and it races onLoad rather than replacing it: whichever fires first
  // reveals, the other is a harmless no-op against the latched state.
  useEffect(() => {
    const t = setTimeout(reveal, REVEAL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  // Esc dismisses. "Later" is always a legitimate answer to an update.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      // Backdrop. A press and release on it dismisses, same meaning as "later".
      {...backdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 600, background: 'var(--cth-backdrop)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 28,
        overflowY: 'auto'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`What's new in Don't Be Michael ${version}`}
        style={{
          margin: 'auto',
          height: 'min(82vh, 720px)',
          width: 'min(calc(82vh * 1.28), 92vw, 920px)',
          minHeight: 420,
          display: 'flex', flexDirection: 'column',
          background: 'var(--cth-card)',
          borderRadius: 'var(--cth-r-2xl)',
          boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)',
          overflow: 'hidden',
          fontFamily: 'var(--cth-font-ui)'
        }}
      >
        {/* Title row, and the only control the chrome owns: close. */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px 12px 22px', borderBottom: '1px solid var(--cth-line)'
        }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--cth-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            What&apos;s new
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--cth-ink-3)', letterSpacing: 0 }}>
              v{version.replace(/^v/, '')}
            </span>
          </span>
          <button
            onClick={onDismiss}
            aria-label="Close release notes"
            title="Close (Esc)"
            style={{
              flexShrink: 0, width: 30, height: 30, padding: 0, border: 'none', cursor: 'pointer',
              borderRadius: 'var(--cth-r-md)', background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)',
              color: 'var(--cth-ink-2)', display: 'grid', placeItems: 'center'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* The frame area. Relative so the loader can sit exactly over the drop,
            not the title bar. The iframe is always mounted at full opacity — the
            loader is a separate overlay that is REMOVED on reveal, so the failure
            mode of a broken reveal is a brief extra spinner, never a permanently
            hidden frame. */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, background: PAPER }}>
          {/* The drop itself. `allow-popups` is the ONLY grant: it is what lets an
              authored <a target="_blank"> reach the OS browser, and it carries no
              script, same-origin, form or navigation rights with it. */}
          <iframe
            title={`What's new in ${version}`}
            srcDoc={srcDoc}
            sandbox="allow-popups"
            referrerPolicy="no-referrer"
            // onLoad fires on the PARENT and needs no script rights in the child;
            // it is the honest "the frame is ready" signal. The timeout cap in the
            // effect above covers the case where it is delayed by slow subresources.
            onLoad={reveal}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              border: 'none', background: PAPER
            }}
          />
          {!revealed && <DropLoader />}
        </div>
      </div>
    </div>
  );
}

/** The window before the frame paints. Warm paper (never a white flash) with the
 *  title bar's three square dots marching, in the landing-site palette. Pure
 *  chrome — it carries no control; dismissal stays Esc / close / backdrop. It is
 *  removed the instant the frame is revealed, so it is only ever seen briefly. */
function DropLoader() {
  const { t } = useTranslation();
  return (
    <div
      // aria-hidden: the dialog's own label already announces the drop, and a
      // transient loader should not be read out. It sits ABOVE the frame and
      // lets no interaction through, but the frame under it is inert until loaded
      // anyway, so blocking pointer events here changes nothing a user could do.
      aria-hidden
      style={{
        position: 'absolute', inset: 0, zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 18, background: PAPER
      }}
    >
      <style>{`
        @keyframes drop-load-pulse {
          0%, 80%, 100% { opacity: .2; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .drop-load-dot { animation: none !important; opacity: .55 !important; transform: none !important; }
        }
      `}</style>
      <span aria-hidden style={{ display: 'flex', gap: 8 }}>
        {/* Coral only ever means "needs you" (DESIGN.md 3.2). */}
        {['var(--cth-blue)', 'var(--cth-amber)', 'var(--cth-indigo)'].map((c, i) => (
          <i
            key={c}
            className="drop-load-dot"
            style={{
              width: 10, height: 10, borderRadius: '50%', background: c, display: 'block',
              animation: 'drop-load-pulse 1.1s ease-in-out infinite',
              animationDelay: `${i * 0.16}s`
            }}
          />
        ))}
      </span>
      <span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-3)' }}>
        {t('releaseDrop.loading')}
      </span>
    </div>
  );
}
