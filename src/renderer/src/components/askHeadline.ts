/**
 * The one line an Ask me card shows while folded (owner, 2026-09-30: a board
 * of full questions read as one long paragraph). Michael writes the ask as a
 * bold first sentence, then the context; the headline is that bold lead, or
 * else the first sentence, as plain text.
 */
export function askHeadline(q: string): string {
  const text = q.trim();
  const bold = /^\*\*([\s\S]+?)\*\*/.exec(text);
  const lead = bold ? bold[1] : (/^[\s\S]*?(?:[.?!](?=\s|$)|\n|$)/.exec(text)?.[0] ?? text);
  return lead
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*|__|[*_]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "just now", "5m ago", "2h ago", "3 days ago" in the app's language. */
export function askedAgo(iso: string | undefined, now: number, lang: string, justNow = 'just now'): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'narrow' });
  if (s < 60) return justNow;
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  return rtf.format(-Math.floor(s / 86400), 'day');
}
