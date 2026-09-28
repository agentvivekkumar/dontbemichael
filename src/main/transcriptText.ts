/**
 * The last assistant text in one Claude Code transcript (JSONL).
 *
 * Pure and free of native imports so tests can load it. hiddenClaude.ts reads
 * the transcript of ITS OWN session (named by the `--session-id` it passes),
 * never "the newest file in the project folder": two hidden calls in a row
 * share that folder, and taking the newest file once handed one agent's memory
 * tidy the other agent's answer (Sadiq's memory landed in Toby's, 2026-09-27).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Where Claude Code writes the transcript of session `sessionId`. */
export function transcriptFile(projectDirPath: string, sessionId: string): string {
  return path.join(projectDirPath, `${sessionId}.jsonl`);
}

/** The last non-empty assistant text block in `file`, or null if there is
 *  none yet (the model is still thinking) or the file is missing. */
export function lastAssistantText(file: string): string | null {
  try {
    if (!existsSync(file)) return null;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      let rec: { type?: unknown; message?: { content?: unknown[] } };
      try { rec = JSON.parse(trimmed); } catch { continue; }
      if (rec.type !== 'assistant') continue;
      const content = rec.message?.content;
      if (!Array.isArray(content)) continue;
      for (let j = content.length - 1; j >= 0; j--) {
        const block = content[j] as { type?: unknown; text?: unknown };
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          return block.text.trim();
        }
      }
    }
    return null;
  } catch { return null; }
}
