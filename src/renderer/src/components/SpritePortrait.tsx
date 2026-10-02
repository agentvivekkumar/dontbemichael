import type { OfficeCharacterName } from '@/scene/office/cast';
import { useAppTheme } from '@/design/theme';
import { departmentOf } from '@/scene/studio/layout';
import { family } from '@/scene/studio/theme';

export interface SpritePortraitProps {
  character: OfficeCharacterName;
  /** Size step, kept from the pixel-portrait days: 1 is 24px, 1.5 is 32px,
   *  2 is 40px. */
  scale?: number;
}

/**
 * A cast member as a design v2 avatar (branding/DESIGN.md 3.4, 7.10): the
 * initial on their usual department's pastel, Michael in ink. The pixel
 * portraits this used to paint are gone: the Struck M is the brand's only
 * pixel art. The name stays for its call sites.
 */
export function SpritePortrait({ character, scale = 2 }: SpritePortraitProps) {
  const dark = useAppTheme() === 'dark';
  const size = Math.round(Math.max(22, 16 * scale + 8));
  const isMichael = character === 'michael';
  const fam = isMichael ? null : family(departmentOf({ id: character, character }), dark);
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-grid', placeItems: 'center',
      background: fam ? fam.l : 'var(--cth-ink)', color: fam ? fam.acc : 'var(--cth-bg)',
      boxShadow: fam ? `inset 0 0 0 1px ${fam.m}` : 'none',
      fontFamily: 'var(--cth-font-ui)', fontSize: Math.round(size * 0.42), fontWeight: 700, lineHeight: 1
    }}>{character.slice(0, 1).toUpperCase()}</span>
  );
}
