import type { ClipboardEvent } from 'react';

export interface PastedFile { path: string; name: string }

/**
 * What a paste into a composer attaches: a screenshot (main saves it to a
 * file) or files copied in Finder. Shared by Michael's Work tab composer and
 * Talk to Michael, so both attach the same way (review, 2026-10-01: Talk to
 * Michael pasted nothing). It takes the paste (preventDefault, synchronously,
 * before any await) only when there is something to attach; null leaves it
 * as ordinary text.
 */
export function attachmentsFromPaste(e: ClipboardEvent<HTMLElement>): Promise<PastedFile[]> | null {
  const items = Array.from(e.clipboardData?.items ?? []);
  if (items.some((it) => it.kind === 'file' && it.type.startsWith('image/'))) {
    e.preventDefault();
    return window.cth.saveClipboardImage().then((res) => (res.ok ? [res.file] : []));
  }
  const files = Array.from(e.clipboardData?.files ?? [])
    .map((f) => ({ path: window.cth.pathForFile(f), name: f.name }))
    .filter((a) => a.path);
  if (!files.length) return null;
  e.preventDefault();
  return Promise.resolve(files);
}
