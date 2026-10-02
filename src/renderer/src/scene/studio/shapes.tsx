/** SVG primitives on the studio grid (branding/DESIGN.md 8.1). */
import type { SVGProps } from 'react';
import type { SceneTokens } from './theme';
import { P, S, pts, type Pt } from './iso';

type PolyProps = Omit<SVGProps<SVGPolygonElement>, 'points' | 'fill'> & { ps: readonly Pt[]; fill: string };

/** A filled face. The stroke in the same color closes the hairline seams
 *  anti-aliasing leaves between neighbouring faces. */
export function Poly({ ps, fill, ...rest }: PolyProps) {
  return <polygon points={pts(ps)} fill={fill} stroke={fill} strokeWidth={0.6} strokeLinejoin="round" {...rest} />;
}

/** A box on the grid: origin (gx, gy), size (w, d, h), sitting at height z0. */
export function Box({ gx, gy, w, d, h, z0, top, left, right, rim = true, T, opacity }: {
  gx: number; gy: number; w: number; d: number; h: number; z0: number;
  top: string; left: string; right: string; rim?: boolean; T: SceneTokens; opacity?: number;
}) {
  const t = [P(gx, gy, z0 + h), P(gx + w, gy, z0 + h), P(gx + w, gy + d, z0 + h), P(gx, gy + d, z0 + h)];
  const l = [P(gx, gy + d, z0), P(gx + w, gy + d, z0), P(gx + w, gy + d, z0 + h), P(gx, gy + d, z0 + h)];
  const r = [P(gx + w, gy, z0), P(gx + w, gy + d, z0), P(gx + w, gy + d, z0 + h), P(gx + w, gy, z0 + h)];
  return (
    <g opacity={opacity}>
      <Poly ps={l} fill={left} />
      <Poly ps={r} fill={right} />
      <Poly ps={t} fill={top} />
      {rim && (
        <polyline
          points={pts([P(gx, gy + d, z0 + h), P(gx + w, gy + d, z0 + h), P(gx + w, gy, z0 + h)])}
          fill="none" stroke={T.rim} strokeOpacity={T.rimOp} strokeWidth={1} strokeLinejoin="round"
        />
      )}
    </g>
  );
}

/** A flat ellipse of grid radius r at (gx, gy, z). */
export function EllipseAt({ gx, gy, z, r, ...rest }: { gx: number; gy: number; z: number; r: number } & Omit<SVGProps<SVGEllipseElement>, 'cx' | 'cy' | 'rx' | 'ry'>) {
  const [x, y] = P(gx, gy, z);
  const rx = r * S * Math.SQRT2;
  return <ellipse cx={x} cy={y} rx={rx} ry={rx / 2} {...rest} />;
}

