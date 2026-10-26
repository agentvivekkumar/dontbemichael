/**
 * WhatsApp Business Cloud API Service (Phase 1).
 *
 * Main process only. Handles Meta Graph API requests for connected WhatsApp Business numbers:
 * - Credentials testing (token validation, phone number verification).
 * - Sending messages via Cloud API (POST /{phone_number_id}/messages).
 * - Storing and searching local conversation messages.
 * - Enforcing WhatsApp access rules and sending modes.
 *
 * Dependency injection for fetch allows full offline unit testing.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type WhatsAppAccountRecord,
  type WhatsAppAccessConfig,
  type WhatsAppOp,
  WHATSAPP_TOOL_OPS,
  whatsAppAccess,
  secretRefForWhatsApp,
  agentWhatsAppAccounts,
  whatsAppSendingMode,
  whatsAppIdFor,
  whatsAppHolder,
  whatsAppToolsJustAttached
} from '../shared/whatsapp';
import { type SendingMode, sendingWords } from '../shared/mailboxes';
import type { WhatsAppApprovals } from './whatsappApprovals';
import type { WhatsAppDrafts } from './whatsappDrafts';
import { whatsAppProposalSendProblem } from '../shared/whatsappProposals';

export type WhatsAppErrorKind = 'auth' | 'rate-limit' | 'network' | 'not-found' | 'bad-request' | 'refused' | 'unknown';

export class WhatsAppError extends Error {
  constructor(readonly kind: WhatsAppErrorKind, message: string) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

export interface WhatsAppMessage {
  id: string;
  accountId: string;
  from: string;
  to: string;
  text: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  untrusted?: boolean;
}

export interface WhatsAppDeps {
  getSecret: (secretRef: string) => string | undefined;
  updateStatus?: (id: string, status: 'connected' | 'needs-attention', reason?: string) => Promise<void> | void;
  getConfig: () => WhatsAppAccessConfig;
  fetchFn?: typeof fetch;
  approvals?: WhatsAppApprovals;
  drafts?: WhatsAppDrafts;
  messagesPath?: string;
}

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';

/**
 * Validate WhatsApp Cloud API credentials against Meta Graph API.
 * Calls GET /{phone_number_id} to ensure token is valid and has whatsapp_business_messaging.
 */
export async function testWhatsAppAccount(
  phoneNumberId: string,
  token: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<{ ok: true; displayPhoneNumber: string; verifiedName?: string } | { ok: false; error: string; kind: WhatsAppErrorKind }> {
  const cleanId = phoneNumberId.trim();
  const cleanToken = token.trim();

  if (!cleanId) {
    return { ok: false, error: 'Phone Number ID is required.', kind: 'bad-request' };
  }
  if (!cleanToken) {
    return { ok: false, error: 'Access token is required.', kind: 'bad-request' };
  }

  const url = `${GRAPH_API_BASE}/${encodeURIComponent(cleanId)}?fields=id,display_phone_number,verified_name,quality_rating`;

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/json'
      }
    });

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      const err = (data.error as Record<string, unknown>) ?? {};
      const msg = typeof err.message === 'string' ? err.message : `Meta API responded with HTTP ${res.status}`;
      const code = typeof err.code === 'number' ? err.code : res.status;

      if (code === 190 || res.status === 401) {
        return { ok: false, error: 'The access token is invalid or expired. Check your Meta developer token or System User token.', kind: 'auth' };
      }
      if (res.status === 404 || code === 100) {
        return { ok: false, error: `Phone Number ID "${cleanId}" was not found on Meta. Verify the Phone Number ID in your WhatsApp Cloud API dashboard.`, kind: 'not-found' };
      }
      return { ok: false, error: msg, kind: 'unknown' };
    }

    const display = typeof data.display_phone_number === 'string' && data.display_phone_number
      ? data.display_phone_number
      : cleanId;
    const verified = typeof data.verified_name === 'string' ? data.verified_name : undefined;

    return { ok: true, displayPhoneNumber: display, verifiedName: verified };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Network error connecting to Meta Graph API: ${message}`, kind: 'network' };
  }
}

export class WhatsAppService {
  private readonly deps: WhatsAppDeps;
  private readonly fetch: typeof fetch;
  /** In-memory message store for local simulation & testing. Can be backed by SQLite. */
  private readonly messages: WhatsAppMessage[] = [];

  constructor(deps: WhatsAppDeps) {
    this.deps = deps;
    this.fetch = deps.fetchFn ?? globalThis.fetch;
    this.loadMessages();
  }

  private loadMessages(): void {
    if (!this.deps.messagesPath) return;
    try {
      if (existsSync(this.deps.messagesPath)) {
        const raw = readFileSync(this.deps.messagesPath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.messages.length = 0;
          this.messages.push(...data);
        }
      }
    } catch (e) {
      console.error('[whatsapp] failed to load messages from disk:', e);
    }
  }

  private saveMessages(): void {
    if (!this.deps.messagesPath) return;
    try {
      const dir = dirname(this.deps.messagesPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const capped = this.messages.slice(-1000);
      writeFileSync(this.deps.messagesPath, JSON.stringify(capped, null, 2), 'utf8');
    } catch (e) {
      console.error('[whatsapp] failed to save messages to disk:', e);
    }
  }

  /** Record an inbound or outbound message in the local store. */
  recordMessage(msg: WhatsAppMessage): void {
    this.messages.push(msg);
    if (this.messages.length > 1000) {
      this.messages.shift();
    }
    this.saveMessages();
  }

  /** Handle an incoming tool request from the broker or agent. */
  async handleWhatsAppRequest(
    agentId: string,
    op: string,
    body: Record<string, unknown>
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const cfg = this.deps.getConfig();
    const accountId = typeof body.accountId === 'string' ? body.accountId : undefined;
    const proposalId = typeof body.proposalId === 'string' ? body.proposalId : undefined;

    const cleanOp = WHATSAPP_TOOL_OPS[op] ?? (op as WhatsAppOp);
    const access = whatsAppAccess(cfg, agentId, accountId, cleanOp, proposalId);
    if (!access.ok) {
      return { status: 403, body: { ok: false, error: access.reason } };
    }

    // 2. Dispatch operations
    switch (op) {
      case 'list_whatsapp_accounts': {
        const wa = cfg.agentCapabilities?.[agentId]?.whatsapp;
        const assignedIds = agentWhatsAppAccounts(cfg, agentId);
        const accounts = (cfg.whatsappAccounts ?? [])
          .filter((a) => assignedIds.includes(a.id))
          .map((a) => ({
            id: a.id,
            displayPhoneNumber: a.displayPhoneNumber,
            label: a.label,
            sending: whatsAppSendingMode(wa),
            status: a.status
          }));
        return { status: 200, body: { ok: true, accounts } };
      }

      case 'search_whatsapp_chats': {
        const query = typeof body.query === 'string' ? body.query.toLowerCase() : '';
        const chats = this.messages
          .filter((m) => m.accountId === accountId)
          .filter((m) => !query || m.text.toLowerCase().includes(query) || m.from.includes(query) || m.to.includes(query))
          .slice(-50)
          .reverse()
          .map((m) => (m.direction === 'inbound' ? { ...m, untrusted: true } : m));
        return { status: 200, body: { ok: true, messages: chats } };
      }

      case 'read_whatsapp_chat': {
        const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
        if (!contact) {
          return { status: 400, body: { ok: false, error: 'Parameter "contact" (phone number) is required.' } };
        }
        const cleanContact = contact.replace(/[^0-9]/g, '');
        const thread = this.messages
          .filter((m) => {
            if (m.accountId !== accountId) return false;
            const fromClean = m.from.replace(/[^0-9]/g, '');
            const toClean = m.to.replace(/[^0-9]/g, '');
            return fromClean === cleanContact || toClean === cleanContact || m.from === contact || m.to === contact;
          })
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((m) => {
            if (m.direction === 'inbound') {
              return {
                ...m,
                untrusted: true,
                text: `<untrusted-customer-message from="${m.from}">\n${m.text}\n</untrusted-customer-message>`
              };
            }
            return m;
          });
        return { status: 200, body: { ok: true, contact, messages: thread } };
      }

      case 'draft_whatsapp_message': {
        const to = typeof body.to === 'string' ? body.to.trim() : '';
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!to || !text) {
          return { status: 400, body: { ok: false, error: 'Both "to" and "text" are required.' } };
        }
        if (!accountId) {
          return { status: 400, body: { ok: false, error: 'accountId is required.' } };
        }
        const draft = this.deps.drafts
          ? this.deps.drafts.saveDraft({ agentId, accountId, to, text })
          : { id: `draft-${Date.now()}` };
        return { status: 200, body: { ok: true, draftId: draft.id, to, text, status: 'drafted' } };
      }

      case 'propose_whatsapp_message': {
        const to = typeof body.to === 'string' ? body.to.trim() : '';
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!to || !text) {
          return { status: 400, body: { ok: false, error: 'Both "to" and "text" are required.' } };
        }
        if (!accountId) {
          return { status: 400, body: { ok: false, error: 'accountId is required.' } };
        }
        const proposal = this.deps.approvals
          ? this.deps.approvals.file({ agentId, accountId, to, text })
          : { id: `wa-prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        return {
          status: 200,
          body: {
            ok: true,
            proposalId: proposal.id,
            state: 'waiting for the owner on Ask me',
            next: 'Nothing is sent yet. You will get a message when the owner decides: approved (then call send_whatsapp_message with this proposalId), changes asked, or not sent. Do not send it another way.'
          }
        };
      }

      case 'send_whatsapp_message': {
        const to = typeof body.to === 'string' ? body.to.trim() : '';
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const wa = cfg.agentCapabilities?.[agentId]?.whatsapp;
        const mode = wa ? whatsAppSendingMode(wa) : 'approval';

        let targetTo = to;
        let targetText = text;

        if (mode === 'approval') {
          if (!proposalId) {
            return {
              status: 403,
              body: { ok: false, error: 'You send on approval. Propose each message first, then send with its proposalId.' }
            };
          }
          if (this.deps.approvals) {
            const prop = this.deps.approvals.get(proposalId);
            const problem = whatsAppProposalSendProblem(prop, agentId, accountId ?? '');
            if (problem) {
              return { status: 409, body: { ok: false, error: problem } };
            }
            if (prop?.state === 'sent') {
              return { status: 200, body: { ok: true, messageId: prop.messageId ?? `wa-${Date.now()}`, repeated: true, status: 'sent' } };
            }
            // Strict enforcement: dispatch ONLY the owner-approved recipient and text!
            targetTo = prop?.approved?.to ?? prop?.to ?? to;
            targetText = prop?.approved?.text ?? prop?.text ?? text;
          }
        } else {
          if (!to || !text) {
            return { status: 400, body: { ok: false, error: 'Both "to" and "text" are required.' } };
          }
        }

        const account = (cfg.whatsappAccounts ?? []).find((a) => a.id === accountId);
        if (!account) {
          return { status: 404, body: { ok: false, error: 'WhatsApp account not found.' } };
        }

        const token = this.deps.getSecret(secretRefForWhatsApp(account.id));
        if (!token) {
          await this.deps.updateStatus?.(account.id, 'needs-attention', 'Access token is missing from the secret store.');
          return { status: 503, body: { ok: false, error: 'No access token found for this WhatsApp account.' } };
        }

        if (mode === 'approval' && this.deps.approvals && proposalId) {
          try {
            this.deps.approvals.markSending(proposalId);
          } catch {
            return { status: 409, body: { ok: false, error: 'This message cannot be sent right now.' } };
          }
        }

        const res = await this.sendViaCloudApi(account.phoneNumberId, token, targetTo, targetText);
        if (!res.ok) {
          if (mode === 'approval' && this.deps.approvals && proposalId) {
            this.deps.approvals.unmarkSending(proposalId);
          }
          if (res.kind === 'auth') {
            await this.deps.updateStatus?.(account.id, 'needs-attention', res.error);
          }
          const status = res.kind === 'refused' ? 422 : 502;
          return { status, body: { ok: false, error: res.error, kind: res.kind } };
        }

        if (mode === 'approval' && this.deps.approvals && proposalId) {
          this.deps.approvals.markSent(proposalId, res.messageId);
        }

        this.recordMessage({
          id: res.messageId,
          accountId: account.id,
          from: account.displayPhoneNumber,
          to: targetTo,
          text: targetText,
          timestamp: Date.now(),
          direction: 'outbound',
          status: 'sent'
        });

        return { status: 200, body: { ok: true, messageId: res.messageId, status: 'sent' } };
      }

      default:
        return { status: 404, body: { ok: false, error: `Unknown WhatsApp tool operation "${op}".` } };
    }
  }

  /** Direct send to Meta Cloud API. */
  private async sendViaCloudApi(
    phoneNumberId: string,
    token: string,
    to: string,
    text: string
  ): Promise<{ ok: true; messageId: string } | { ok: false; error: string; kind: WhatsAppErrorKind }> {
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}/messages`;
    const cleanTo = to.replace(/[^0-9]/g, '');

    try {
      const res = await this.fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'text',
          text: { preview_url: false, body: text }
        })
      });

      const data = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        const err = (data.error as Record<string, unknown>) ?? {};
        const msg = typeof err.message === 'string' ? err.message : `HTTP ${res.status}`;
        const code = typeof err.code === 'number' ? err.code : res.status;
        if (code === 190 || res.status === 401) {
          return { ok: false, error: 'WhatsApp token expired or invalid.', kind: 'auth' };
        }
        if (code === 131047 || /24\s*hours|customer\s*service\s*window|re-engagement/i.test(msg)) {
          return {
            ok: false,
            error: "Outside Meta's 24-hour customer service window, free-text messages cannot be sent. The customer has not sent a message in the last 24 hours; Meta requires an approved template message to initiate a conversation.",
            kind: 'refused'
          };
        }
        return { ok: false, error: `Meta Cloud API send error: ${msg}`, kind: 'unknown' };
      }

      const messages = (data.messages as Array<Record<string, unknown>>) ?? [];
      const msgId = typeof messages[0]?.id === 'string' ? messages[0].id : `wa-${Date.now()}`;
      return { ok: true, messageId: msgId };
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `Network failure sending WhatsApp message: ${err}`, kind: 'network' };
    }
  }
}

export interface WhatsAppAdminDeps {
  getConfig: () => WhatsAppAccessConfig & { whatsappAccounts?: WhatsAppAccountRecord[] };
  saveConfig: (patch: { whatsappAccounts?: WhatsAppAccountRecord[]; agentCapabilities?: WhatsAppAccessConfig['agentCapabilities'] }) => void;
  setSecret: (ref: string, val: string) => { ok: boolean; error?: string };
  deleteSecret: (ref: string) => boolean;
  canStoreSecrets?: () => boolean;
}

export interface AddWhatsAppInput {
  id?: string;
  phoneNumberId: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  label: string;
  token: string;
}

export async function saveWhatsAppAccount(
  admin: WhatsAppAdminDeps,
  input: AddWhatsAppInput,
  fetchFn?: typeof fetch
): Promise<{ ok: true; record: WhatsAppAccountRecord } | { ok: false; kind: WhatsAppErrorKind | 'invalid'; reason: string }> {
  const phoneNumberId = (input.phoneNumberId ?? '').trim();
  const label = (input.label ?? '').trim();
  const token = (input.token ?? '').trim();

  if (!phoneNumberId) return { ok: false, kind: 'invalid', reason: 'Phone Number ID is required.' };
  if (!label) return { ok: false, kind: 'invalid', reason: 'Enter a label for this WhatsApp number (e.g. Support WhatsApp).' };
  if (!token) return { ok: false, kind: 'invalid', reason: 'Enter your Meta WhatsApp Cloud API access token.' };

  if (admin.canStoreSecrets && !admin.canStoreSecrets()) {
    return { ok: false, kind: 'refused', reason: 'Your operating system cannot encrypt stored secrets.' };
  }

  // Test token against Graph API
  const tested = await testWhatsAppAccount(phoneNumberId, token, fetchFn);
  if (!tested.ok) return { ok: false, kind: tested.kind, reason: tested.error };

  const cfg = admin.getConfig();
  const existing = cfg.whatsappAccounts ?? [];
  const fixing = input.id ? existing.find((a) => a.id === input.id) : undefined;

  // Don't duplicate Phone Number IDs
  if (existing.some((a) => a.phoneNumberId === phoneNumberId && a.id !== fixing?.id)) {
    return { ok: false, kind: 'invalid', reason: `Phone Number ID "${phoneNumberId}" is already connected.` };
  }

  const id = fixing ? fixing.id : whatsAppIdFor(label || phoneNumberId, existing.map((a) => a.id));
  const stored = admin.setSecret(secretRefForWhatsApp(id), token);
  if (!stored.ok) {
    return { ok: false, kind: 'unknown', reason: `Failed to save secret: ${stored.error || 'encryption error'}` };
  }

  const now = Date.now();
  const displayPhoneNumber = input.displayPhoneNumber?.trim() || tested.displayPhoneNumber || phoneNumberId;
  const record: WhatsAppAccountRecord = {
    id,
    phoneNumberId,
    wabaId: input.wabaId?.trim() || undefined,
    displayPhoneNumber,
    label,
    status: 'connected',
    createdAt: fixing?.createdAt ?? now,
    updatedAt: now
  };

  admin.saveConfig({
    whatsappAccounts: fixing ? existing.map((a) => (a.id === id ? record : a)) : [...existing, record]
  });

  return { ok: true, record };
}

export function removeWhatsAppAccount(admin: WhatsAppAdminDeps, id: string): { ok: boolean; affected: string[] } {
  const cfg = admin.getConfig();
  const affected: string[] = [];
  const caps = { ...(cfg.agentCapabilities ?? {}) };

  for (const [agentId, c] of Object.entries(caps)) {
    if (c?.whatsapp?.accounts?.includes(id)) {
      if (c.whatsapp.accounts[0] === id && !affected.includes(agentId)) affected.push(agentId);
      caps[agentId] = {
        ...caps[agentId],
        whatsapp: {
          ...c.whatsapp,
          enabled: false,
          accounts: c.whatsapp.accounts.filter((a) => a !== id)
        }
      };
    }
  }

  admin.saveConfig({
    whatsappAccounts: (cfg.whatsappAccounts ?? []).filter((a) => a.id !== id),
    agentCapabilities: caps
  });
  admin.deleteSecret(secretRefForWhatsApp(id));
  return { ok: true, affected };
}

export function setAgentWhatsAppCapabilities(
  admin: WhatsAppAdminDeps,
  agentId: string,
  next: { whatsapp?: { enabled: boolean; accounts: string[]; send: boolean; sending?: SendingMode }; move?: boolean }
): { ok: boolean; restartNeeded: boolean; heldBy?: string; movedFrom?: string } {
  const cfg = admin.getConfig();
  const known = new Set((cfg.whatsappAccounts ?? []).map((a) => a.id));
  const before = cfg.agentCapabilities?.[agentId];

  const picked = Array.isArray(next.whatsapp?.accounts)
    ? next.whatsapp.accounts.filter((a): a is string => typeof a === 'string')
    : [];
  const sending = next.whatsapp ? whatsAppSendingMode(next.whatsapp) : 'draft';
  const whatsapp = next.whatsapp
    ? {
        enabled: next.whatsapp.enabled === true,
        accounts: picked.filter((a) => known.has(a)).slice(0, 1),
        send: sending === 'send',
        sending
      }
    : undefined;

  // Single agent check: Is the account held by another agent?
  const accountId = whatsapp?.accounts[0];
  if (whatsapp?.enabled && accountId) {
    const holder = whatsAppHolder(cfg.agentCapabilities, accountId, agentId);
    if (holder && !next.move) {
      return { ok: false, restartNeeded: false, heldBy: holder };
    }
  }

  const caps = { ...(cfg.agentCapabilities ?? {}) };
  let movedFrom: string | undefined;

  if (next.move && whatsapp?.enabled && accountId) {
    const holder = whatsAppHolder(cfg.agentCapabilities, accountId, agentId);
    if (holder) {
      movedFrom = holder;
      const hWa = caps[holder]?.whatsapp;
      if (hWa) {
        caps[holder] = {
          ...caps[holder],
          whatsapp: { ...hWa, enabled: false, accounts: hWa.accounts.filter((a) => a !== accountId) }
        };
      }
    }
  }

  const after = { ...(caps[agentId] ?? {}), whatsapp };
  caps[agentId] = after;
  admin.saveConfig({ agentCapabilities: caps });

  const restartNeeded = whatsAppToolsJustAttached(before, after);
  return { ok: true, restartNeeded, movedFrom };
}
