import { agentMailboxes, type MailAccessConfig } from './mailboxes';
import { isQuickBooksKey, usableConnectors, type ConnectorConfig } from './claudeConnectors';
import { quickbooksCapability } from './quickbooks';

/** One thing an agent can really reach. */
export type AccessItem =
  | { kind: 'mailbox'; address: string; send: boolean }
  | { kind: 'connector'; key: string }
  | { kind: 'quickbooks'; changes: boolean };

/**
 * What an agent can actually use right now, for its profile's "Uses" row:
 * its mailbox (agentMailboxes, the rule the mail tools apply) and the Claude
 * connectors it may call (usableConnectors, the rule its spawn and the hook
 * apply), QuickBooks with its level. Never the pack card's `connections`:
 * those are a job template's wish list, and an agent was shown "Mailchimp,
 * Instagram / Facebook" it could never reach (owner, 2026-10-02).
 */
export function agentAccessSummary(cfg: MailAccessConfig & ConnectorConfig, agentId: string, roleReadsBooks: boolean): AccessItem[] {
  const items: AccessItem[] = [];
  const mailboxId = agentMailboxes(cfg, agentId)[0];
  const mailbox = mailboxId ? (cfg.mailboxes ?? []).find((m) => m.id === mailboxId) : undefined;
  if (mailbox) items.push({ kind: 'mailbox', address: mailbox.address, send: cfg.agentCapabilities?.[agentId]?.email?.send === true });
  const connectors = usableConnectors(cfg, agentId, roleReadsBooks).sort((a, b) => a.key.localeCompare(b.key));
  for (const c of connectors) {
    if (isQuickBooksKey(c.key)) {
      items.push({ kind: 'quickbooks', changes: quickbooksCapability(cfg.agentCapabilities?.[agentId]?.quickbooks, roleReadsBooks).changes });
    } else {
      items.push({ kind: 'connector', key: c.key });
    }
  }
  return items;
}
