import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

/**
 * An info icon that explains a field on hover or keyboard focus.
 * The tooltip renders into document.body so clipped parent containers
 * cannot cut it off.
 */
export function InfoTip({ text, label, align = 'start' }: { text: string; label?: string; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!buttonRef.current?.matches(':hover') && !bubbleRef.current?.matches(':hover')) {
        setOpen(false);
      }
    }, 100);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const button = buttonRef.current;
    const bubble = bubbleRef.current;
    if (!button || !bubble) return;

    const measure = () => {
      const anchor = button.getBoundingClientRect();
      const tip = bubble.getBoundingClientRect();
      const margin = 8;
      const gap = 6;

      const preferredLeft = align === 'end'
        ? anchor.right + 8 - tip.width
        : anchor.left - 8;
      const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - tip.width - margin));

      const below = anchor.bottom + gap;
      const above = anchor.top - gap - tip.height;
      const top = below + tip.height <= window.innerHeight - margin
        ? below
        : above >= margin
          ? above
          : Math.max(margin, Math.min(below, window.innerHeight - tip.height - margin));

      setPosition((previous) =>
        previous?.left === left && previous?.top === top ? previous : { left, top }
      );
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, text, align]);

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  return (
    <span
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={buttonRef}
        type="button"
        data-infotip=""
        aria-label={label ?? text}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        // Inside a <label>, a click would otherwise focus the field.
        onClick={(e) => {
          e.preventDefault();
          setOpen((value) => !value);
        }}
        style={iconButton}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="6.5" fill="none" stroke="var(--cth-ink-4)" strokeWidth="1" />
          <circle cx="7.5" cy="4.6" r="0.9" fill="var(--cth-ink-3)" />
          <rect x="6.8" y="6.4" width="1.4" height="4.6" rx="0.7" fill="var(--cth-ink-3)" />
        </svg>
      </button>
      {open && createPortal(
        <span
          ref={bubbleRef}
          id={id}
          role="tooltip"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{
            ...bubble,
            position: 'fixed',
            left: position?.left ?? 8,
            top: position?.top ?? 8,
            visibility: position ? 'visible' : 'hidden'
          }}
        >
          {text}
        </span>,
        document.body
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
  zIndex: 400,
  width: 'max-content',
  maxWidth: 'min(260px, calc(100vw - 16px))',
  maxHeight: 'calc(100vh - 16px)',
  overflowY: 'auto',
  boxSizing: 'border-box',
  padding: '7px 10px',
  background: 'var(--cth-ink)',
  borderRadius: 'var(--cth-r-md)',
  boxShadow: 'var(--cth-shadow-md)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 11.5,
  lineHeight: '16px',
  fontWeight: 400,
  letterSpacing: 0,
  color: 'var(--cth-bg)',
  textTransform: 'none',
  whiteSpace: 'normal',
  textAlign: 'start'
};
