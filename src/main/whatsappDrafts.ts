/**
 * WhatsApp Drafts Store.
 *
 * Persists WhatsApp drafts in `whatsapp-drafts.json` in user data.
 */

import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { WhatsAppDraft } from '../shared/whatsappDrafts';

export interface WhatsAppDraftsDeps {
  path: string;
  changed?: () => void;
  now?: () => number;
}

interface StoreFile {
  drafts: WhatsAppDraft[];
}

export class WhatsAppDrafts {
  private cache: { mtimeMs: number; size: number; store: StoreFile } | null = null;

  constructor(private deps: WhatsAppDraftsDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private empty(): StoreFile {
    return { drafts: [] };
  }

  private coerceStore(v: unknown): StoreFile | null {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const raw = v as Record<string, unknown>;
    const drafts = Array.isArray(raw.drafts)
      ? (raw.drafts as unknown[]).filter((x): x is WhatsAppDraft => {
          if (!x || typeof x !== 'object') return false;
          const d = x as Record<string, unknown>;
          return typeof d.id === 'string' && typeof d.agentId === 'string' && typeof d.accountId === 'string';
        })
      : [];
    return { drafts };
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
      drafts: patch.drafts ?? cur.drafts
    };
    const tmp = `${this.deps.path}.tmp-${Date.now()}-${randomBytes(4).toString('hex')}`;
    try {
      writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
      renameSync(tmp, this.deps.path);
      const st = statSync(this.deps.path);
      this.cache = { mtimeMs: st.mtimeMs, size: st.size, store: next };
      this.deps.changed?.();
    } catch (e) {
      console.error('[whatsapp-drafts] save error:', e);
    }
  }

  list(filter?: { accountId?: string; agentId?: string }): WhatsAppDraft[] {
    let all = this.load().drafts;
    if (filter?.accountId) {
      all = all.filter((d) => d.accountId === filter.accountId);
    }
    if (filter?.agentId) {
      all = all.filter((d) => d.agentId === filter.agentId);
    }
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): WhatsAppDraft | undefined {
    return this.load().drafts.find((d) => d.id === id);
  }

  saveDraft(input: Omit<WhatsAppDraft, 'id' | 'createdAt'>): WhatsAppDraft {
    const cur = this.load().drafts;
    const draft: WhatsAppDraft = {
      ...input,
      id: `wd_${this.now().toString(36)}_${randomBytes(3).toString('hex')}`,
      createdAt: this.now()
    };
    this.save({ drafts: [draft, ...cur] });
    return draft;
  }

  /** Drop every draft on a line, when the line is removed. */
  dropFor(accountId: string): number {
    const cur = this.load().drafts;
    const next = cur.filter((d) => d.accountId !== accountId);
    if (next.length !== cur.length) this.save({ drafts: next });
    return cur.length - next.length;
  }

  deleteDraft(id: string): boolean {
    const cur = this.load().drafts;
    const next = cur.filter((d) => d.id !== id);
    if (next.length === cur.length) return false;
    this.save({ drafts: next });
    return true;
  }
}
