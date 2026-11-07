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

/** What the Profile lists for a team member who has a saved work style.
 *  `found` is false when the text has neither section, so the caller can keep
 *  the Office Pack lists. An empty section still counts as found: the owner
 *  left it out, and the pack's old line must not fill it back in. */
export interface ProfileDuties {
  found: boolean;
  /** "How the work is done", one line each, or one sentence when that section is a paragraph. */
  does: string[];
  /** "Asks the owner first", one line each, or one sentence when that section is a paragraph. */
  asksFirst: string[];
}

/** A heading the work style uses, in either form the app stores: the plain
 *  labels the owner edits, or the house headings the agent is given. */
function dutyHeading(line: string): { kind: 'job' | 'does' | 'asks'; rest: string } | null {
  const text = line.trim().replace(/^#{1,6}\s+/, '');
  // A colon, or nothing else on the line. A sentence that merely starts
  // with the words ("How to work the dough takes practice.") is not a heading.
  const rules: Array<{ kind: 'job' | 'does' | 'asks'; re: RegExp }> = [
    { kind: 'does', re: /^(?:how the work is done|how to work|what you do)\s*(?::\s*(.*)|\s*)$/i },
    { kind: 'asks', re: /^(?:asks (?:you|the owner) first|needs the owner'?s approval(?:\s*\([^)]*\))?)\s*(?::\s*(.*)|\s*)$/i },
    { kind: 'job', re: /^the job\s*(?::\s*(.*)|\s*)$/i }
  ];
  for (const rule of rules) {
    const hit = rule.re.exec(text);
    if (hit) return { kind: rule.kind, rest: (hit[1] ?? '').trim() };
  }
  return null;
}

/** Any heading ends the section before it. Known duty headings are the job,
 *  how the work is done, and what asks the owner first. Everything else,
 *  including a First task or a weekly report, is its own section. */
function sectionHeading(line: string): { kind: 'job' | 'does' | 'asks' | 'other'; rest: string } | null {
  const known = dutyHeading(line);
  if (known) return known;
  const text = line.trim();
  if (/^#{1,6}\s+\S/.test(text)) return { kind: 'other', rest: '' };
  // "First task" alone, or "First task:", as the old packs and an edited
  // section write it. A duty sentence that only starts that way is not one.
  const first = /^(?:first task)\s*(?::\s*(.*)|\s*)$/i.exec(text);
  if (first && !/[.!?]/.test(text)) return { kind: 'other', rest: (first[1] ?? '').trim() };
  // A short label alone on its line ("Weekly report:"). A time or a link is not one.
  if (/^\p{L}[^:：/\n]{0,39}[:：]$/u.test(text)) return { kind: 'other', rest: '' };
  return null;
}

function blankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

function bulletLine(line: string): boolean {
  return /^[•*\-]\s+/.test(line.trim());
}

function stripBullet(line: string): string {
  return line.trim().replace(/^[•*\-]\s+/, '').trim();
}

/** This section on its own. Several lines, or a bullet, stay as written.
 *  One paragraph of older duties becomes one sentence each. */
function sectionLines(lines: string[]): string[] {
  const body = blankEdges(lines);
  const items = body.map((line) => line.trim()).filter(Boolean);
  if (!items.length) return [];
  const listed = items.some(bulletLine) || (items.length >= 2 && body.every((line) => line.trim()));
  if (listed) return items.map(stripBullet).filter(Boolean);
  const paras: string[] = [];
  let cur: string[] = [];
  const flush = (): void => {
    const text = cur.join(' ').trim();
    if (text) paras.push(text);
    cur = [];
  };
  for (const line of body) {
    if (!line.trim()) flush();
    else cur.push(stripBullet(line));
  }
  flush();
  return paras.flatMap((para) => sentences(para));
}

/** The two lists an owner scans, read from the saved work style rather than
 *  the Office Pack card. A section this does not know is left out of both.
 *  Michael is not passed here: his lists are written for him in the app. */
export function profileDuties(goal: string | undefined): ProfileDuties {
  const body = workStyleBody(goal).replace(/\r/g, '');
  const chunks: Array<{ kind: 'job' | 'does' | 'asks' | 'other'; lines: string[] }> = [];
  let kind: 'job' | 'does' | 'asks' | 'other' | null = null;
  let lines: string[] = [];
  let sawDuty = false;
  const flush = (): void => {
    if (kind) chunks.push({ kind, lines });
    lines = [];
  };
  for (const raw of body.split('\n')) {
    const heading = sectionHeading(raw);
    if (heading) {
      flush();
      kind = heading.kind;
      if (kind === 'does' || kind === 'asks') sawDuty = true;
      lines = heading.rest ? [heading.rest] : [];
      continue;
    }
    if (kind) lines.push(raw);
  }
  flush();
  if (!sawDuty) return { found: false, does: [], asksFirst: [] };
  const does: string[] = [];
  const asksFirst: string[] = [];
  for (const chunk of chunks) {
    if (chunk.kind === 'does') does.push(...sectionLines(chunk.lines));
    else if (chunk.kind === 'asks') asksFirst.push(...sectionLines(chunk.lines));
  }
  return { found: true, does, asksFirst };
}
