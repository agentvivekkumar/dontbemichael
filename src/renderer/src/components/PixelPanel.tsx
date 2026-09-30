import { CSSProperties, ReactNode } from 'react';
import { AccentColorName } from '@/design/tokens';

type Variant = 'default' | 'inset' | 'active' | 'terminal' | 'dialog';

export interface PixelPanelProps {
  variant?: Variant;
  title?: string;
  accent?: AccentColorName;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  noPadding?: boolean;
}

// Design system v2 (branding/DESIGN.md 6.1): white cards on a hairline, soft
// shadow for raised surfaces, an inset tint for nested areas.
const borderByVariant: Record<Variant, string> = {
  default:  'inset 0 0 0 1px var(--cth-line)',
  inset:    'none',
  active:   'inset 0 0 0 1px var(--cth-line)',  // accent ring added separately
  terminal: 'inset 0 0 0 1px var(--cth-line-2)',
  dialog:   'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)'
};

const fillByVariant: Record<Variant, string> = {
  default:  'var(--cth-card)',
  inset:    'var(--cth-neutral-soft)',
  active:   'var(--cth-card)',
  terminal: 'var(--cth-card)',
  dialog:   'var(--cth-card)'
};

const radiusByVariant: Record<Variant, string> = {
  default:  'var(--cth-r-xl)',
  inset:    'var(--cth-r-lg)',
  active:   'var(--cth-r-xl)',
  terminal: 'var(--cth-r-lg)',
  dialog:   'var(--cth-r-2xl)'
};

export function PixelPanel({
  variant = 'default',
  title,
  accent,
  children,
  style,
  className,
  noPadding = false
}: PixelPanelProps) {
  const baseStyle: CSSProperties = {
    background: fillByVariant[variant],
    boxShadow: borderByVariant[variant],
    borderRadius: radiusByVariant[variant],
    padding: noPadding ? 0 : 'var(--cth-space-3)',
    position: 'relative',
    ...style
  };

  // Active variant: a 2px ring in the accent, plus the selection halo.
  if (variant === 'active' && accent) {
    baseStyle.boxShadow = `inset 0 0 0 2px var(--cth-${accent}), var(--cth-ring-select)`;
  }

  return (
    <div className={className} style={baseStyle}>
      {title && (
        <div
          style={{
            margin: noPadding ? 0 : '-12px -12px 12px',
            padding: '10px 12px 8px',
            color: accent ? `var(--cth-${accent})` : 'var(--cth-ink-3)',
            fontFamily: 'var(--cth-font-ui)',
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '13px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            boxShadow: 'inset 0 -1px 0 var(--cth-line)'
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
