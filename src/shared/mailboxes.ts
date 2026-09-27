/**
 * Mailboxes and agent Capabilities (docs/designs/multi-mailbox.md).
 *
 * Shared by main (broker, hook gate, mail client) and the renderer (Settings >
 * Mailboxes, the Capabilities tab). No electron / node imports.
 *
 * A mailbox is connected once, in Settings, with an address and an app password
 * held only by the broker's secret store. Each agent's Capabilities say which
 * one mailbox it may use (at most one, owner 2026-09-26) and whether it may send
 * or only draft. `mailAccess` is the one rule both enforcement points call: the
 * broker and the PreToolUse hook for md-mail tools.
 */

export type MailProvider = 'gmail' | 'google-workspace' | 'icloud' | 'yahoo' | 'zoho' | 'other';

export interface MailServer {
  host: string;
  port: number;
  /** true = TLS from the first byte (993 / 465); false = STARTTLS (587). */
  secure: boolean;
}

export interface MailboxRecord {
  /** Stable slug; also the secret handle `mail:<id>`. */
  id: string;
  address: string;
  provider: MailProvider;
  imap: MailServer;
  smtp: MailServer;
  /** Set by the broker: connected, or needs the owner (MB-7). */
  status: 'connected' | 'needs-attention';
  /** Plain words for the owner when status is needs-attention. */
  statusReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmailCapability {
  /** "Can check email". */
  enabled: boolean;
  /** The mailbox id (added in Settings) this agent may use: at most one
   *  (owner, 2026-09-26). Kept a list so older records still read. */
  mailboxes: string[];
  /** true = Can send; false = Draft only. */
  send: boolean;
}

export interface AgentCapabilities {
  email?: EmailCapability;
}

export type MailOp = 'list' | 'read' | 'draft' | 'send';

/** Each md-mail tool and the access it needs. The broker and the PreToolUse
 *  hook both check tools against this one map. */
export const MAIL_TOOL_OPS: Record<string, MailOp> = { list_mailboxes: 'list', search: 'read', read: 'read', draft: 'draft', send: 'send' };

/** Standard mail ports: IMAP over TLS, SMTP over TLS, and SMTP submission
 *  (STARTTLS). */
export const IMAPS_PORT = 993;
export const SMTPS_PORT = 465;
export const SUBMISSION_PORT = 587;

/** Server settings each service fills in, so an owner never types a server
 *  name. The help text shown for each service lives in the locale files
 *  (mailboxes.help.<provider>). */
export const PROVIDER_PRESETS: Record<Exclude<MailProvider, 'other'>, { label: string; imap: MailServer; smtp: MailServer }> = {
  gmail: {
    label: 'Gmail',
    imap: { host: 'imap.gmail.com', port: IMAPS_PORT, secure: true },
    smtp: { host: 'smtp.gmail.com', port: SMTPS_PORT, secure: true }
  },
  'google-workspace': {
    label: 'Google Workspace',
    imap: { host: 'imap.gmail.com', port: IMAPS_PORT, secure: true },
    smtp: { host: 'smtp.gmail.com', port: SMTPS_PORT, secure: true }
  },
  icloud: {
    label: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: IMAPS_PORT, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: SUBMISSION_PORT, secure: false }
  },
  yahoo: {
    label: 'Yahoo',
    imap: { host: 'imap.mail.yahoo.com', port: IMAPS_PORT, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: SMTPS_PORT, secure: true }
  },
  zoho: {
    label: 'Zoho',
    imap: { host: 'imap.zoho.com', port: IMAPS_PORT, secure: true },
    smtp: { host: 'smtp.zoho.com', port: SMTPS_PORT, secure: true }
  }
};

/** The service list the Add dialog shows, in order (design review 9B: no Outlook). */
export const PROVIDER_ORDER: MailProvider[] = ['gmail', 'google-workspace', 'icloud', 'yahoo', 'zoho', 'other'];

/** Outlook and Microsoft 365 stopped accepting app passwords for IMAP; phase 1
 *  cannot connect them (design review 9B: the test fails with this reason). */
export function isMicrosoftAddress(address: string): boolean {
  return /@(outlook|hotmail|live|msn)\.[a-z.]+$/i.test(address.trim());
}

/** "Other" guesses (design review 10A): mail.<domain> for both servers. */
export function guessServers(address: string): { imap: MailServer; smtp: MailServer } {
  const domain = address.split('@')[1]?.trim().toLowerCase() || 'example.com';
  return { imap: { host: `mail.${domain}`, port: IMAPS_PORT, secure: true }, smtp: { host: `mail.${domain}`, port: SMTPS_PORT, secure: true } };
}

export interface MailAccessConfig {
  mcpDefaults?: { [id: string]: { enabled: boolean } };
  mailboxes?: MailboxRecord[];
  agentCapabilities?: { [agentId: string]: AgentCapabilities };
}

export type MailAccessResult = { ok: true } | { ok: false; reason: string };

/**
 * The one access rule (MB-3, E3). Refuses unless: the agent has "Can check
 * email"; the mailbox is one of its mailboxes and still exists in Settings;
 * and, to send, the agent is not Draft only. Michael follows the same rule.
 * `list` needs only "Can check email": it returns the agent's own mailboxes.
 * Refusal reasons are read by the agent (and shown on the floor), so they say
 * what happened and what to do.
 */
export function mailAccess(cfg: MailAccessConfig, agentId: string, mailboxId: string | undefined, op: MailOp): MailAccessResult {
  const email = cfg.agentCapabilities?.[agentId]?.email;
  if (!email?.enabled) {
    return { ok: false, reason: 'The owner has not given you email in your Capabilities. Do not try another way; tell Michael what you need.' };
  }
  if (op === 'list') return { ok: true };
  // One mailbox per agent (owner, 2026-09-26): only the first listed counts.
  if (!mailboxId || email.mailboxes[0] !== mailboxId) {
    return { ok: false, reason: `The owner has not given you the mailbox "${mailboxId ?? ''}". Use list_mailboxes to see yours.` };
  }
  if (!(cfg.mailboxes ?? []).some((m) => m.id === mailboxId)) {
    return { ok: false, reason: `The mailbox "${mailboxId}" was removed in Settings.` };
  }
  if (op === 'send' && !email.send) {
    return { ok: false, reason: 'You are Draft only: save the reply as a draft instead, and the owner will send it.' };
  }
  return { ok: true };
}

/** The mailbox an agent may use, as a list of at most one (list_mailboxes).
 *  An agent has one mailbox at most (owner, 2026-09-26); an older record with
 *  more keeps only its first. */
export function agentMailboxes(cfg: MailAccessConfig, agentId: string): string[] {
  const email = cfg.agentCapabilities?.[agentId]?.email;
  if (!email?.enabled) return [];
  const known = new Set((cfg.mailboxes ?? []).map((m) => m.id));
  return email.mailboxes.slice(0, 1).filter((id) => known.has(id));
}

/** True when the email capability changed from off to on (E2: that needs a
 *  restart, because the md-mail server is attached only at spawn). */
export function emailJustEnabled(before: AgentCapabilities | undefined, after: AgentCapabilities | undefined): boolean {
  return !before?.email?.enabled && !!after?.email?.enabled;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/** A mailbox id from its address: sales@example.com -> sales-example-com. */
export function mailboxIdFor(address: string, taken: string[] = []): string {
  const base = address.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mailbox';
  let id = SLUG_RE.test(base) ? base : `mb-${base}`.slice(0, 40).replace(/-+$/, '');
  let n = 2;
  while (taken.includes(id)) id = `${base.slice(0, 36)}-${n++}`;
  return id;
}

export function secretRefForMailbox(id: string): string {
  return `mail:${id}`;
}
