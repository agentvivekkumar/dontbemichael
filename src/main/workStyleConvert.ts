/**
 * Converts a work style between the owner's plain description and the agent's
 * instructions (src/shared/workStyleText.ts). A hidden Claude call with no
 * tools does the rewrite; when it can't, the plain-text fallback answers and
 * says so, so hiring never waits on a sign-in problem.
 */
import { runHiddenClaude } from './hiddenClaude';
import {
  cleanAnswer,
  instructionsFallback,
  plainFallback,
  toInstructionsPrompt,
  toPlainPrompt,
  type WorkStyleContext
} from '../shared/workStyleText';

/** Reading instructions back is a summary: Haiku. Writing them is the part the
 *  team member lives by: Sonnet. */
const PLAIN_MODEL = 'claude-haiku-4-5';
const INSTRUCTIONS_MODEL = 'claude-sonnet-5';
const TIMEOUT_MS = 90_000;
const MAX_TEXT = 8000;

export interface ConvertDeps {
  cwd: string;
  command: string;
  env?: Record<string, string>;
  log?: (event: Record<string, unknown>) => void;
}

export interface ConvertRequest {
  to: 'plain' | 'instructions';
  text: string;
  ctx: WorkStyleContext;
  /** For 'instructions': the work style being replaced, to keep its wording. */
  previous?: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** The renderer's payload, trusted for nothing but short strings. */
export function readConvertRequest(v: unknown): ConvertRequest | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.to !== 'plain' && o.to !== 'instructions') return null;
  const text = str(o.text, MAX_TEXT);
  const c = (o.ctx && typeof o.ctx === 'object' ? o.ctx : {}) as Record<string, unknown>;
  const b = (c.business && typeof c.business === 'object' ? c.business : {}) as Record<string, unknown>;
  const name = str(c.name, 60).trim();
  if (!text.trim() || !name) return null;
  return {
    to: o.to,
    text,
    ctx: { name, title: str(c.title, 120) || undefined, business: { name: str(b.name, 120) || undefined, city: str(b.city, 120) || undefined } },
    previous: str(o.previous, MAX_TEXT) || undefined
  };
}

export async function convertWorkStyle(req: ConvertRequest, deps: ConvertDeps): Promise<{ text: string; source: 'ai' | 'rules' }> {
  const fallback = () => (req.to === 'plain' ? plainFallback(req.text) : instructionsFallback(req.text, req.ctx));
  try {
    const prompt = req.to === 'plain' ? toPlainPrompt(req.text, req.ctx) : toInstructionsPrompt(req.text, req.ctx, req.previous);
    const result = await runHiddenClaude(prompt, {
      model: req.to === 'plain' ? PLAIN_MODEL : INSTRUCTIONS_MODEL,
      cwd: deps.cwd,
      command: deps.command,
      noTools: true,
      env: deps.env,
      timeoutMs: TIMEOUT_MS
    });
    const text = result.ok && result.text ? cleanAnswer(result.text) : '';
    if (text) return { text, source: 'ai' };
    deps.log?.({ kind: 'work-style-fallback', to: req.to, reason: result.ok ? 'empty' : (result.error ?? 'failed') });
  } catch (e) {
    deps.log?.({ kind: 'work-style-fallback', to: req.to, reason: String(e).slice(0, 200) });
  }
  return { text: fallback(), source: 'rules' };
}
