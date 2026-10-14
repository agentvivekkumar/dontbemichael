/**
 * A write to a connected app is sent once (issue #54), the rule plain mail
 * sends got in PR #126. The broker forwards a write (anything but GET or
 * HEAD) through `run`, which records it as pending before it goes upstream
 * and settles it with the answer after, in an app private journal:
 *
 *  - the same write again within WRITE_MEMORY_MS gets the first answer back,
 *    not a second invoice or booking;
 *  - a copy that overlaps a running one waits for it;
 *  - one left pending by a run that stopped, or whose answer was lost, is
 *    refused with a reason telling the agent to tell Michael.
 *
 * Only keys, times and statuses go to disk, never an answer's body: a write
 * repeated after a restart gets a short note instead of the first body.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomicFile';

/** How long a finished write is answered from the journal. */
export const WRITE_MEMORY_MS = 10 * 60_000;
/** How long a write the app never heard back on stays refused. */
const PENDING_MEMORY_MS = 24 * 60 * 60_000;

const MAY_HAVE_GONE = 'This change may already have been made: the connected app did not answer it before. Do not send it again; tell Michael, so the owner can check in that app.';
const NOT_RECORDED = 'The app could not record this change before sending it, so it was not sent. Try again in a moment.';

export interface WriteAnswer {
  status: number;
  headers: Record<string, string>;
  /** Null when this run did not hear the answer itself (it was made before a restart). */
  body: Buffer | null;
}

/** What one try at the provider came to. */
export type WriteOutcome =
  | { kind: 'answer'; answer: WriteAnswer }
  /** It never reached the provider, so a retry may send it. */
  | { kind: 'not-sent'; status: number; code: string; message: string }
  /** It may have reached the provider, and no answer came back. */
  | { kind: 'unknown'; status: number; code: string; message: string };

export type WriteResult =
  | { kind: 'answer'; answer: WriteAnswer; repeated: boolean }
  | { kind: 'error'; status: number; code: string; message: string };

/** Same agent, same app, same request, same body: the same write. */
export function writeKey(agentId: string, integrationId: string, method: string, url: string, body: Buffer): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHash('sha256').update(JSON.stringify([agentId, integrationId, method, url, bodyHash])).digest('hex');
}

export class WriteJournal {
  private readonly done = new Map<string, { at: number; answer: WriteAnswer }>();
  private readonly pending = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<WriteResult>>();

  constructor(private readonly path?: string, private readonly now: () => number = Date.now) {
    this.load();
  }

  async run(key: string, send: () => Promise<WriteOutcome>): Promise<WriteResult> {
    this.prune();
    const prior = this.done.get(key);
    if (prior) return { kind: 'answer', answer: prior.answer, repeated: true };
    const running = this.inFlight.get(key);
    if (running) {
      const r = await running;
      return r.kind === 'answer' ? { ...r, repeated: true } : r;
    }
    if (this.pending.has(key)) return { kind: 'error', status: 409, code: 'may_have_gone', message: MAY_HAVE_GONE };
    const attempt = this.sendOnce(key, send);
    this.inFlight.set(key, attempt);
    try { return await attempt; } finally { this.inFlight.delete(key); }
  }

  private async sendOnce(key: string, send: () => Promise<WriteOutcome>): Promise<WriteResult> {
    const at = this.now();
    // Saved before the provider sees it, so a stop before its answer never
    // leads to a second copy. If that can't be saved, nothing goes out.
    this.pending.set(key, at);
    if (!this.save()) {
      this.pending.delete(key);
      return { kind: 'error', status: 503, code: 'not_recorded', message: NOT_RECORDED };
    }
    let out: WriteOutcome;
    try { out = await send(); } catch (e) {
      out = { kind: 'unknown', status: 502, code: 'bad_gateway', message: `upstream request failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    // No answer, but it may have reached the provider: it stays pending.
    if (out.kind === 'unknown') return { kind: 'error', status: out.status, code: out.code, message: `${out.message}. ${MAY_HAVE_GONE}` };
    this.pending.delete(key);
    // Only a change the provider accepted is answered again; a refusal or a
    // busy provider may be retried.
    if (out.kind === 'answer' && out.answer.status >= 200 && out.answer.status < 300) this.done.set(key, { at, answer: out.answer });
    this.save();
    return out.kind === 'answer'
      ? { kind: 'answer', answer: out.answer, repeated: false }
      : { kind: 'error', status: out.status, code: out.code, message: out.message };
  }

  private prune(): void {
    const now = this.now();
    let pruned = false;
    for (const [k, v] of this.done) if (now - v.at > WRITE_MEMORY_MS) { this.done.delete(k); pruned = true; }
    for (const [k, at] of this.pending) if (now - at > PENDING_MEMORY_MS) { this.pending.delete(k); pruned = true; }
    if (pruned) this.save();
  }

  private load(): void {
    if (!this.path) return;
    try {
      if (!existsSync(this.path)) return;
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, { at?: unknown; status?: unknown; pending?: unknown }>;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      for (const [k, v] of Object.entries(raw)) {
        if (!v || typeof v.at !== 'number') continue;
        if (v.pending === true) this.pending.set(k, v.at);
        else if (typeof v.status === 'number') this.done.set(k, { at: v.at, answer: { status: v.status, headers: {}, body: null } });
      }
    } catch { /* best-effort: a damaged journal starts empty */ }
  }

  /** False only when the journal could not be written. */
  private save(): boolean {
    if (!this.path) return true;
    try {
      const data: Record<string, { at: number; status?: number; pending?: true }> = {};
      for (const [k, v] of this.done) data[k] = { at: v.at, status: v.answer.status };
      for (const [k, at] of this.pending) data[k] = { at, pending: true };
      writeFileAtomic(this.path, JSON.stringify(data, null, 2), 0o600);
      return true;
    } catch { return false; }
  }
}
