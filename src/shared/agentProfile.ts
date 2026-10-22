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
  /** "How the work is done", one line each. A paragraph of older duties is one sentence each. */
  does: string[];
  /** "Asks the owner first", one line each. A paragraph of older duties is one sentence each. */
  asksFirst: string[];
}

/** The work style as the owner edits it: one note for the job, then a line
 *  each for how the work is done and what asks the owner first. */
export interface WorkStyleDraft {
  job: string;
  does: string[];
  asksFirst: string[];
  /** True when a how-to-work or asks-first heading was in the text, even if
   *  that part was left empty. */
  listed: boolean;
}

/** A heading the work style uses, in either form the app stores: the plain
 *  labels the owner edits, or the house headings the agent is given. */
function dutyHeading(line: string): { section: 'job' | 'does' | 'asks'; rest: string } | null {
  const text = line.trim().replace(/^#{1,6}\s+/, '');
  // A colon, or nothing else on the line. A sentence that merely starts
  // with the words ("How to work the dough takes practice.") is not a heading.
  const rules: Array<{ section: 'job' | 'does' | 'asks'; re: RegExp }> = [
    { section: 'does', re: /^(?:how the work is done|how to work|what you do)\s*(?::\s*(.*)|\s*)$/i },
    { section: 'asks', re: /^(?:asks (?:you|the owner) first|needs the owner'?s approval(?:\s*\([^)]*\))?)\s*(?::\s*(.*)|\s*)$/i },
    { section: 'job', re: /^the job\s*(?::\s*(.*)|\s*)$/i }
  ];
  for (const rule of rules) {
    const hit = rule.re.exec(text);
    if (hit) return { section: rule.section, rest: (hit[1] ?? '').trim() };
  }
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

/** One duty per line: a bullet, or several lines with nothing blank between them.
 *  A single paragraph, or paragraphs split by a blank line, is the older shape. */
function isDutyList(lines: string[]): boolean {
  const body = blankEdges(lines);
  const items = body.map((line) => line.trim()).filter(Boolean);
  if (items.some(bulletLine)) return true;
  return items.length >= 2 && body.every((line) => line.trim());
}

/** Keep each written line. Split into sentences only for a paragraph of duties,
 *  and only when this work style has no section that is already a list of lines. */
function dutyLines(lines: string[], keepLines: boolean): string[] {
  const body = blankEdges(lines);
  const items = body.map((line) => line.trim()).filter(Boolean);
  if (!items.length) return [];
  if (keepLines || isDutyList(body)) return items.map(stripBullet).filter(Boolean);
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

function jobText(lines: string[]): string {
  return blankEdges(lines).join('\n').trim();
}

/** Split a work style into the job note and the two lists. A job keeps its
 *  paragraphs. A line already written stays whole, including an unknown
 *  heading or markdown. Text with neither list heading stays one job note. */
export function parseWorkStyleDraft(goal: string | undefined): WorkStyleDraft {
  const body = workStyleBody(goal).replace(/\r/g, '');
  const chunks: Array<{ section: 'job' | 'does' | 'asks'; lines: string[] }> = [];
  let section: 'job' | 'does' | 'asks' = 'job';
  let lines: string[] = [];
  let listed = false;
  let sawHeading = false;
  const flush = (): void => {
    chunks.push({ section, lines });
    lines = [];
  };
  for (const raw of body.split('\n')) {
    const heading = dutyHeading(raw);
    if (heading) {
      flush();
      sawHeading = true;
      if (heading.section === 'does' || heading.section === 'asks') listed = true;
      section = heading.section;
      lines = heading.rest ? [heading.rest] : [];
      continue;
    }
    lines.push(raw);
  }
  flush();
  if (!sawHeading) return { job: body.trim(), does: [], asksFirst: [], listed: false };

  const keepLines = chunks.some((c) => (c.section === 'does' || c.section === 'asks') && isDutyList(c.lines));
  const jobs: string[] = [];
  const does: string[] = [];
  const asksFirst: string[] = [];
  for (const chunk of chunks) {
    if (chunk.section === 'job') {
      const text = jobText(chunk.lines);
      if (text) jobs.push(text);
    } else if (chunk.section === 'does') does.push(...dutyLines(chunk.lines, keepLines));
    else asksFirst.push(...dutyLines(chunk.lines, keepLines));
  }
  return { job: jobs.join('\n\n'), does, asksFirst, listed };
}

/** The plain labels the owner edits, and the form the rewrite reads back. */
export function formatWorkStyleDraft(draft: Pick<WorkStyleDraft, 'job' | 'does' | 'asksFirst'>): string {
  const blocks: string[] = [];
  const job = draft.job.trim();
  if (job) blocks.push(`The job:\n${job}`);
  const does = draft.does.map((line) => line.trim()).filter(Boolean);
  if (does.length) blocks.push(`How the work is done:\n${does.join('\n')}`);
  const asks = draft.asksFirst.map((line) => line.trim()).filter(Boolean);
  if (asks.length) blocks.push(`Asks the owner first:\n${asks.join('\n')}`);
  return blocks.join('\n\n');
}

/** The two lists an owner scans, read from the saved work style rather than
 *  the Office Pack card. Michael is not passed here: his lists are written
 *  for him in the app. */
export function profileDuties(goal: string | undefined): ProfileDuties {
  const draft = parseWorkStyleDraft(goal);
  return { found: draft.listed, does: draft.does, asksFirst: draft.asksFirst };
}
