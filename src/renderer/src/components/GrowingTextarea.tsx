import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * A textarea that grows with what is typed, from one line up to `maxHeight`,
 * then scrolls (owner, 2026-10-01: the Ask me reply box stayed small, so a
 * longer answer was hard to write). It re-measures when its width changes,
 * since the right column can be resized.
 */
export const GrowingTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { maxHeight?: number }>(
  function GrowingTextarea({ maxHeight = 160, value, style, ...rest }, outer) {
    const ref = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(outer, () => ref.current as HTMLTextAreaElement);

    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const fit = () => {
        el.style.height = 'auto';
        const full = el.scrollHeight;
        el.style.height = `${Math.min(full, maxHeight)}px`;
        el.style.overflowY = full > maxHeight ? 'auto' : 'hidden';
      };
      fit();
      let width = el.clientWidth;
      const ro = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
      ro.observe(el);
      return () => ro.disconnect();
    }, [value, maxHeight]);

    return <textarea ref={ref} rows={1} value={value} style={{ resize: 'none', ...style }} {...rest} />;
  }
);
