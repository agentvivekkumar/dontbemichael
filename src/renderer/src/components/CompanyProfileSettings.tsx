import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cleanCompanyProfile, missingProfileFields, type CompanyProfile } from '@shared/companyProfile';
import { CompanyProfileFields } from './CompanyProfileFields';

export interface CompanyProfileDraft {
  name: string;
  profile: CompanyProfile;
}

/**
 * Settings, Company profile: every field of the company profile, editable
 * after setup (src/shared/companyProfile.ts). A save reaches running agents on
 * their next message (the hook delivers the profile when it changes), and the
 * page points to Memory & Knowledge for anything that isn't a short fact.
 * Settings owns the draft and saves it with the rest of the form, so changing
 * sections cannot discard the owner's edits.
 */
export function CompanyProfileSettings({ value, needsIndustry, onChange, onOpenKnowledge }: {
  value: CompanyProfileDraft;
  needsIndustry: boolean;
  onChange: (next: CompanyProfileDraft) => void;
  onOpenKnowledge: () => void;
}) {
  const { t } = useTranslation();
  const { name, profile } = value;
  const gaps = missingProfileFields(cleanCompanyProfile(profile), needsIndustry);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 14, lineHeight: '19px', color: 'var(--cth-ink-700)' }}>
        {t('companyProfile.intro')}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 14, color: 'var(--cth-ink-700)' }}>{t('onboarding.business.nameLabel')} *</span>
        <input value={name} onChange={(e) => onChange({ ...value, name: e.target.value })} style={inputStyle} />
      </label>
      <CompanyProfileFields
        value={profile}
        onChange={(next) => onChange({ ...value, profile: next })}
        parts={['essentials', 'details', 'hint']}
        needsIndustry={needsIndustry}
        missing={gaps}
        onOpenKnowledge={onOpenKnowledge}
      />
      {gaps.length > 0 && (
        <span role="status" style={{ fontSize: 14, color: 'var(--cth-ink-500)' }}>
          {t('companyProfile.stillMissing')}
        </span>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  padding: '6px 8px 4px', border: 'none',
  background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 14, color: 'var(--cth-ink-900)'
};
