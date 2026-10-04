/**
 * The answer a hidden Claude session is writing, read off its rendered screen
 * while it streams (owner, 2026-10-03: "Suggest me" sat on "Writing..." with no
 * sign of life). The transcript only gets the answer once it is complete, so
 * the screen is the only live source. This is a preview: the final text still
 * comes from the transcript. Pure: the lines come from a headless terminal.
 */

/** The marker Claude Code puts before an assistant message. */
export const ANSWER_MARK = '⏺';
/** A line that ends the message: the spinner and status lines (including
 *  "● high · /effort"), the prompt, a rule. */
const AFTER_ANSWER = /^\s*([✻✶✳✢✽·*●]\s|❯|─{3,}|⏵)/;

/**
 * The text after the last answer marker, up to the status line. The terminal
 * wraps long sentences short of its full width, so lines are joined back into
 * paragraphs; a blank line keeps the paragraph break. Empty while nothing is
 * written yet.
 */
export function screenAnswer(lines: string[]): string {
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(ANSWER_MARK)) { start = i; break; }
  }
  if (start < 0) return '';
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const raw = i === start ? lines[i].slice(lines[i].indexOf(ANSWER_MARK) + ANSWER_MARK.length) : lines[i];
    if (i > start && AFTER_ANSWER.test(raw)) break;
    const line = raw.trim();
    if (line) { current.push(line); continue; }
    if (current.length) { paragraphs.push(current.join(' ')); current = []; }
  }
  if (current.length) paragraphs.push(current.join(' '));
  return paragraphs.join('\n\n').trim();
}
