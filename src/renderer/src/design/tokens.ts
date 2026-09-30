// Design tokens, design system v2 "Studio" (branding/DESIGN.md sections 3 to 6).
// Mirrors tokens.css for non-CSS consumers (the SVG studio, Pixi until it goes).
// Any change here must also update tokens.css.

/** v2 tokens, light theme. Names match tokens.css (--cth-<name>). */
export const v2 = {
  bg: '#F7F7FB', floor: '#E9E7F7', card: '#FFFFFF', card2: '#FAFAFD', rail: '#F8F7FC', chrome: '#F1F0F8',
  ink: '#1E1B2E', ink2: '#4A4660', ink3: '#6C6884', ink4: '#B4B1C6',
  line: '#E8E6F2', line2: '#DAD7EA', lineInput: '#8F8AA6', neutralSoft: '#F0EFF5',
  coral: '#FF5A5F', coralSoft: '#FFECEC', coralText: '#C8303A', coralStrong: '#D4363D',
  green: '#1FB872', greenSoft: '#E3F7EC', greenText: '#157D4D',
  blue: '#4C6FFF', blueSoft: '#E8EDFF', blueText: '#3553E8',
  violet: '#8B5CF6', violetSoft: '#F0EAFE', violetText: '#7043E6',
  amber: '#F2A93B', amberSoft: '#FFF4DF', amberText: '#8F5C07',
  indigo: '#6C5CE7', indigoSoft: '#EEEBFD', indigoText: '#4338CA',
  actRequest: '#5B55C9'
} as const;

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

// ── v1 shapes, remapped onto v2 (see tokens.css) ──────────────────────────────

export const colors = {
  cream: {
    50: 0xf7f7fb,
    100: 0xffffff,
    200: 0xf0eff5,
    300: 0xe8e6f2
  },
  paper: {
    100: 0xffffff,
    200: 0xfafafd
  },
  ink: {
    900: 0x1e1b2e,
    700: 0x4a4660,
    500: 0x6c6884,
    300: 0xb4b1c6,
    100: 0xe8e6f2
  },
  accent: {
    coral: 0xff5a5f,
    coralLight: 0xffecec,
    mint: 0x1fb872,
    mintLight: 0xe3f7ec,
    sky: 0x4c6fff,
    skyLight: 0xe8edff,
    lemon: 0xf2a93b,
    lemonLight: 0xfff4df,
    lilac: 0x8b5cf6,
    lilacLight: 0xf0eafe,
    peach: 0x6c5ce7,
    peachLight: 0xeeebfd
  },
  status: {
    idle: 0xb4b1c6,
    thinking: 0x8b5cf6,
    working: 0x4c6fff,
    blocked: 0xff5a5f,
    success: 0x1fb872,
    ghost: 0xd9d6e6
  },
  world: {
    grassLight: 0xd4eab0,
    grassDark: 0xb5d589,
    woodLight: 0xe5c896,
    woodDark: 0xc9a66b,
    path: 0xe8d8b0,
    wall: 0x8b6f47
  }
} as const;

export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64
} as const;

export const type = {
  display: '"Sora", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", sans-serif',
  ui: '"Sora", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, "PingFang SC", "Microsoft YaHei", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", monospace',
  terminal: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, "PingFang SC", "Microsoft YaHei", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", monospace'
} as const;

export const tileSize = 32; // px — the world is built from 32×32 tiles

export type AccentColorName =
  | 'coral' | 'mint' | 'sky' | 'lemon' | 'lilac' | 'peach';

export const accentByName: Record<AccentColorName, number> = {
  coral: colors.accent.coral,
  mint:  colors.accent.mint,
  sky:   colors.accent.sky,
  lemon: colors.accent.lemon,
  lilac: colors.accent.lilac,
  peach: colors.accent.peach
};

export const accentLightByName: Record<AccentColorName, number> = {
  coral: colors.accent.coralLight,
  mint:  colors.accent.mintLight,
  sky:   colors.accent.skyLight,
  lemon: colors.accent.lemonLight,
  lilac: colors.accent.lilacLight,
  peach: colors.accent.peachLight
};

// Convert 0xRRGGBB to "#RRGGBB"
export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0').toUpperCase();
}
