import { useEffect, useRef, type RefObject } from 'react';
import { escapeBelongsToField } from '@/hooks/useBackdropClose';

/** Open dialogs, oldest first. Only the last one answers Esc and Tab, so a
 *  dialog opened from inside another closes alone. */
const stack: object[] = [];

/** Sent when closing time starts. Every open dialog closes, so the closing
 *  bar is never hidden behind one or kept from the keyboard by its focus trap
 *  (review, 2026-10-01). */
export const CLOSING_TIME_EVENT = 'cth:closing-time';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every dialog does (branding/DESIGN.md 7.23 and 12): Esc closes it (never
 * mid IME composition, and never from a field, list or info bubble, where Esc
 * means "leave that": owner, 2026-09-27), Tab and Shift+Tab stay inside it, focus moves in when
 * it opens and goes back where it was when it closes.
 */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled = true): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    const before = document.activeElement as HTMLElement | null;
    const me = {};
    stack.push(me);
    if (el && !el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>('[autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (!ref.current || stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape' && !e.isComposing) {
        // Only the top dialog closes: an inner dialog handles its own Esc first.
        if (e.defaultPrevented || escapeBelongsToField(e.target)) return;
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const onClosingTime = () => closeRef.current();
    window.addEventListener('keydown', onKey);
    window.addEventListener(CLOSING_TIME_EVENT, onClosingTime);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(CLOSING_TIME_EVENT, onClosingTime);
      stack.splice(stack.indexOf(me), 1);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [ref, enabled]);
}
