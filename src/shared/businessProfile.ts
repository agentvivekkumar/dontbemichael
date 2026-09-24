/**
 * What onboarding step 1 must have before the owner can continue.
 *
 * Name and location are required because every agent writes AS this business:
 * a draft signed "Pho Saigon Kitchen, Austin, TX" rather than "your business".
 * The type is required because it picks the starter team.
 *
 * Whitespace does not count as an answer. Format is deliberately NOT enforced:
 * the prompt says "City, State", but "Austin TX" or a location outside the US
 * is still a real answer, and rejecting it would block a real owner.
 */

export type BusinessField = 'name' | 'location' | 'type';

export interface BusinessProfileDraft {
  name: string;
  location: string;
  type?: string;
}

/** The fields still missing, in on-screen order. Empty means step 1 is complete. */
export function missingBusinessFields(d: BusinessProfileDraft): BusinessField[] {
  const missing: BusinessField[] = [];
  if (!d.name.trim()) missing.push('name');
  if (!d.location.trim()) missing.push('location');
  if (!d.type) missing.push('type');
  return missing;
}
