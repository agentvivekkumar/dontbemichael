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

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
/** A bracketed note that is metadata, not part of the name: a date, a mailbox
 *  (`support@`), "per Kelly", "via the form", a ticket or row number. */
const META = new RegExp(`\\d{1,2}\\s+${MONTH}|${MONTH}\\s+\\d{1,2}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}|\\w*@|\\bper\\s|\\bvia\\s|#\\d+|\\b\\d{3,}\\b`, 'i');

/**
 * The title an Ask me card shows (owner, 2026-10-01: headers looked cryptic,
 * e.g. "ScanBuddy.ai user xd3bKoXtgcdFUls8HOxirM0BRkx2 requested Salesforce
 * setup (support@, 1 Oct)"). Agents are told to write plain titles; this
 * cleans the ones that aren't: opaque ids (uuids, hashes, long tokens that
 * mix letters and digits) and trailing bracketed metadata go, the rest stays.
 */
export function askTitle(title: string): string {
  let t = title.trim();
  for (let m = /\s*\(([^()]*)\)\s*$/.exec(t); m && META.test(m[1]); m = /\s*\(([^()]*)\)\s*$/.exec(t)) {
    t = t.slice(0, m.index);
  }
  t = t
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/\b(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{16,}\b/g, '')
    .replace(/\s+([,.:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return t || title.trim();
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
