import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialog } from './useDialog';
import { useBackdropClose } from '@/hooks/useBackdropClose';

/**
 * The v2 dialog frame (branding/DESIGN.md 7.23): a card on the backdrop, its
 * title and close in a header row, an optional footer for the actions. Esc,
 * the focus trap and focus restore come from useDialog. The backdrop closes it
 * only when both the press and the click land on it, so a text selection that
 * ends past the edge never does (useBackdropClose). While `busy`, nothing
 * closes it (backdrop, Esc and the close button all wait).
 */
export function Dialog({ title, onClose, busy = false, width = 520, footer, children, bodyStyle, zIndex = 300, closable = true }: {
  title: ReactNode;
  onClose: () => void;
  busy?: boolean;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
  bodyStyle?: CSSProperties;
  zIndex?: number;
  /** False for a dialog that must be answered (no close button, no Esc, no backdrop click). */
  closable?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement | null>(null);
  const close = () => { if (!busy && closable) onClose(); };
  useDialog(ref, close);
  const backdrop = useBackdropClose(close);
  return (
    <div {...backdrop} style={{
      position: 'fixed', inset: 0, zIndex, background: 'var(--cth-backdrop)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        style={{
          width, maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none',
          background: 'var(--cth-card)', borderRadius: 'var(--cth-r-2xl)',
          boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)',
          fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 14px 22px', borderBottom: '1px solid var(--cth-line)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--cth-ink)' }}>{title}</h2>
          {closable && (
            <button type="button" onClick={close} disabled={busy} aria-label={t('common.close')} style={closeBtn}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        <div style={{ padding: '18px 22px', overflowY: 'auto', minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 14, ...bodyStyle }}>
          {children}
        </div>
        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--cth-line)', flexShrink: 0, background: 'var(--cth-card-2)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

const closeBtn: CSSProperties = {
  width: 30, height: 30, display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer', borderRadius: 'var(--cth-r-md)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', color: 'var(--cth-ink-2)', flexShrink: 0
};
