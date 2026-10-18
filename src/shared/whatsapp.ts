/**
 * WhatsApp Business Cloud API integration and agent Capabilities.
 *
 * Shared by main process (broker, hook gate, WhatsApp client) and the renderer
 * (Settings > WhatsApp, agent Access tab). Dependency-free: no electron/node imports.
 *
 * Modeled after the "mailbox for every job" design:
 * - A WhatsApp Business phone number is connected in Settings, authenticated with
 *   a Cloud API access token held in the secret store (safeStorage).
 * - Exactly one agent can watch and send from a WhatsApp number at a time.
 * - Access mode can be 'send' (Can send), 'approval' (Send on approval), or 'draft' (Draft only).
 * - `whatsAppAccess` is the single enforcement rule checked by both the PreToolUse hook
 *   and the integration broker for md-whatsapp tools.
 */

import { type SendingMode, asSendingMode, sendingWords } from './mailboxes';

export interface WhatsAppAccountRecord {
  /** Stable slug; also the secret handle `whatsapp:<id>`. */
  id: string;
  /** Meta WhatsApp Business Phone Number ID. */
  phoneNumberId: string;
  /** WhatsApp Business Account ID (WABA ID), optional. */
  wabaId?: string;
  /** Formatted display number, e.g. "+1 (555) 234-5678". */
  displayPhoneNumber: string;
  /** Label/alias, e.g. "Customer Support Line" or "Sales WhatsApp". */
  label: string;
  /** Set by the broker/client: connected, or needs the owner. */
  status: 'connected' | 'needs-attention';
  /** Plain words for the owner when status is needs-attention. */
  statusReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WhatsAppCapability {
  /** "Can check WhatsApp". */
  enabled: boolean;
  /** The WhatsApp account id (added in Settings) this agent may use: at most one. */
  accounts: string[];
  /** true = Can send; false = Draft only or Send on approval. */
  send: boolean;
  /** Can send, Send on approval or Draft only. */
  sending?: SendingMode;
}

/** Extract sending mode for WhatsApp capability, defaulting to 'draft'. */
export function whatsAppSendingMode(wa: Pick<WhatsAppCapability, 'send' | 'sending'> | undefined): SendingMode {
  const m = wa?.sending;
  if (m === 'send' || m === 'approval' || m === 'draft') return m;
  return wa?.send === true ? 'send' : 'draft';
}

export type WhatsAppOp = 'list' | 'search' | 'read' | 'draft' | 'propose' | 'send' | 'mark_read';

/**
 * Each md-whatsapp tool and the access op it maps to.
 * Prototype-free dictionary so '__proto__' and 'constructor' cannot match.
 */
export const WHATSAPP_TOOL_OPS: Record<string, WhatsAppOp> = Object.assign(Object.create(null) as Record<string, WhatsAppOp>, {
  list_whatsapp_accounts: 'list',
  search_whatsapp_chats: 'search',
  read_whatsapp_chat: 'read',
  draft_whatsapp_message: 'draft',
  propose_whatsapp_message: 'propose',
  send_whatsapp_message: 'send',
  mark_whatsapp_read: 'mark_read'
});

export interface WhatsAppAccessConfig {
  whatsappAccounts?: WhatsAppAccountRecord[];
  agentCapabilities?: {
    [agentId: string]: {
      whatsapp?: WhatsAppCapability;
    };
  };
}

export type WhatsAppAccessResult = { ok: true } | { ok: false; reason: string };

/**
 * The single access rule for WhatsApp tools.
 * Enforces:
 * 1. Agent has WhatsApp capability enabled.
 * 2. The account is assigned to this agent and exists in Settings.
 * 3. Propose is only allowed in 'approval' mode.
 * 4. Send is allowed in 'send' mode, or in 'approval' mode only when an approved proposal ID is provided.
 * 5. Draft only refuses sending or proposing.
 */
export function whatsAppAccess(
  cfg: WhatsAppAccessConfig,
  agentId: string,
  accountId: string | undefined,
  op: WhatsAppOp,
  proposalId?: string
): WhatsAppAccessResult {
  const wa = cfg.agentCapabilities?.[agentId]?.whatsapp;
  if (!wa?.enabled) {
    return { ok: false, reason: 'The owner has not given you WhatsApp in your Capabilities. Do not try another way; tell Michael what you need.' };
  }
  if (op === 'list') return { ok: true };

  // Exactly one WhatsApp account per agent: only the first listed counts.
  if (!accountId || wa.accounts[0] !== accountId) {
    return { ok: false, reason: `The owner has not given you the WhatsApp account "${accountId ?? ''}". Use list_whatsapp_accounts to see yours.` };
  }

  const account = (cfg.whatsappAccounts ?? []).find((a) => a.id === accountId);
  if (!account) {
    return { ok: false, reason: `The WhatsApp account "${accountId}" was removed in Settings.` };
  }

  const mode = whatsAppSendingMode(wa);
  if ((op === 'send' || op === 'propose') && mode === 'draft') {
    return { ok: false, reason: 'You are Draft only, the owner\'s choice on your Access tab (WhatsApp, Sending); you can prepare replies, but the owner must send them.' };
  }
  if (op === 'propose' && mode === 'send') {
    return { ok: false, reason: 'You can send without approval, the owner\'s choice on your Access tab (WhatsApp, Sending). Send the message directly with send_whatsapp_message; nothing goes on Ask me.' };
  }
  if (op === 'send' && mode === 'approval' && !proposalId) {
    return { ok: false, reason: 'You send on approval, the owner\'s choice on your Access tab (WhatsApp, Sending). Use propose_whatsapp_message to put the message on Ask me; once the owner approves it, send it with its proposal id.' };
  }

  return { ok: true };
}

/**
 * Return which agent holds a WhatsApp account, excluding `except`.
 * Enforces one agent per number so two agents never answer the same line.
 */
export function whatsAppHolder(
  caps: { [agentId: string]: { whatsapp?: WhatsAppCapability } } | undefined,
  accountId: string,
  except?: string
): string | undefined {
  for (const [id, c] of Object.entries(caps ?? {})) {
    if (id !== except && c?.whatsapp?.enabled && c.whatsapp.accounts[0] === accountId) {
      return id;
    }
  }
  return undefined;
}

/** The WhatsApp account an agent may use, as a list of at most one. */
export function agentWhatsAppAccounts(cfg: WhatsAppAccessConfig, agentId: string): string[] {
  const wa = cfg.agentCapabilities?.[agentId]?.whatsapp;
  if (!wa?.enabled) return [];
  const known = new Set((cfg.whatsappAccounts ?? []).map((a) => a.id));
  return wa.accounts.slice(0, 1).filter((id) => known.has(id));
}

/** True when the agent is provisioned with md-whatsapp tools. */
export function hasWhatsAppTools(caps: { whatsapp?: WhatsAppCapability } | undefined): boolean {
  return !!caps?.whatsapp?.enabled;
}

/** True when WhatsApp tools were newly attached and require agent restart. */
export function whatsAppToolsJustAttached(
  before: { whatsapp?: WhatsAppCapability } | undefined,
  after: { whatsapp?: WhatsAppCapability } | undefined
): boolean {
  return !hasWhatsAppTools(before) && hasWhatsAppTools(after);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/** Generate a stable slug from a phone number or label. */
export function whatsAppIdFor(identifier: string, taken: string[] = []): string {
  const base = identifier
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 35) || 'wa';
  let id = SLUG_RE.test(base) ? `wa-${base}` : `wa-line-${base}`.slice(0, 38).replace(/-+$/, '');
  let n = 2;
  while (taken.includes(id)) id = `${base.slice(0, 30)}-${n++}`;
  return id;
}

export function secretRefForWhatsApp(id: string): string {
  return `whatsapp:${id}`;
}
