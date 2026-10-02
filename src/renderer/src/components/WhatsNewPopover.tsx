/**
 * What's new, opened from the About card in Settings → General: a popover right
 * under the link you clicked (owner, 2026-10-02). It used to open as a toast in
 * the bottom right corner, which on a mostly white app was easy to miss; the
 * answer to a click belongs where you are looking.
 *
 * It shows the notes of the version you are on: the ones the updater already
 * holds after an update, else the GitHub release for this version, fetched once
 * (`update:releaseNotes`). Loading, notes, or a plain line saying they could not
 * be read, never nothing. Esc, a click outside, or Close shut it, and focus
 * returns to the link. Esc is claimed here so Settings stays open.
 *
 * Ink fill with light text, like the info tooltips (DESIGN.md 7.23): white on
 * a white card had no edge and was hard to read (owner, 2026-10-02). The
 * tokens flip in dark mode, so it stays the opposite of the page there too.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { summarizeReleaseNotes } from '@shared/releaseNotes';
import { REPO_URL } from '@shared/updateState';

interface Notes { version?: string; notes?: string; url?: string }

/** The notes of the running version, loaded on first open and kept. */
export function useWhatsNew(): { notes: Notes | null; loading: boolean; load: () => void } {
  const [notes, setNotes] = useState<Notes | null>(null);
  const [loading, setLoading] = useState(false);
  const load = () => {
    if (notes || loading) return;
    setLoading(true);
    void (async () => {
      try {
        const cur = await window.cth.updateCurrent();
        if (cur.state === 'just-updated' && cur.notes) { setNotes({ version: cur.version, notes: cur.notes }); return; }
      } catch { /* fetch below */ }
      try {
        const r = await window.cth.updateReleaseNotes();
        setNotes(r);
      } catch {
        setNotes({});
      }
    })().finally(() => setLoading(false));
  };
  return { notes, loading, load };
}

export function WhatsNewPopover({ notes, loading, onClose, anchor }: {
  notes: Notes | null; loading: boolean; onClose: () => void; anchor: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement | null>(null);
  const title = notes?.version ? t('whatsNewPopover.titleVersion', { version: notes.version }) : t('whatsNewPopover.title');
  const lines = useMemo(() => summarizeReleaseNotes(notes?.notes), [notes?.notes]);

  // A click anywhere outside the popover and its link closes it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose, anchor]);

  const close = () => { onClose(); anchor.current?.focus({ preventScroll: true }); };
  const changelog = `${REPO_URL}/blob/main/CHANGELOG.md`;

  return (
    <div
      ref={ref}
      role="dialog"
      className="cth-onink"
      aria-label={title}
      // Settings closes on Esc unless the key was already handled (useDialog).
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}
      style={pop}
    >
      <span aria-hidden style={caret} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, color: SPARK }}>
          <path fill="currentColor" d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: ON }}>{title}</span>
      </div>
      {loading || !notes ? (
        <span style={body}>{t('whatsNewPopover.loading')}</span>
      ) : lines.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {lines.map((line, i) => (
            <li key={i} style={{ display: 'flex', gap: 6, ...body }}>
              <span aria-hidden style={{ color: SPARK }}>•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span style={body}>{t('whatsNewPopover.failed')}</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingTop: 10, borderTop: `1px solid ${RULE}` }}>
        <button type="button" style={link} onClick={() => void window.cth.openExternal(changelog)}>{t('whatsNewPopover.fullChangelog')}</button>
        {notes?.url && <button type="button" style={link} onClick={() => void window.cth.updateOpenRelease(notes.url)}>{t('whatsNewPopover.releasePage')}</button>}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={close} autoFocus style={closeBtn}>{t('whatsNewPopover.close')}</button>
      </div>
    </div>
  );
}

/** Text on the ink fill, its quieter body tone, the rule, and the accent. */
const ON = 'var(--cth-bg)';
const ON_SOFT = 'color-mix(in srgb, var(--cth-bg) 84%, transparent)';
const RULE = 'color-mix(in srgb, var(--cth-bg) 18%, transparent)';
const SPARK = 'color-mix(in srgb, var(--cth-indigo) 55%, var(--cth-bg))';

const pop: CSSProperties = {
  position: 'absolute', top: 'calc(100% - 2px)', insetInlineStart: 8, zIndex: 20,
  width: 380, maxWidth: 'calc(100vw - 48px)', boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px',
  background: 'var(--cth-ink)', color: ON, borderRadius: 'var(--cth-r-lg)',
  boxShadow: 'var(--cth-shadow-lg)',
  fontFamily: 'var(--cth-font-ui)', textAlign: 'start'
};
/** A small notch pointing up at the link, so the popover reads as its answer. */
const caret: CSSProperties = {
  position: 'absolute', top: -5, insetInlineStart: 22, width: 10, height: 10, transform: 'rotate(45deg)',
  background: 'var(--cth-ink)'
};
const body: CSSProperties = { fontSize: 13, lineHeight: '19px', color: ON_SOFT };
const link: CSSProperties = {
  padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, lineHeight: '17px', fontWeight: 600,
  color: ON, textDecoration: 'underline', textUnderlineOffset: 2
};
const closeBtn: CSSProperties = {
  padding: '5px 12px', border: 'none', borderRadius: 'var(--cth-r-md)', cursor: 'pointer',
  background: ON, color: 'var(--cth-ink)', fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600
};
