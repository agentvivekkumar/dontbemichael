import { normalizeAgentProvider, providerPreset } from './agentProvider';

/**
 * The office break (issue 124): what the owner sees while an engine has
 * reached its usage limit. Main keeps the state (src/main/officeBreak.ts); the
 * renderer only shows this view.
 *
 * `until` is when the limit resets, or null when the engine did not say.
 * `checking` means the reset time has passed and the app is waiting for the
 * first finished turn to confirm work can start again: delivery is open then,
 * so that turn can happen.
 */
export interface OfficeBreakView {
  until: number | null;
  checking: boolean;
}

export function isProviderRateLimitSignal(provider: string | undefined, error: unknown): boolean {
  if (typeof error !== 'string') return false;
  const id = normalizeAgentProvider(provider) ?? (provider ? undefined : 'claude');
  const signal = id ? providerPreset(id).rateLimitSignal : undefined;
  return !!signal && error === signal;
}

/** Whether a provider with a configured rate-limit signal is held by the break. */
export function heldByBreak(view: OfficeBreakView | null | undefined, provider: string | undefined): boolean {
  const id = normalizeAgentProvider(provider) ?? (provider ? undefined : 'claude');
  return !!view && !view.checking && !!id && !!providerPreset(id).rateLimitSignal;
}
