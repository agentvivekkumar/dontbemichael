/**
 * Verified Task Completion (card-lifecycle / verified-completion).
 *
 * Implements the verification handshake between:
 *   1. The AI employee performing the task.
 *   2. The actual system where the action is executed (mail, accounting, etc.).
 *   3. Michael and the task ledger recording the final outcome.
 *
 * An AI employee's own report that work is finished does not count as
 * independent proof. Where an integration supports confirmation (e.g. sent-mail
 * records in the mail system), completion is verified against actual system
 * records. Tasks without verification mechanisms are recorded as not_supported
 * rather than falsely claiming verification.
 *
 * Plain TypeScript with no Node or Electron dependencies so both main and
 * renderer share it, and tests load it directly. Owner-facing reasons use plain
 * words with no dashes.
 */

export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'not_supported';

export interface TaskVerification {
  status: VerificationStatus;
  /** Verification method or integration inspected (e.g. 'mail-send', 'owner-close', 'none') */
  method?: string;
  /** Trustworthy evidence reference (e.g. Message-ID, proposal ID) */
  evidence?: string;
  /** Plain language explanation of verification outcome with no dashes */
  reason?: string;
  /** ISO timestamp when verification was evaluated */
  verifiedAt?: string;
}

export interface VerificationSendRecord {
  agentId?: string;
  mailbox?: string;
  messageId: string;
  to?: string;
  subject?: string;
  sentAt?: number;
}

export interface VerificationProposal {
  id: string;
  agentId?: string;
  state: string;
  messageId?: string;
  to?: string;
  subject?: string;
}

export interface VerificationContext {
  sends?: VerificationSendRecord[];
  proposals?: VerificationProposal[];
}

/** Check whether a task represents an action verifiable via the mail system. */
export function isMailAction(task: {
  title?: string;
  description?: string;
  result?: string;
  verification?: TaskVerification;
}): boolean {
  if (task.verification?.method === 'mail-send') return true;
  const text = `${task.title ?? ''} ${task.description ?? ''} ${task.result ?? ''}`;
  if (/\b(?:sent email|sent mail|send email|send mail|emailed)\b/i.test(text)) return true;
  if (/message-?id\b/i.test(text)) return true;
  if (/\bproposal-[a-zA-Z0-9_-]+/i.test(text)) return true;
  return false;
}

/** Verify a task against independent system records. */
export function verifyTaskCompletion(
  task: {
    id?: string;
    title?: string;
    description?: string;
    result?: string;
    assignee?: string;
    createdAt?: string;
    verification?: TaskVerification;
  },
  context?: VerificationContext
): TaskVerification {
  const now = new Date().toISOString();

  // If this task does not involve a supported verifiable action (Stage 1: mail sends)
  if (!isMailAction(task)) {
    return {
      status: 'not_supported',
      method: 'none',
      reason: 'No verification mechanism available for this task type',
      verifiedAt: now
    };
  }

  const sends = context?.sends ?? [];
  const proposals = context?.proposals ?? [];
  const text = `${task.result ?? ''} ${task.description ?? ''} ${task.title ?? ''}`;

  // 1. Look for proposal ID
  const proposalMatch = text.match(/\b(proposal-[a-zA-Z0-9_-]+)\b/i);
  const claimedProposalId = proposalMatch ? proposalMatch[1] : undefined;
  if (claimedProposalId) {
    const foundProposal = proposals.find((p) => p.id === claimedProposalId && p.state === 'sent');
    if (foundProposal && foundProposal.messageId) {
      return {
        status: 'verified',
        method: 'mail-send',
        evidence: foundProposal.messageId,
        reason: 'Confirmed sent email in mail proposals record',
        verifiedAt: now
      };
    }
  }

  // 2. Look for Message-ID in text (e.g. <...@...> or message-id: ...)
  const msgIdMatch = text.match(/<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>|message-?id[:\s]+([^\s,;]+)/i);
  const claimedMsgId = msgIdMatch ? (msgIdMatch[1] || msgIdMatch[2]).replace(/[<>]/g, '').trim() : undefined;
  if (claimedMsgId) {
    const foundSend = sends.find((s) => s.messageId.includes(claimedMsgId) || claimedMsgId.includes(s.messageId));
    if (foundSend) {
      return {
        status: 'verified',
        method: 'mail-send',
        evidence: foundSend.messageId,
        reason: 'Confirmed sent email in mail system records',
        verifiedAt: now
      };
    }
    return {
      status: 'failed',
      method: 'mail-send',
      evidence: claimedMsgId,
      reason: 'Claimed message id was not found in mail system records',
      verifiedAt: now
    };
  }

  // 3. Match against recent sends by assignee or recipient email
  const taskCreatedMs = task.createdAt ? Date.parse(task.createdAt) : 0;
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const targetEmail = emailMatch ? emailMatch[0].toLowerCase() : undefined;

  const candidateSends = sends.filter((s) => {
    if (task.assignee && s.agentId && s.agentId !== task.assignee) return false;
    if (taskCreatedMs && s.sentAt && s.sentAt < taskCreatedMs - 60_000) return false;
    if (targetEmail && s.to && !s.to.toLowerCase().includes(targetEmail)) return false;
    return true;
  });

  if (candidateSends.length > 0) {
    const matched = candidateSends[candidateSends.length - 1];
    return {
      status: 'verified',
      method: 'mail-send',
      evidence: matched.messageId,
      reason: 'Confirmed sent email in mail system records',
      verifiedAt: now
    };
  }

  // Claimed mail action but no record confirmed
  return {
    status: 'failed',
    method: 'mail-send',
    reason: 'No sent email record confirmed in mail system',
    verifiedAt: now
  };
}

export interface TaskCompletionDecision {
  allowed: boolean;
  status: 'done' | 'blocked' | 'doing' | 'todo';
  verification: TaskVerification;
}

/** Evaluate whether a task is permitted to transition to Done. */
export function evaluateTaskCompletion(
  task: {
    id?: string;
    title?: string;
    description?: string;
    result?: string;
    assignee?: string;
    createdAt?: string;
    closedBy?: 'owner';
    verification?: TaskVerification;
  },
  context?: VerificationContext
): TaskCompletionDecision {
  // If closed by owner, it represents owner decision rather than unverified AI completion
  if (task.closedBy === 'owner') {
    return {
      allowed: true,
      status: 'done',
      verification: task.verification ?? {
        status: 'not_supported',
        method: 'owner-close',
        reason: 'Closed by owner decision',
        verifiedAt: new Date().toISOString()
      }
    };
  }

  const verification = verifyTaskCompletion(task, context);

  if (verification.status === 'failed') {
    return {
      allowed: false,
      status: 'blocked',
      verification
    };
  }

  return {
    allowed: true,
    status: 'done',
    verification
  };
}
