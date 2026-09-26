/**
 * Mailboxes and agent Capabilities (docs/designs/multi-mailbox.md).
 *
 * Shared by main (broker, hook gate, mail client) and the renderer (Settings >
 * Mailboxes, the Capabilities tab). No electron / node imports.
 *
 * A mailbox is connected once, in Settings, with an address and an app password
 * held only by the broker's secret store. Each agent's Capabilities say which
 * mailboxes it may use and whether it may send or only draft. `mailAccess` is the
 * one rule both enforcement points call: the broker for IMAP mailboxes and the
 * PreToolUse hook for the Claude account mailbox.
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
  /** Mailbox ids (added in Settings) this agent may use. */
  mailboxes: string[];
  /** true = Can send; false = Draft only. */
  send: boolean;
}

export interface AgentCapabilities {
  email?: EmailCapability;
}

export type MailOp = 'list' | 'read' | 'draft' | 'send';

/** Settings each service fills in, so an owner never types a server name. */
export const PROVIDER_PRESETS: Record<Exclude<MailProvider, 'other'>, { label: string; imap: MailServer; smtp: MailServer; help: string }> = {
  gmail: {
    label: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    help: 'Gmail needs an app password, not your normal one. Turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords.'
  },
  'google-workspace': {
    label: 'Google Workspace',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    help: 'Use an app password from myaccount.google.com/apppasswords. If that page is missing, your Workspace admin has turned app passwords off.'
  },
  icloud: {
    label: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    help: 'iCloud needs an app-specific password. Create one at account.apple.com under Sign-In and Security.'
  },
  yahoo: {
    label: 'Yahoo',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    help: 'Yahoo needs an app password. Create one in Account Security, then Generate app password.'
  },
  zoho: {
    label: 'Zoho',
    imap: { host: 'imap.zoho.com', port: 993, secure: true },
    smtp: { host: 'smtp.zoho.com', port: 465, secure: true },
    help: 'Zoho needs an app-specific password from Security, then App Passwords, and IMAP turned on in Mail settings.'
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
  return { imap: { host: `mail.${domain}`, port: 993, secure: true }, smtp: { host: `mail.${domain}`, port: 465, secure: true } };
}

/** Whether the owner lets agents use the email and calendar connected to their
 *  Claude account (the "Your Claude account" switch in Settings > Mailboxes;
 *  stored as the old Email & Calendar switch). It governs only that connector:
 *  mailboxes added in Settings depend on Capabilities alone (owner, 2026-09-26).
 *  Only an explicit yes counts. */
export function teamEmailOn(mcpDefaults: { [id: string]: { enabled: boolean } } | undefined): boolean {
  return mcpDefaults?.['email-calendar']?.enabled === true;
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
  if (!mailboxId || !email.mailboxes.includes(mailboxId)) {
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

/** The mailboxes an agent may use, in Settings order (list_mailboxes). */
export function agentMailboxes(cfg: MailAccessConfig, agentId: string): string[] {
  const email = cfg.agentCapabilities?.[agentId]?.email;
  if (!email?.enabled) return [];
  const known = new Set((cfg.mailboxes ?? []).map((m) => m.id));
  return email.mailboxes.filter((id) => known.has(id));
}

/** True when the email capability changed from off to on (E2: that needs a
 *  restart, because the md-mail server is attached only at spawn). */
export function emailJustEnabled(before: AgentCapabilities | undefined, after: AgentCapabilities | undefined): boolean {
  return !before?.email?.enabled && !!after?.email?.enabled;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/** A mailbox id from its address: sales@moblize.it -> sales-moblize-it. */
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
