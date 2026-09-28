/**
 * Work style in two forms (owner, 2026-09-27: "the work style on the review
 * step is a LLM prompt. This app is for business users so it should show a
 * plain english language style description which business user can modify.
 * while saving system should automatically convert and align to meet
 * prompting standards").
 *
 *   plain         what the owner reads and edits: third person, about the
 *                 team member, in everyday words.
 *   instructions  what the agent gets (its `goal`): written to the agent, in
 *                 the house format and to the prompting guidelines in
 *                 docs/designs/agent-instructions/appendix-c-prompting-guidelines.md.
 *
 * Main turns one into the other with a hidden Claude call; the prompts are
 * here, beside plain-text fallbacks used when that call can't run. No electron
 * or node imports: main and the renderer use it, tests load it directly.
 */

export interface WorkStyleContext {
  /** The team member's name. */
  name: string;
  /** Job title. */
  title?: string;
  /** Business name and city, for the instructions' first line. */
  business?: { name?: string; city?: string };
  /** The office manager's name (Michael unless the owner renamed him). */
  manager?: string;
}

const where = (b?: { name?: string; city?: string }) => {
  const n = b?.name?.trim() || 'the business';
  return b?.city?.trim() ? `${n}, ${b.city.trim()}` : n;
};

/** The first line every work style opens with (teamMemberGoal's packs do too). */
export function instructionsOpening(b?: { name?: string; city?: string }): string {
  return `The owner set this work style for your role at ${where(b)}.`;
}

/** The hidden call that turns an agent's instructions into the owner's plain
 *  description. */
export function toPlainPrompt(instructions: string, ctx: WorkStyleContext): string {
  const michael = ctx.manager?.trim() || 'Michael';
  return [
    `Rewrite the instructions below, which were written for an AI team member named ${ctx.name}${ctx.title ? ` (${ctx.title})` : ''}, as a short plain English description for the small business owner who employs them.`,
    `Write about ${ctx.name} in the third person ("${ctx.name} sorts the inbox"), in everyday words a busy owner reads in a minute. Keep every duty, habit and approval rule the instructions contain, and add nothing new.`,
    `Never write "you" or "your": the reader cannot tell who that means. Name every party. The business owner is "the owner". ${michael} is the office manager: team members report to ${michael} and ${michael} brings to the owner whatever needs them, so anything ${ctx.name} sends, reports or asks for approval goes to ${michael}, even where the instructions say "the owner" or "you". Teammates keep their names or job titles as the instructions give them.`,
    'Use three short parts, each a label on its own line followed by a few sentences: "The job:", "How the work is done:", "Asks the owner first:". Leave out a part the instructions have nothing for.',
    'No markdown symbols, no bullet characters, no dashes; use commas, colons and periods. Answer with the description only.',
    '',
    '--- INSTRUCTIONS ---',
    instructions.trim()
  ].join('\n');
}

/**
 * The hidden call that turns the owner's plain description into instructions,
 * to the house prompting guidelines (appendix C): facts with reasons, normal
 * volume, no hedges, what to do rather than what not to do, scope and the
 * approvals stated, no generic virtues, a few hundred words at most.
 */
export function toInstructionsPrompt(plain: string, ctx: WorkStyleContext, previous?: string): string {
  return [
    `Turn the owner's description below into the standing work style for ${ctx.name}, an AI team member${ctx.title ? ` whose job is ${ctx.title}` : ''} at ${where(ctx.business)}. ${ctx.name} reads it at the start of every session.`,
    `In the description, "the owner" is the business owner and ${ctx.manager?.trim() || 'Michael'} is the office manager, who hands out work and brings the owner what needs them. Team members send reports and approvals to ${ctx.manager?.trim() || 'Michael'}, never to the owner directly.`,
    '',
    'Follow these rules, because the team member reads every line literally:',
    `Start with exactly this line: "${instructionsOpening(ctx.business)}"`,
    'Then three sections with these markdown headings, leaving out a section the description has nothing for: "### The job" (one or two sentences on the outcome and why it matters), "### How to work" (short prose sentences, each with its reason after "because" or "so"), "### Needs the owner\'s approval" (what must go to Michael for the owner\'s approval first, with the reason).',
    'Address the team member as "you". Write the owner\'s preferences as plain statements of fact. Write at normal volume: no capitals for emphasis, no "must", "never" or "critical" unless the owner said it. State each rule directly, without "try to" or "if possible". Say what to do rather than what to avoid.',
    'Keep every duty, habit, limit and approval the owner described, with their meaning unchanged, and add no duties of your own. Leave out generic advice such as being accurate or thorough, and anything about thinking step by step or double checking.',
    'Keep it under 300 words. Use commas, colons and periods, never dashes. Answer with the work style only.',
    ...(previous?.trim()
      ? ['', 'The team member\'s previous work style is below. Where the description still says the same thing, keep that wording.', '--- PREVIOUS WORK STYLE ---', previous.trim()]
      : []),
    '',
    '--- OWNER\'S DESCRIPTION ---',
    plain.trim()
  ].join('\n');
}

const HEADING_LABEL: Record<string, string> = {
  'the job': 'The job:',
  'how to work': 'How the work is done:',
  "needs the owner's approval": 'Asks the owner first:',
  'needs the owners approval': 'Asks the owner first:'
};

/** A plain description without the model: the opening line addressed to the
 *  agent dropped, headings turned into labels, markdown removed. */
export function plainFallback(instructions: string, name?: string): string {
  const lines = instructions.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^the owner set this work style/i.test(line)) continue;
    const h = line.match(/^#{1,6}\s*(.+?)\s*$/);
    if (h) {
      const label = HEADING_LABEL[h[1].toLowerCase()] ?? `${h[1].replace(/[:.]+$/, '')}:`;
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(label);
      continue;
    }
    out.push(line.replace(/^[-*•]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'));
  }
  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return name?.trim() ? thirdPerson(text, name.trim()) : text;
}

/** The quick rewrite's "you" (the team member, in instructions) as their name,
 *  so the owner never reads a "you" that isn't them (owner, 2026-09-27). */
export function thirdPerson(text: string, name: string): string {
  return text
    .replace(/\b[Yy]ou are\b/g, `${name} is`)
    .replace(/\b[Yy]ou're\b/g, `${name} is`)
    .replace(/\b[Yy]ou have\b/g, `${name} has`)
    .replace(/\b[Yy]ourself\b/g, name)
    .replace(/\b[Yy]our\b/g, `${name}'s`)
    .replace(/\b[Yy]ou\b/g, name);
}

const LABEL_HEADING: Array<[RegExp, string]> = [
  [/^the job:\s*/i, '### The job'],
  [/^how the work is done:\s*/i, '### How to work'],
  [/^asks (?:you|the owner) first:\s*/i, "### Needs the owner's approval"]
];

/** Instructions without the model: the opening line, the owner's labels turned
 *  back into the house headings, their words kept as written. */
export function instructionsFallback(plain: string, ctx: WorkStyleContext): string {
  const out: string[] = [instructionsOpening(ctx.business), ''];
  for (const raw of plain.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const hit = LABEL_HEADING.find(([re]) => re.test(line));
    if (hit) {
      if (out[out.length - 1] !== '') out.push('');
      out.push(hit[1]);
      const rest = line.replace(hit[0], '').trim();
      if (rest) out.push(rest);
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A model answer cleaned for use: fences and a leading label dropped. */
export function cleanAnswer(text: string): string {
  return text.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
}
