import { useId, useState, type CSSProperties } from 'react';

/**
 * An info icon that explains a field on hover or keyboard focus, so screens
 * show the fields and keep the explanations one step away (owner, 2026-09-27:
 * "one of the design goal every where should be make design less verbose").
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        data-infotip=""
        aria-label={label ?? text}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
        // Inside a <label>, a click would otherwise focus the field.
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        style={iconButton}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="6.5" fill="none" stroke="var(--cth-ink-4)" strokeWidth="1" />
          <circle cx="7.5" cy="4.6" r="0.9" fill="var(--cth-ink-3)" />
          <rect x="6.8" y="6.4" width="1.4" height="4.6" rx="0.7" fill="var(--cth-ink-3)" />
        </svg>
      </button>
      {open && (
        <span id={id} role="tooltip" style={bubble}>{text}</span>
      )}
    </span>
  );
}

const iconButton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 16, height: 16, padding: 0, border: 'none', background: 'transparent',
  borderRadius: '50%', cursor: 'help'
};

// v2 (branding/DESIGN.md 7.23): an ink tooltip, 260px max.
const bubble: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: -8, zIndex: 20,
  width: 'max-content', maxWidth: 260, padding: '7px 10px',
  background: 'var(--cth-ink)', borderRadius: 'var(--cth-r-md)', boxShadow: 'var(--cth-shadow-md)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, lineHeight: '16px', fontWeight: 400, letterSpacing: 0,
  color: 'var(--cth-bg)', textTransform: 'none', whiteSpace: 'normal', textAlign: 'start'
};
