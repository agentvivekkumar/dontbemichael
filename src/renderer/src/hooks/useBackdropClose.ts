import { useRef, type MouseEvent } from 'react';

/**
 * Props for a dialog's dark backdrop that close it only on a real click on the
 * backdrop. A text selection that starts in a field and ends past the dialog's
 * edge fires `click` on the backdrop too; without this check it closed the
 * hire dialog mid-edit (owner, 2026-09-27).
 */
export function useBackdropClose(onClose: () => void): {
  onMouseDown: (e: MouseEvent<HTMLElement>) => void;
  onClick: (e: MouseEvent<HTMLElement>) => void;
} {
  const pressedOnBackdrop = useRef(false);
  return {
    onMouseDown: (e) => { pressedOnBackdrop.current = e.target === e.currentTarget; },
    onClick: (e) => {
      const close = pressedOnBackdrop.current && e.target === e.currentTarget;
      pressedOnBackdrop.current = false;
      if (close) onClose();
    }
  };
}

/** Escape in a field, a list or an info bubble means "leave that", not "close
 *  the dialog". */
export function escapeBelongsToField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [role="tooltip"], [data-infotip]');
}
