import type { OfficeCharacterName } from '@/scene/office/cast';
import { PersonAvatar } from '@/scene/office/props';

export interface SpritePortraitProps {
  character: OfficeCharacterName;
  /** Size step, kept from the pixel-portrait days: 1 is 24px, 1.5 is 32px,
   *  2 is 40px. */
  scale?: number;
}

/**
 * A cast member as their avatar (branding/DESIGN.md 3.4, 7.10): their
 * signature prop on their usual department's pastel, Michael's mug on ink.
 * The name stays for its call sites.
 */
export function SpritePortrait({ character, scale = 2 }: SpritePortraitProps) {
  const size = Math.round(Math.max(22, 16 * scale + 8));
  return <PersonAvatar who={{ id: character, character, isGod: character === 'michael' }} size={size} />;
}
