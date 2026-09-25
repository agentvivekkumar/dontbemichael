/**
 * Durable agent role vs live status.
 *
 * Hive `registry.json` stores `role` (job / hire one-liner). The floor roster
 * stores the same string as `description`. Live run-state belongs on
 * `status` / `action` — never on role. Pause, idle, and Cursor "standby"
 * captions are status, not a job.
 */

/** Michael's role in the hive registry: fixed, whatever his card says. */
export const MICHAEL_ROLE = 'office manager';

const TRANSIENT_ROLE_RE = /^(on\s+)?standby$|^(idle|awaiting|paused|resumed|working|thinking|archived|starting up|reconnecting…?|running the floor|a fresh harness)$/i;

export function isDurableRole(text: string | undefined | null): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  return !TRANSIENT_ROLE_RE.test(value);
}

/**
 * Pick the job string that should survive a respawn or roster/registry sync.
 * A real hire role always beats a status-like caption. When both are durable,
 * `candidate` wins (the value the operator just set).
 */
export function preferredAgentRole(
  candidate: string | undefined | null,
  fallback: string | undefined | null,
  isGod = false
): string {
  const incoming = (candidate ?? '').trim();
  const existing = (fallback ?? '').trim();
  if (isDurableRole(incoming)) return incoming;
  if (isDurableRole(existing)) return existing;
  if (incoming) return incoming;
  if (existing) return existing;
  return isGod ? MICHAEL_ROLE : 'agent';
}

/** Role to send on spawn/restart. Omit a transient roster caption so the hive
 *  registry can keep the last real hire role. */
export function roleForHiveSpawn(agent: {
  description?: string;
  isGod?: boolean;
  isAssistant?: boolean;
}): string | undefined {
  // Michael's role is fixed: his card caption is written for the owner and is
  // not a job (owner cleanup, 2026-09-25).
  if (agent.isGod) return MICHAEL_ROLE;
  if (agent.isAssistant) {
    return preferredAgentRole(agent.description, "Michael's prep assistant");
  }
  const role = agent.description?.trim();
  return role && isDurableRole(role) ? role : undefined;
}

/** Longest text read as a role title rather than a sentence. */
const ROLE_TITLE_MAX = 40;

/**
 * Split a stored role ("Finance: Keeps track of your finances") into the two
 * fields Edit Agent shows: the role title and its description. Setup writes
 * pack members as `Role: summary` (teamMemberRole), so the first ": " splits
 * them. A status caption ("on standby", "a fresh harness") is not a role and
 * shows as empty fields.
 */
export function splitAgentRole(stored: string | undefined | null): { role: string; roleDescription: string } {
  const text = (stored ?? '').trim();
  if (!isDurableRole(text)) return { role: '', roleDescription: '' };
  const at = text.indexOf(': ');
  if (at > 0 && at <= ROLE_TITLE_MAX) {
    return { role: text.slice(0, at).trim(), roleDescription: text.slice(at + 2).trim() };
  }
  return text.length <= ROLE_TITLE_MAX ? { role: text, roleDescription: '' } : { role: '', roleDescription: text };
}

/** The stored role for the two fields: `Role: description`, or whichever one is
 *  filled in. Empty when both are, so the caller can keep what it had. */
export function joinAgentRole(role: string, roleDescription: string): string {
  const r = role.trim().replace(/:+$/, '').trim();
  const d = roleDescription.trim();
  if (r && d) return `${r}: ${d}`;
  return r || d;
}
