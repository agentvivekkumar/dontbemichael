// Design tokens, design system v2 "Studio" (branding/DESIGN.md sections 3 to 6).
// Everything else lives in tokens.css as CSS variables; these are the values
// code needs directly. Keep them in step with tokens.css.

/** Department pastel families (DESIGN.md 3.4): l lit/lightest, m main, d shaded, acc accent. */
export const departments = {
  'front-desk': { l: '#FFE4EC', m: '#F7C3D2', d: '#EBA6BA', acc: '#E25A83' },
  support:      { l: '#DDEEFF', m: '#B4D5F8', d: '#93BEEE', acc: '#3D8BE6' },
  sales:        { l: '#FFF3CC', m: '#F8DF95', d: '#EDCB6E', acc: '#D29B0B' },
  finance:      { l: '#D8F5E8', m: '#AEE6CD', d: '#8DD5B5', acc: '#1FA872' },
  marketing:    { l: '#FFE6D8', m: '#F9C8AE', d: '#EEB090', acc: '#E57B45' },
  people:       { l: '#EFE6FC', m: '#D6C5F4', d: '#C1AAEA', acc: '#8A63E0' },
  it:           { l: '#E0E6F7', m: '#BAC5E8', d: '#9DABDA', acc: '#5468C4' },
  operations:   { l: '#D5F3F4', m: '#A9E3E5', d: '#86D2D5', acc: '#169BA3' },
  team:         { l: '#EDEBF6', m: '#D8D5EA', d: '#C4C0DE', acc: '#6C6884' }
} as const;
export type DepartmentName = keyof typeof departments;

/** The accent names a person can carry (Agent.accent). */
export type AccentColorName =
  | 'coral' | 'mint' | 'sky' | 'lemon' | 'lilac' | 'peach';
