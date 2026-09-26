/**
 * An agent's Profile tab, read out of what the app already stores
 * (docs/designs/agent-profile.md, owner 2026-09-25).
 *
 * The role line every agent carries (`description`, the registry `role`) is
 * written for Michael's routing: "Executive Admin: Pam sorts the business inbox
 * ... Send here for "a", "b" or inbox cleanup. Not for X; that goes to Y."
 * This splits it into the parts an owner reads: the job title, what the job
 * is, what to send, and what goes elsewhere. Pure: no fs, no React.
 */

export interface RoleLine {
  /** "Executive Admin"; empty when the line has no "Title: " lead. */
  title: string;
  /** The rest, minus the routing sentences. */
  summary: string;
  /** "anything important in email", "did the client reply", "inbox cleanup". */
  sendFor: string[];
  /** "Not for writing answers to customer questions; that goes to Customer Support." */
  notFor: string;
}

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Sentences, keeping quoted text whole (a period inside quotes doesn't split). */
function sentences(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    cur += c;
    if (c === '"' || c === '“' || c === '”') quoted = !quoted;
    if (!quoted && (c === '.' || c === '!' || c === '?') && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseRoleLine(description: string | undefined): RoleLine {
  const text = (description ?? '').replace(/\s+/g, ' ').trim();
  const colon = text.indexOf(': ');
  // A title is short; a colon deep in a sentence is not a title.
  const hasTitle = colon > 0 && colon <= 40;
  const title = hasTitle ? capital(text.slice(0, colon).trim()) : '';
  const body = hasTitle ? text.slice(colon + 2) : text;

  const kept: string[] = [];
  let sendFor: string[] = [];
  let notFor = '';
  for (const s of sentences(body)) {
    const send = /^Send here for (.+?)\.?$/i.exec(s);
    if (send) {
      sendFor = send[1]
        .split(/,\s*|\s+or\s+|\s+and\s+/)
        .map((p) => p.replace(/^["“]|["”]$/g, '').trim())
        .filter(Boolean);
      continue;
    }
    if (/^Not for\b/i.test(s)) { notFor = s; continue; }
    kept.push(s);
  }
  return { title, summary: capital(kept.join(' ')), sendFor, notFor };
}

/** A work style is written to the agent ("The owner set this work style for
 *  your role at ..."); its first line only says who it's for, so the Profile
 *  drops it and shows the rest. */
export function workStyleBody(goal: string | undefined): string {
  return (goal ?? '').replace(/^The owner set this work style for your role[^\n]*\n+/, '').trim();
}
