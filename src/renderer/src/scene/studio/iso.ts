/**
 * Isometric geometry for the studio (branding/DESIGN.md 8.1): a 2:1 projection
 * of a grid onto a fixed 1060 x 816 stage. Everything on the stage is built from
 * boxes (top, left and right faces) and ellipses on this grid.
 */

export const S = 50;            // grid unit: half the width of one cell, in stage px
export const CX = 545;          // stage origin of grid (0, 0), Michael's pod
export const CY = 425;
export const STAGE_W = 1060;
export const STAGE_H = 816;

export type Pt = readonly [number, number];

/** Grid (gx, gy) at height z to stage pixels. */
export function P(gx: number, gy: number, z = 0): Pt {
  return [CX + (gx - gy) * S, CY + ((gx + gy) * S) / 2 - z];
}

/** Stage pixels back to grid, on the floor. */
export function G(x: number, y: number): Pt {
  const u = (x - CX) / S;
  const v = (y - CY) / (S / 2);
  return [(u + v) / 2, (v - u) / 2];
}

export const pts = (ps: readonly Pt[]): string => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

export const dpath = (ps: readonly Pt[]): string =>
  'M' + ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');

/* ── Curves between grid points ─────────────────────────────────────────── */

export function ctrl(a: Pt, b: Pt, bend: number): Pt {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  return [mx - (dy / L) * bend, my + (dx / L) * bend];
}

function bez(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

/** Points along a bent floor curve from grid a to grid b, lifted to z. */
export function curvePts(a: Pt, b: Pt, bend: number, z = 4, t0 = 0, t1 = 1, n = 40): Pt[] {
  const c = ctrl(a, b, bend);
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const g = bez(a, c, b, t0 + ((t1 - t0) * i) / n);
    out.push(P(g[0], g[1], z));
  }
  return out;
}

/** An arc that lifts off the floor between two points (a question hop). */
export function hopPts(a: Pt, b: Pt, z0: number, z1: number, h: number, n = 40): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z0 + (z1 - z0) * t + h * Math.sin(Math.PI * t)));
  }
  return out;
}
