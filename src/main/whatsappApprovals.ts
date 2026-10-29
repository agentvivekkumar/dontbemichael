/**
 * WhatsApp Approvals Store.
 *
 * Persists WhatsApp message proposals in `whatsapp-proposals.json` in user data.
 * Governs the Ask Me proposal lifecycle:
 * - Agents file proposals when in 'approval' mode.
 * - The owner reviews, edits, and decides on Ask Me.
 * - Agents send only the approved text by referencing the proposal ID.
 */

import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  type WhatsAppProposal,
  type WhatsAppProposalDecision,
  describeWhatsAppEdits,
  fileWhatsAppProposal,
  pruneWhatsAppProposals,
  waitingWhatsAppProposals,
  whatsAppDecisionMessage
} from '../shared/whatsappProposals';

export interface WhatsAppApprovalDeps {
  path: string;
  send?: (msg: { to: string; act: 'request' | 'inform'; subject: string; body: string }) => boolean | void;
  remember?: (agentId: string, line: string) => void;
  toast?: (body: string) => void;
  agentName?: (id: string) => string;
  changed?: () => void;
  now?: () => number;
}

interface StoreFile {
  proposals: WhatsAppProposal[];
}

export class WhatsAppApprovals {
  private cache: { mtimeMs: number; size: number; store: StoreFile } | null = null;

  constructor(private deps: WhatsAppApprovalDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private empty(): StoreFile {
    return { proposals: [] };
  }

  private coerceStore(v: unknown): StoreFile | null {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const raw = v as Record<string, unknown>;
    const proposals = Array.isArray(raw.proposals)
      ? (raw.proposals as unknown[]).filter((x): x is WhatsAppProposal => {
          if (!x || typeof x !== 'object') return false;
          const p = x as Record<string, unknown>;
          return typeof p.id === 'string' && typeof p.agentId === 'string' && typeof p.accountId === 'string';
        })
      : [];
    return { proposals };
  }

  private load(): StoreFile {
    try {
      const st = statSync(this.deps.path);
      if (this.cache && this.cache.mtimeMs === st.mtimeMs && this.cache.size === st.size) {
        return this.cache.store;
      }
      const raw = readFileSync(this.deps.path, 'utf8');
      const parsed = JSON.parse(raw);
      const coerced = this.coerceStore(parsed) ?? this.empty();
      this.cache = { mtimeMs: st.mtimeMs, size: st.size, store: coerced };
      return coerced;
    } catch {
      return this.empty();
    }
  }

  private save(patch: Partial<StoreFile>): void {
    const cur = this.load();
    const next: StoreFile = {
      proposals: patch.proposals ?? cur.proposals
    };
    const tmp = `${this.deps.path}.tmp-${Date.now()}-${randomBytes(4).toString('hex')}`;
    try {
      writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
      renameSync(tmp, this.deps.path);
      const st = statSync(this.deps.path);
      this.cache = { mtimeMs: st.mtimeMs, size: st.size, store: next };
      this.deps.changed?.();
    } catch (e) {
      console.error('[whatsapp-approvals] save error:', e);
    }
  }

  read(): WhatsAppProposal[] {
    return pruneWhatsAppProposals(this.load().proposals, this.now());
  }

  waiting(): WhatsAppProposal[] {
    return waitingWhatsAppProposals(this.read());
  }

  get(id: string): WhatsAppProposal | undefined {
    return this.read().find((p) => p.id === id);
  }

  file(p: Omit<WhatsAppProposal, 'id' | 'createdAt' | 'state'>): WhatsAppProposal {
    const list = this.read();
    const draft: WhatsAppProposal = {
      ...p,
      id: `wp_${this.now().toString(36)}_${randomBytes(3).toString('hex')}`,
      createdAt: this.now(),
      state: 'waiting'
    };
    const next = fileWhatsAppProposal(list, draft);
    const replaced = list.find((x) => x.state === 'waiting' && !next.some((y) => y.id === x.id));
    const proposal: WhatsAppProposal = replaced ? { ...draft, replaces: replaced.id } : draft;
    this.save({ proposals: next.map((x) => (x.id === draft.id ? proposal : x)) });

    const agentLabel = this.deps.agentName?.(p.agentId) ?? p.agentId;
    this.deps.toast?.(`${agentLabel} has a WhatsApp message for you to approve in ASK ME.`);
    return proposal;
  }

  markSending(id: string): void {
    const list = this.read();
    this.save({
      proposals: list.map((p) => (p.id === id && p.state === 'approved' ? { ...p, state: 'sending' as const } : p))
    });
    if (this.get(id)?.state !== 'sending') {
      throw new Error('Could not mark WhatsApp proposal sending');
    }
  }

  unmarkSending(id: string): void {
    const list = this.read();
    this.save({
      proposals: list.map((p) => (p.id === id && p.state === 'sending' ? { ...p, state: 'approved' as const } : p))
    });
  }

  markSent(id: string, messageId: string): void {
    const list = this.read();
    this.save({
      proposals: list.map((p) => (p.id === id ? { ...p, state: 'sent' as const, sentAt: this.now(), messageId } : p))
    });
  }

  decide(
    id: string,
    decision: WhatsAppProposalDecision,
    edit?: { to?: unknown; text?: unknown },
    rawNote?: unknown
  ): { ok: true } | { ok: false; error: string } {
    const list = this.read();
    const p = list.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'not found' };
    if (p.state !== 'waiting') return { ok: false, error: 'already decided' };

    const note = typeof rawNote === 'string' ? rawNote.trim().slice(0, 2000) : '';
    if (decision === 'changes' && !note) return { ok: false, error: 'note needed' };

    const to = typeof edit?.to === 'string' && edit.to.trim() ? edit.to.trim() : p.to;
    const text = typeof edit?.text === 'string' && edit.text.trim() ? edit.text.trim() : p.text;
    const edits = decision === 'approve' ? describeWhatsAppEdits({ to: p.to, text: p.text }, { to, text }) : '';

    const next: WhatsAppProposal = {
      ...p,
      state: decision === 'approve' ? 'approved' : decision === 'changes' ? 'changes' : 'declined',
      decidedAt: this.now(),
      ...(decision === 'approve' ? { approved: { to, text } } : {}),
      ...(note ? { note } : {})
    };

    this.save({ proposals: list.map((x) => (x.id === id ? next : x)) });

    const msg = whatsAppDecisionMessage(p, decision, edits, note);
    try {
      this.deps.send?.({ to: p.agentId, ...msg });
    } catch (e) {
      console.error('[whatsapp-approvals] message error:', e);
    }

    if (edits) {
      try {
        this.deps.remember?.(p.agentId, `- From owner: WhatsApp message to ${p.to} edited:\n${edits}\n`);
      } catch {
        /* best-effort */
      }
    }

    return { ok: true };
  }

  cancel(match: { id: string } | { agentId: string; accountId: string }, reason: string): number {
    const list = this.read();
    const gone = list.filter((p) =>
      (p.state === 'waiting' || p.state === 'approved' || p.state === 'sending') &&
      ('id' in match ? p.id === match.id : p.agentId === match.agentId && p.accountId === match.accountId)
    );
    if (!gone.length) return 0;

    const ids = new Set(gone.map((p) => p.id));
    this.save({
      proposals: list.map((p) =>
        ids.has(p.id) ? { ...p, state: 'cancelled' as const, decidedAt: this.now(), cancelReason: reason } : p
      )
    });

    const agentId = gone[0].agentId;
    try {
      this.deps.send?.({
        to: agentId,
        act: 'inform',
        subject: gone.length === 1 ? 'WhatsApp message withdrawn' : `${gone.length} WhatsApp messages withdrawn`,
        body: `Not sent, and not to be sent another way: ${reason}`
      });
    } catch (e) {
      console.error('[whatsapp-approvals] cancel error:', e);
    }

    return gone.length;
  }
}
