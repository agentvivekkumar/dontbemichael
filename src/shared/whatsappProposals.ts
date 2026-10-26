/**
 * Send on approval for WhatsApp Business Cloud API.
 * Follows the Ask Me proposal model (docs/designs/send-on-approval.md).
 *
 * An agent set to "Send on approval" cannot send directly to Meta Cloud API.
 * It proposes a message; the owner approves it on Ask Me (editing recipient or text),
 * asks for changes, or declines it.
 *
 * Dispatch sends only the approved copy from the store, preventing agents from
 * bypassing owner review or modifying the payload after approval.
 *
 * Pure: no Electron, no Node fs dependencies.
 */

export type WhatsAppProposalState =
  | 'waiting'
  | 'approved'
  | 'changes'
  | 'declined'
  | 'cancelled'
  | 'sending'
  | 'sent';

export type WhatsAppProposalDecision = 'approve' | 'changes' | 'decline';

export interface WhatsAppProposal {
  id: string; // wp_<timestamp>_<random>
  agentId: string;
  accountId: string;
  to: string;
  text: string;
  createdAt: number;
  state: WhatsAppProposalState;
  approved?: { to?: string; text: string };
  decidedAt?: number;
  note?: string;
  cancelReason?: string;
  sentAt?: number;
  messageId?: string;
  replaces?: string;
}

export const WHATSAPP_PROPOSAL_KEEP_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const normPhone = (s: string | undefined): string => (s ?? '').replace(/[^0-9]/g, '');

/**
 * Files a new WhatsApp proposal. If a waiting proposal from the same agent,
 * account, and recipient already exists, it is replaced to prevent card sprawl on Ask Me.
 */
export function fileWhatsAppProposal(
  list: WhatsAppProposal[],
  incoming: WhatsAppProposal
): WhatsAppProposal[] {
  const same = (p: WhatsAppProposal): boolean =>
    p.state === 'waiting' &&
    p.agentId === incoming.agentId &&
    p.accountId === incoming.accountId &&
    normPhone(p.to) === normPhone(incoming.to);

  return [...list.filter((p) => !same(p)), incoming];
}

/**
 * Validates whether a WhatsApp proposal can be dispatched by the agent.
 * Returns null when valid, or a refusal reason string for the agent.
 */
export function whatsAppProposalSendProblem(
  p: WhatsAppProposal | undefined,
  agentId: string,
  accountId: string
): string | null {
  if (!p || p.agentId !== agentId || p.accountId !== accountId) {
    return 'No proposal of yours from this WhatsApp account has that id. Use propose_whatsapp_message to put the message on Ask me.';
  }
  if (p.state === 'sent') return null; // Idempotent replay
  if (p.state === 'approved' && p.approved) return null;
  if (p.state === 'waiting') return 'The owner has not decided this message yet. You will get a message when they do.';
  if (p.state === 'changes') return 'The owner asked for changes to this message. Write a new version and propose it again.';
  if (p.state === 'declined') return 'The owner chose not to send this message. Do not send it another way.';
  if (p.state === 'cancelled') return `This message was withdrawn: ${p.cancelReason ?? 'it can no longer be sent'}. Do not send it another way.`;
  if (p.state === 'sending') return 'This message is currently being sent. Do not send it again.';
  return 'This message cannot be sent. Propose it again.';
}

/**
 * Filter proposals that are currently waiting on Ask Me.
 */
export function waitingWhatsAppProposals(list: WhatsAppProposal[]): WhatsAppProposal[] {
  return list.filter((p) => p.state === 'waiting').sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Prune old decided proposals older than WHATSAPP_PROPOSAL_KEEP_MS.
 */
export function pruneWhatsAppProposals(list: WhatsAppProposal[], now: number): WhatsAppProposal[] {
  return list.filter(
    (p) =>
      p.state === 'waiting' ||
      p.state === 'approved' ||
      p.state === 'sending' ||
      now - (p.sentAt ?? p.decidedAt ?? p.createdAt) < WHATSAPP_PROPOSAL_KEEP_MS
  );
}

/**
 * Summarize owner edits for memory notes so the agent learns how the owner prefers messages written.
 */
export function describeWhatsAppEdits(
  before: { to: string; text: string },
  after: { to: string; text: string }
): string {
  const out: string[] = [];
  if (before.to.trim() !== after.to.trim()) {
    out.push(`Recipient: "${before.to.trim()}" became "${after.to.trim()}".`);
  }
  if (before.text.trim() !== after.text.trim()) {
    out.push(`Message text was edited by the owner:\nFrom: "${before.text.trim()}"\nTo: "${after.text.trim()}"`);
  }
  return out.join('\n');
}

/**
 * Message sent to agent via hive when owner decides a WhatsApp proposal.
 */
export function whatsAppDecisionMessage(
  p: WhatsAppProposal,
  decision: WhatsAppProposalDecision,
  edits: string,
  note: string
): { act: 'request' | 'inform'; subject: string; body: string } {
  if (decision === 'approve') {
    return {
      act: 'request',
      subject: 'WhatsApp message approved',
      body: [
        `The owner approved your WhatsApp message to ${p.to}${edits ? ', with changes' : ''}. Send it now: call send_whatsapp_message with accountId "${p.accountId}" and proposalId "${p.id}". It sends the approved version exactly as the owner left it.`,
        ...(edits ? ['What the owner changed (it is in your memory notes):', edits] : [])
      ].join('\n')
    };
  }

  if (decision === 'changes') {
    return {
      act: 'request',
      subject: 'Changes requested on WhatsApp message',
      body: [
        `The owner asked for changes to your WhatsApp message to ${p.to}.`,
        ...(note ? [`Owner note: "${note}"`] : []),
        'Write an updated version and propose it again with propose_whatsapp_message.'
      ].join('\n')
    };
  }

  return {
    act: 'inform',
    subject: 'WhatsApp message not sent',
    body: `The owner chose not to send your WhatsApp message to ${p.to}. Do not send it another way.`
  };
}
