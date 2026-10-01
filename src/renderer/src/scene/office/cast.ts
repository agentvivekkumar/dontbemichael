// The Office cast: names, groups and each character's colors. Design v2 draws
// people as avatars in their department's colors (branding/DESIGN.md 3.4); the
// pixel sprites and portraits that used to be painted from here are gone.


export type OfficeCharacterName =
  | 'michael' | 'jim' | 'pam' | 'dwight' | 'kevin' | 'angela'
  | 'oscar' | 'stanley' | 'phyllis' | 'andy' | 'kelly' | 'ryan'
  | 'toby' | 'creed' | 'meredith'
  // Added so every Office Pack role has its own character: IT, IT security,
  // and the warehouse (inventory & shipping).
  | 'nick' | 'sadiq' | 'darryl'
  // Erin, the receptionist after Pam: same job as Pam (owner, 2026-09-27).
  | 'erin';

export interface CastMember {
  name: OfficeCharacterName;
  displayName: string;
  /** Signature accent color (hex) — used for the in-scene selection glow. */
  shirt: string;
  /** Blurb shown when this character is picked / has no description yet. */
  blurb: string;
}

/** Selectable roster, in display order. */
export const OFFICE_CAST: CastMember[] = [
  { name: 'michael',  displayName: 'Michael',  shirt: '#5a6b8c', blurb: "World's best boss" },
  { name: 'jim',      displayName: 'Jim',      shirt: '#6fa8dc', blurb: 'Salesman, prankster' },
  { name: 'pam',      displayName: 'Pam',      shirt: '#9caf88', blurb: 'Receptionist, artist' },
  { name: 'erin',     displayName: 'Erin',     shirt: '#2f3a5c', blurb: 'Receptionist' },
  { name: 'dwight',   displayName: 'Dwight',   shirt: '#b89b3e', blurb: 'Assistant (to the) RM' },
  { name: 'kevin',    displayName: 'Kevin',    shirt: '#4a7ab5', blurb: 'Accounting' },
  { name: 'angela',   displayName: 'Angela',   shirt: '#8a86a6', blurb: 'Head of accounting' },
  { name: 'oscar',    displayName: 'Oscar',    shirt: '#7a4b6b', blurb: 'Accountant' },
  { name: 'stanley',  displayName: 'Stanley',  shirt: '#8c5a4b', blurb: 'Sales, crossword' },
  { name: 'phyllis',  displayName: 'Phyllis',  shirt: '#b08bbf', blurb: 'Sales' },
  { name: 'andy',     displayName: 'Andy',     shirt: '#6fae6f', blurb: 'Cornell, a cappella' },
  { name: 'kelly',    displayName: 'Kelly',    shirt: '#d16ba5', blurb: 'Customer service' },
  { name: 'ryan',     displayName: 'Ryan',     shirt: '#3a3a44', blurb: 'The temp' },
  { name: 'toby',     displayName: 'Toby',     shirt: '#9a8c5a', blurb: 'Human resources' },
  { name: 'creed',    displayName: 'Creed',    shirt: '#6b7a4b', blurb: 'Quality assurance' },
  { name: 'meredith', displayName: 'Meredith', shirt: '#b5544a', blurb: 'Supplier relations' },
  { name: 'nick',     displayName: 'Nick',     shirt: '#60806a', blurb: 'IT' },
  { name: 'sadiq',    displayName: 'Sadiq',    shirt: '#7896ba', blurb: 'IT security' },
  { name: 'darryl',   displayName: 'Darryl',   shirt: '#4a6280', blurb: 'Warehouse foreman' },
];

/** The cast grouped by the kind of work each did in the show, in the order Add
 *  Agent shows them. Related jobs share a group so no group is a lone tile
 *  (owner, 2026-09-27). Every cast member is in exactly one group. */
export const CAST_GROUPS: { key: string; members: OfficeCharacterName[] }[] = [
  { key: 'office',     members: ['michael', 'pam', 'erin'] },
  { key: 'sales',      members: ['dwight', 'jim', 'stanley', 'phyllis', 'andy', 'ryan'] },
  { key: 'accounting', members: ['oscar', 'angela', 'kevin'] },
  { key: 'people',     members: ['toby', 'kelly'] },
  { key: 'it',         members: ['nick', 'sadiq'] },
  { key: 'operations', members: ['creed', 'meredith', 'darryl'] }
];

export const CAST_BY_NAME: Record<OfficeCharacterName, CastMember> =
  Object.fromEntries(OFFICE_CAST.map((c) => [c.name, c])) as Record<OfficeCharacterName, CastMember>;

export const DEFAULT_CHARACTER: OfficeCharacterName = 'jim';

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

