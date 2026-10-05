import { useTranslation } from 'react-i18next';
import { InfoTip } from './InfoTip';

/**
 * The Beta pill, on every build (docs/designs/windows-11-installer.md, E4):
 * beside the version in Settings' About card and in the top bar. Its InfoTip
 * says where Report a problem is from where the pill sits.
 */
export function BetaPill({ info, align }: { info: string; align?: 'start' | 'end' }) {
  const { t } = useTranslation();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', borderRadius: 'var(--cth-r-pill)', padding: '1px 8px',
        fontSize: 10, lineHeight: '14px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
        background: 'var(--cth-lemon-light)', color: 'var(--cth-ink)'
      }}>{t('settingsHero.beta')}</span>
      <InfoTip label={t('settingsHero.beta')} text={info} align={align} />
    </span>
  );
}
