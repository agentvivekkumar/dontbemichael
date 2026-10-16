import { RESEARCH_ID } from '../shared/research';
/** Config backed calendar account management.
 * Synchronous operations use the same atomic config and encrypted secret store
 * as mailboxes. No passwords or raw dependency errors are returned or logged.
 */
import { randomBytes } from 'node:crypto';
import type { CalendarAccount } from '../shared/calendars';
import type { AgentCapabilities } from '../shared/mailboxes';
import { hasCalendarTools } from '../shared/calendarTools';
import {
  CALENDAR_SETTINGS_INVALID, CALENDAR_UNVERIFIED, calendarAccountId, calendarRecord,
  isCalendarSecretRef, validateCalendarAccountSettings, validateStoredCalendarAccount,
  type CalendarFailure, type CalendarListResult, type CalendarRemoveResult, type CalendarSaveResult, type CalendarGrantResult
} from '../shared/calendarAccounts';

export interface CalendarAccountConfig {
  calendarAccounts?: CalendarAccount[];
  /** Durable cleanup journal. Contains handles only, never passwords. */
  calendarSecretCleanup?: string[];
  agentCapabilities?: { [id: string]: AgentCapabilities };
}
export interface CalendarAccountDeps {
  getConfig(): CalendarAccountConfig;
  saveConfig(patch: Partial<CalendarAccountConfig>): void;
  canStoreSecrets(): boolean;
  setSecret(ref: string, password: string): { ok: boolean };
  deleteSecret(ref: string): boolean;
  /** Current team membership, required when granting access. */
  present?(agentId: string): boolean;
}
const failed = (error: string): CalendarFailure => ({ ok: false, error });
const storageError = 'The calendar account could not be saved safely. Try again.';

export class CalendarAccounts {
  constructor(private deps: CalendarAccountDeps) {}

  private state(): { cfg: CalendarAccountConfig; accounts: CalendarAccount[]; pending: string[] } {
    const cfg = this.deps.getConfig();
    if (!calendarRecord(cfg)) throw new Error();
    const raw = cfg.calendarAccounts === undefined ? [] : cfg.calendarAccounts;
    const pending = cfg.calendarSecretCleanup === undefined ? [] : cfg.calendarSecretCleanup;
    if (!Array.isArray(raw) || !Array.isArray(pending)) throw new Error();
    const accounts: CalendarAccount[] = [];
    const ids = new Set<string>();
    const calendars = new Set<string>();
    for (const item of raw) {
      const account = validateStoredCalendarAccount(item);
      if (!account || ids.has(account.id)) throw new Error();
      ids.add(account.id);
      for (const calendar of account.calendars) {
        if (calendars.has(calendar.id)) throw new Error();
        calendars.add(calendar.id);
      }
      accounts.push(account);
    }
    // Never delete active handles, even if a damaged journal names one.
    const active = new Set(accounts.map((account) => account.secretRef));
    for (const ref of pending) if (!isCalendarSecretRef(ref) || active.has(ref)) throw new Error();
    if (cfg.agentCapabilities !== undefined && !calendarRecord(cfg.agentCapabilities)) throw new Error();
    for (const c of Object.values(cfg.agentCapabilities ?? {})) {
      if (!calendarRecord(c)) throw new Error();
      if (c.calendars !== undefined && (!Array.isArray(c.calendars) || [...c.calendars].some((g) =>
        !calendarRecord(g) || !calendarAccountId(g.calendar) || !['read', 'approval', 'book'].includes(g.access as string)))) throw new Error();
    }
    return { cfg: cfg as CalendarAccountConfig, accounts, pending: [...new Set(pending)] };
  }

  list(): CalendarListResult {
    try { return { ok: true, accounts: this.state().accounts }; }
    catch { return failed('The saved calendar account settings could not be read safely.'); }
  }

  setGrant(agentId: unknown, calendarId: unknown, access: unknown): CalendarGrantResult {
    try {
      if (typeof agentId !== 'string' || !agentId.trim() || agentId === RESEARCH_ID || agentId === 'constructor' || agentId === '__proto__' || agentId === 'prototype' || !this.deps.present?.(agentId) || !calendarAccountId(calendarId)
        || (access !== null && access !== 'read' && access !== 'approval' && access !== 'book')) return failed(CALENDAR_SETTINGS_INVALID);
      const { cfg, accounts } = this.state();
      if (access !== null && !accounts.some((a) => a.calendars.some((c) => c.id === calendarId && c.enabled))) return failed('Choose an enabled calendar in Settings first.');
      const before = hasCalendarTools(cfg, agentId);
      const current = cfg.agentCapabilities?.[agentId] ?? {};
      const calendars = (current.calendars ?? []).filter((g) => g.calendar !== calendarId);
      if (access !== null) calendars.push({ calendar: calendarId, access });
      const agentCapabilities = { ...cfg.agentCapabilities, [agentId]: { ...current, calendars } };
      this.deps.saveConfig({ agentCapabilities });
      return { ok: true, restartNeeded: !before && hasCalendarTools({ ...cfg, agentCapabilities }, agentId) };
    } catch { return failed('Calendar access could not be saved. Try again.'); }
  }

  selectCalendar(accountId: unknown, calendarId: unknown, enabled: unknown): CalendarSaveResult {
    try {
      if (!calendarAccountId(accountId) || !calendarAccountId(calendarId) || typeof enabled !== 'boolean') return failed(CALENDAR_SETTINGS_INVALID);
      const account = this.state().accounts.find((a) => a.id === accountId);
      if (!account || !account.calendars.some((c) => c.id === calendarId)) return failed(CALENDAR_SETTINGS_INVALID);
      const { status: _status, statusReason: _reason, secretRef: _ref, ...settings } = account;
      return this.update(accountId, { account: { ...settings, calendars: settings.calendars.map((c) => c.id === calendarId ? { ...c, enabled } : c) } });
    } catch { return failed(storageError); }
  }

  /** Main internal only. Called by the CalDAV service after authenticated
   * discovery, never from an IPC payload. A stale result cannot verify a new
   * password or overwrite account changes made while a request was running.
   */
  applyConnectionResult(expected: CalendarAccount, discovered?: Pick<CalendarAccount, 'serverUrl' | 'calendars'>, reason?: string): { ok: boolean } {
    try {
      const { cfg, accounts } = this.state();
      const current = accounts.find((a) => a.id === expected.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return { ok: false };
      const next = validateStoredCalendarAccount({ ...current, ...(discovered ?? {}),
        status: discovered ? 'connected' : 'needs-attention', statusReason: discovered ? undefined : reason ?? CALENDAR_UNVERIFIED });
      if (!next) return { ok: false };
      const otherIds = new Set(accounts.filter((a) => a.id !== current.id).flatMap((a) => a.calendars.map((c) => c.id)));
      if (next.calendars.some((c) => otherIds.has(c.id))) return { ok: false };
      const stale = new Set(current.calendars.filter((c) => !next.calendars.some((n) => n.id === c.id && n.url === c.url)).map((c) => c.id));
      for (const c of next.calendars) if (!current.calendars.some((before) => before.id === c.id)) stale.add(c.id);
      const caps = this.revoke(cfg.agentCapabilities, stale);
      this.deps.saveConfig({ calendarAccounts: accounts.map((a) => a.id === current.id ? next : a), ...(caps ? { agentCapabilities: caps } : {}) });
      return { ok: true };
    } catch { return { ok: false }; }
  }

  /** Retried on subsequent management writes or at app startup. A crash after
   * deletion but before journal cleanup is harmless because deletion is idempotent.
   */
  cleanup(): boolean {
    try {
      const { pending } = this.state();
      const remaining = pending.filter((ref) => {
        try { return !this.deps.deleteSecret(ref); } catch { return true; }
      });
      if (remaining.length !== pending.length) this.deps.saveConfig({ calendarSecretCleanup: remaining });
      return remaining.length > 0;
    } catch { return true; }
  }

  add(input: unknown): CalendarSaveResult { return this.save(undefined, input); }
  update(id: unknown, input: unknown): CalendarSaveResult {
    if (!calendarAccountId(id)) return failed(CALENDAR_SETTINGS_INVALID);
    return this.save(id, input);
  }

  private save(updateId: string | undefined, input: unknown): CalendarSaveResult {
    try {
      if (!calendarRecord(input) || Object.keys(input).some((key) => key !== 'account' && key !== 'password')) return failed(CALENDAR_SETTINGS_INVALID);
      const checked = validateCalendarAccountSettings(input.account);
      if (!checked.ok) return checked;
      const settings = checked.value;
      const { cfg, accounts, pending } = this.state();
      const old = accounts.find((account) => account.id === settings.id);
      if (updateId === undefined ? !!old : !old || updateId !== settings.id) return failed(CALENDAR_SETTINGS_INVALID);
      const others = accounts.filter((account) => account.id !== settings.id);
      const otherIds = new Set(others.flatMap((account) => account.calendars.map((c) => c.id)));
      if (settings.calendars.some((c) => otherIds.has(c.id))) return failed(CALENDAR_SETTINGS_INVALID);
      const password = input.password;
      if (password !== undefined && (typeof password !== 'string' || !password.trim() || password.length > 4096 || /[\u0000-\u001f\u007f]/.test(password))) return failed(CALENDAR_SETTINGS_INVALID);
      const identityChanged = !!old && (old.serverUrl !== settings.serverUrl || old.username !== settings.username || old.provider !== settings.provider);
      if ((!old || identityChanged) && password === undefined) return failed('Enter the app password for this calendar account.');
      if (password !== undefined && !this.deps.canStoreSecrets()) return failed('This computer cannot store the password safely. Unlock its keychain or keyring and try again.');
      const secretRef = password === undefined ? old!.secretRef : `calendar:${settings.id}:${randomBytes(16).toString('hex')}`;
      const unchangedLogin = old && !identityChanged && password === undefined;
      const reason = unchangedLogin ? old.statusReason : CALENDAR_UNVERIFIED;
      const record: CalendarAccount = { ...settings, secretRef,
        status: unchangedLogin ? old.status : 'needs-attention',
        ...(reason ? { statusReason: reason } : {}) };
      const stale = new Set((old?.calendars ?? []).filter((c) => identityChanged || !settings.calendars.some((next) => next.id === c.id && next.url === c.url)).map((c) => c.id));
      // Reusing a formerly removed ID must not revive a dangling old grant.
      for (const c of settings.calendars) if (!old?.calendars.some((before) => before.id === c.id)) stale.add(c.id);
      const caps = this.revoke(cfg.agentCapabilities, stale);
      if (password !== undefined) {
        // Journal the new handle before any secret exists. If either following
        // write fails, cleanup can retry after restart without knowing a password.
        this.deps.saveConfig({ calendarSecretCleanup: [...pending, secretRef] });
        // Do not echo the secret store's error: it can contain raw OS data.
        let stored = false;
        try { stored = this.deps.setSecret(secretRef, password as string).ok; } catch { /* handled below */ }
        if (!stored) {
          this.cleanup();
          return failed(storageError);
        }
      }
      try {
        this.deps.saveConfig({ calendarAccounts: old ? accounts.map((a) => a.id === record.id ? record : a) : [...accounts, record],
          ...(caps ? { agentCapabilities: caps } : {}),
          calendarSecretCleanup: [...pending, ...(old && old.secretRef !== secretRef ? [old.secretRef] : [])] });
      } catch {
        if (password !== undefined) {
          this.cleanup();
        }
        return failed(storageError);
      }
      return { ok: true, record, cleanupPending: this.cleanup() };
    } catch { return failed(storageError); }
  }

  private revoke(caps: CalendarAccountConfig['agentCapabilities'], stale: Set<string>) {
    if (!caps || !stale.size) return undefined;
    return Object.fromEntries(Object.entries(caps).map(([id, c]) => [id, c.calendars
      ? { ...c, calendars: c.calendars.filter((g) => !stale.has(g.calendar)) } : c]));
  }

  remove(id: unknown): CalendarRemoveResult {
    if (!calendarAccountId(id)) return failed(CALENDAR_SETTINGS_INVALID);
    try {
      const { cfg, accounts, pending } = this.state();
      const old = accounts.find((account) => account.id === id);
      if (!old) return { ok: true, affected: [], cleanupPending: this.cleanup() };
      const stale = new Set(old.calendars.map((c) => c.id));
      const affected = Object.entries(cfg.agentCapabilities ?? {}).filter(([, c]) => c.calendars?.some((g) => stale.has(g.calendar))).map(([agent]) => agent);
      const caps = this.revoke(cfg.agentCapabilities, stale);
      this.deps.saveConfig({ calendarAccounts: accounts.filter((a) => a.id !== id),
        ...(caps ? { agentCapabilities: caps } : {}), calendarSecretCleanup: [...pending, old.secretRef] });
      return { ok: true, affected, cleanupPending: this.cleanup() };
    } catch { return failed('The calendar account could not be removed safely. Try again.'); }
  }
}
