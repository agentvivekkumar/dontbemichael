import { useId, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';

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
        aria-label={label ?? text}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        // Inside a <label>, a click would otherwise focus the field.
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        style={iconButton}
      >
        <Icon name="info" />
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
  color: 'var(--cth-ink-500)', cursor: 'help'
};

const bubble: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: -8, zIndex: 20,
  width: 300, padding: '8px 10px',
  background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300), 0 4px 0 rgba(26, 19, 32, 0.15)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px', fontWeight: 400,
  color: 'var(--cth-ink-900)', textTransform: 'none', whiteSpace: 'normal', textAlign: 'start'
};
