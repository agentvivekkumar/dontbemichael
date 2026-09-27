/**
 * The jobs the hire wizard offers, as plain data (docs/designs/hire-redesign.md).
 *
 * A job is a title, the line Michael routes by, and a work style. It comes from
 * one of three places:
 *   - a teammate already in this office (their text as it is today, owner edits
 *     included: design D2),
 *   - a card in any office pack (every business, not just this one: point 4),
 *   - nothing ("Write a new job").
 * Copied text names the person it was written for ("Pam sorts the business
 * inbox"), so the copy swaps that name for the new hire's.
 *
 * Also here: the folder a hire gets (its own, suffixed on a clash: point 2) and
 * the instant, rules-only half of the distinct job check (D6). No electron or
 * node imports: the renderer and main use it, and tests load it directly.
 */

import type { AgentDefinitionV2 } from './agentDefinition';
import type { OfficePack } from './officePack';
import { splitAgentRole, joinAgentRole } from './agentRole';
import { teamMemberGoal, teamMemberName, folderNameFor } from './teamPlan';

export type HireJobSource = 'card' | 'team' | 'new';

export interface HireJob {
  /** `card:<businessType>/<cardId>`, `team:<agentId>`, or `new`. */
  key: string;
  source: HireJobSource;
  /** Job title: "Executive Admin". */
  title: string;
  /** The line Michael routes by ("what to send"). */
  routing: string;
  /** Work style, written to the agent. */
  workStyle: string;
  /** One sentence for the job list. */
  summary: string;
  /** Folder name the job works in by default ("Admin"). */
  folder?: string;
  modelTier?: 'best' | 'fast';
  /** The pack card this job traces back to: `<businessType>/<cardId>`. */
  sourceCard?: string;
  /** The person the text was written for; swapped for the new hire's name. */
  fromName?: string;
  /** Pack display name, for card jobs ("Restaurant & Food"). */
  business?: string;
}

export const NEW_JOB_KEY = 'new';

/**
 * Each character's own job: the pack card of their job family. Characters with
 * no card of their own (Erin, Jim, Kevin...) take their family's card, matching
 * the job each tile names (addAgent.castRole).
 */
export const CHARACTER_CARD: Readonly<Record<string, string>> = {
  pam: 'pam', erin: 'pam',
  dwight: 'dwight', jim: 'dwight', stanley: 'dwight', phyllis: 'dwight', andy: 'dwight',
  oscar: 'oscar', angela: 'oscar', kevin: 'oscar',
  kelly: 'kelly',
  ryan: 'ryan',
  toby: 'toby',
  nick: 'nick',
  sadiq: 'sadiq',
  creed: 'creed',
  meredith: 'meredith',
  darryl: 'darryl'
};

export interface Business { name?: string; city?: string }

function cardJob(pack: OfficePack, def: AgentDefinitionV2, business: Business): HireJob {
  return {
    key: `card:${pack.businessType}/${def.id}`,
    source: 'card',
    title: def.role,
    routing: (def.routing ?? def.summary).trim(),
    workStyle: teamMemberGoal(def, business),
    summary: def.summary,
    folder: folderNameFor(def),
    modelTier: def.modelTier,
    sourceCard: `${pack.businessType}/${def.id}`,
    fromName: teamMemberName(def),
    business: pack.displayName
  };
}

/**
 * Every card in every pack, this office's own pack first, then the others in
 * the order given, core last. A card whose text is the same as one already
 * listed (a business pack repeating core's) is shown once.
 */
export function cardJobs(
  packs: OfficePack[],
  core: OfficePack | undefined,
  businessType: string | undefined,
  business: Business
): HireJob[] {
  const own = packs.find((p) => p.businessType === businessType);
  const order = [own, ...packs.filter((p) => p !== own), core].filter((p): p is OfficePack => !!p);
  const seen = new Set<string>();
  const out: HireJob[] = [];
  for (const pack of order) {
    for (const def of pack.agents ?? []) {
      const job = cardJob(pack, def, business);
      const sig = `${job.title}\n${job.routing}\n${job.workStyle}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(job);
    }
  }
  return out;
}

export interface Teammate {
  id: string;
  name: string;
  character?: string;
  description?: string;
  goal?: string;
  cwd?: string;
  sourceCard?: string;
  isGod?: boolean;
  isAssistant?: boolean;
  archived?: boolean;
}

/** The team the owner works with: not Michael, his assistant or archived agents. */
export function activeTeam<T extends Teammate>(agents: T[]): T[] {
  return agents.filter((a) => !a.isGod && !a.isAssistant && !a.archived);
}

/** The pack card a teammate traces back to, if any: the one it was hired from,
 *  or the card with its id (setup starts pack members under their card's id). */
export function teammateCard(t: Teammate, cards: HireJob[]): string | undefined {
  if (t.sourceCard) return t.sourceCard;
  return cards.find((c) => c.sourceCard?.endsWith(`/${t.id}`))?.sourceCard;
}

/** Every teammate's job as it is today ("Your office"), teammates without a
 *  job line left out. */
export function teamJobs(agents: Teammate[], cards: HireJob[] = []): HireJob[] {
  const out: HireJob[] = [];
  for (const t of activeTeam(agents)) {
    const { role, roleDescription } = splitAgentRole(t.description);
    if (!role && !roleDescription) continue;
    const card = teammateCard(t, cards);
    const cardJob = card ? cards.find((c) => c.sourceCard === card) : undefined;
    out.push({
      key: `team:${t.id}`,
      source: 'team',
      title: role,
      routing: roleDescription,
      workStyle: t.goal ?? '',
      summary: cardJob?.summary ?? roleDescription,
      folder: cardJob?.folder ?? (role || undefined),
      modelTier: cardJob?.modelTier,
      sourceCard: card,
      fromName: t.name
    });
  }
  return out;
}

/**
 * The job a character comes with (D2): a teammate in this office doing that
 * character's family job first (their text as it stands), else the family card
 * from this office's pack, else from any pack. `cards` is cardJobs' order, so
 * the first matching card is this office's.
 */
export function ownJob(character: string, team: HireJob[], cards: HireJob[]): HireJob | undefined {
  const cardId = CHARACTER_CARD[character];
  if (!cardId) return undefined;
  const mate = team.find((j) => j.sourceCard?.split('/')[1] === cardId);
  if (mate) return mate;
  return cards.find((c) => c.sourceCard?.split('/')[1] === cardId);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `from` swapped for `to` as a whole word: "Pam sorts" -> "Erin sorts", while
 *  "Pamphlet" stays. No-op when either name is empty or they are the same. */
const nameRe = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, 'gu');

export function swapName(text: string, from: string | undefined, to: string): string {
  const f = from?.trim();
  const t = to.trim();
  if (!text || !f || !t || f === t) return text;
  return text.replace(nameRe(f), t);
}

/** A job copied for `name`: its routing line and work style name them. */
export function jobFor(job: HireJob, name: string): { title: string; routing: string; workStyle: string } {
  return {
    title: job.title,
    routing: swapName(job.routing, job.fromName, name),
    workStyle: swapName(job.workStyle, job.fromName, name)
  };
}

/**
 * The folder a new hire gets (point 2): the job's folder name if nothing uses
 * it yet, else `<Folder>_<Name>`, then `<Folder>_<Name>_2`, ... `taken` answers
 * whether a folder name is already on disk or in use by a teammate.
 */
export function hireFolderName(base: string, name: string, taken: (folder: string) => boolean): string {
  const b = base.trim() || name.trim() || 'Team';
  if (!taken(b)) return b;
  const n = name.trim().replace(/[\\/:*?"<>|]+/g, '');
  const first = n ? `${b}_${n}` : `${b}_2`;
  if (!taken(first)) return first;
  for (let i = 2; i < 100; i++) {
    const next = `${first}_${i}`;
    if (!taken(next)) return next;
  }
  return `${first}_${Date.now().toString(36)}`;
}

// ─── The distinct job check, rules half (D6) ─────────────────────────────────

export interface JobProfile {
  name: string;
  title: string;
  routing: string;
  workStyle?: string;
  mailbox?: string;
}

const STOP = new Set(('a an and are as at be by for from goes here in is it its not of on or so '
  + 'that the their them then this to was what when where which who with you your send sends '
  + 'sorts handles every any all one owner business').split(' '));

function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w)));
}

/** Shared content words over all content words (0..1). */
export function lineSimilarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / (wa.size + wb.size - common);
}

export const SIMILAR_LINES = 0.5;

/** Teammates the new job overlaps by the instant rules: same title, or routing
 *  lines that share most of their words. Names are compared without the new
 *  hire's and teammate's own names so "Pam sorts" and "Erin sorts" match. */
export function overlapsByRules(job: JobProfile, team: JobProfile[]): string[] {
  const title = job.title.trim().toLowerCase();
  const strip = (text: string, ...names: string[]) =>
    names.filter((n) => n.trim()).reduce((t, n) => t.replace(nameRe(n.trim()), ' '), text);
  const out: string[] = [];
  for (const m of team) {
    const sameTitle = !!title && m.title.trim().toLowerCase() === title;
    const similar = lineSimilarity(strip(job.routing, job.name, m.name), strip(m.routing, job.name, m.name)) >= SIMILAR_LINES;
    if (sameTitle || similar) out.push(m.name);
  }
  return out;
}

/** What a binding adds: the new hire's line gains the scope, each overlapping
 *  teammate's line gains "Not for ...; that goes to <Name>." */
export function bindingLines(binding: string, name: string): { own: string; others: string } {
  const b = binding.trim().replace(/[.\s]+$/, '');
  return { own: `Only ${b}.`, others: `Not for ${b}; that goes to ${name}.` };
}

/** `line` with `extra` appended once (no duplicate on a second bind). */
export function appendOnce(line: string, extra: string): string {
  const l = line.trim();
  if (!extra || l.includes(extra)) return l;
  return l ? `${l.replace(/\s+$/, '')} ${extra}` : extra;
}

/** The stored role line for a hire. */
export function hireRole(title: string, routing: string): string {
  return joinAgentRole(title, routing);
}

// ─── The distinct job check, AI half (prompt and answer; the call is main's) ─

export interface DistinctVerdict {
  distinct: boolean;
  overlapsWith: string[];
  why: string;
  suggestion?: string;
  /** 'ai' when the hidden Claude check answered; 'rules' when it could not. */
  source: 'ai' | 'rules';
}

export function distinctPrompt(job: JobProfile, team: JobProfile[]): string {
  const clip = (s: string | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const lines = team.map((m) =>
    `- ${m.name}: title "${clip(m.title, 80)}"; what to send: "${clip(m.routing, 500)}"`
    + `${m.mailbox ? `; mailbox ${m.mailbox}` : ''}; work style: "${clip(m.workStyle, 600)}"`);
  return [
    'You check whether a new team member\'s job overlaps anyone already on a small business\'s AI team.',
    'The office manager routes each piece of work by reading every teammate\'s "what to send" line, so two teammates whose lines cover the same work make routing a coin toss and double the work.',
    'A job is distinct when a request could only sensibly go to one of them: a different area of work, or the same area bound to something particular such as its own mailbox, a named channel, a customer group, a location or a topic.',
    '',
    'The team today:',
    ...(lines.length ? lines : ['- (nobody yet)']),
    '',
    `The new hire, ${job.name}:`,
    `title "${clip(job.title, 80)}"; what to send: "${clip(job.routing, 500)}"${job.mailbox ? `; mailbox ${job.mailbox}` : ''}; work style: "${clip(job.workStyle, 1200)}"`,
    '',
    'Answer with ONE JSON object and nothing else:',
    '{"distinct": true or false, "overlapsWith": ["names of teammates whose work overlaps"], "why": "one plain sentence for the owner", "suggestion": "one short way to make the new job particular, or empty"}',
    'Use plain words and no dashes.'
  ].join('\n');
}

/** The JSON verdict from the model's answer, names limited to the team's.
 *  Null when the answer holds no usable verdict. */
export function parseDistinctAnswer(text: string, teamNames: string[]): DistinctVerdict | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.distinct !== 'boolean') return null;
  const known = new Map(teamNames.map((n) => [n.toLowerCase(), n]));
  const overlapsWith = Array.isArray(o.overlapsWith)
    ? [...new Set(o.overlapsWith.filter((x): x is string => typeof x === 'string')
      .map((x) => known.get(x.trim().toLowerCase())).filter((x): x is string => !!x))]
    : [];
  const distinct = o.distinct && overlapsWith.length === 0;
  return {
    distinct,
    overlapsWith: distinct ? [] : overlapsWith,
    why: typeof o.why === 'string' ? o.why.trim().slice(0, 400) : '',
    suggestion: typeof o.suggestion === 'string' && o.suggestion.trim() ? o.suggestion.trim().slice(0, 300) : undefined,
    source: 'ai'
  };
}
