import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { InfoTip } from './InfoTip';
import { useStore } from '@/store/store';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { workStyleBody } from '@shared/agentProfile';
import { decisionId, type WorkStyleOffer } from '@shared/workStyleUpdates';
import { decideWorkStyleOffer } from '@/shell/workStyleOffers';
import { refreshNeedsYou } from '@/shell/useNeedsYou';

/**
 * A new default job description for someone already hired
 * (shared/workStyleUpdates.ts): what changed in one line, the new text a
 * click away, and the owner's choice. Same frame as a schedule request card.
 */
export function WorkStyleUpdateCards({ offers }: { offers: WorkStyleOffer[] }) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const decide = async (offer: WorkStyleOffer, choice: 'use' | 'keep') => {
    const id = decisionId(offer.key, offer.agentId);
    setBusy(id);
    setFailed(null);
    try { await decideWorkStyleOffer(offer, choice); } catch { setFailed(id); }
    setBusy(null);
    refreshNeedsYou();
  };

  return (
    <>
      {offers.map((offer) => {
        const id = decisionId(offer.key, offer.agentId);
        const name = agents.find((a) => a.id === offer.agentId)?.name ?? offer.agentId;
        return (
          <section key={id} data-work-style-offer aria-label={t('askMe.workStyleTitle', { name })} style={{
            position: 'relative', flexShrink: 0, padding: '12px 14px', borderRadius: 'var(--cth-r-xl)',
            background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)',
            display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--cth-font-ui)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, lineHeight: '17px', color: 'var(--cth-ink)' }}>
              <span style={{
                width: 17, height: 17, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', flexShrink: 0,
                background: 'var(--cth-amber-soft)', color: 'var(--cth-amber-text)', fontSize: 9, fontWeight: 700
              }}>{name.slice(0, 1).toUpperCase()}</span>
              {t('askMe.workStyleTitle', { name })}
            </div>
            <div style={{ fontSize: 12, lineHeight: '16.5px', color: 'var(--cth-ink)' }}>
              {t(offer.whyKey)} <InfoTip text={t('askMe.workStyleReplaces', { name })} label={t('askMe.workStyleTitle', { name })} />
            </div>
            <button type="button" aria-expanded={open === id} onClick={() => setOpen((v) => (v === id ? null : id))} style={{
              alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, color: 'var(--cth-ink-2)', textDecoration: 'underline', textUnderlineOffset: 2
            }}>{open === id ? t('askMe.workStyleHide') : t('askMe.workStyleSee')}</button>
            {open === id && (
              <div style={{ borderRadius: 'var(--cth-r-md)', padding: '4px 10px', fontSize: 12, lineHeight: '17px', background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
                <MarkdownPreview source={workStyleBody(offer.goal)} variant="card" />
              </div>
            )}
            {failed === id && (
              <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>{t('schedulesSection.saveFailed')}</div>
            )}
            <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
              <PixelButton variant="secondary" size="sm" disabled={busy === id} onClick={() => void decide(offer, 'keep')}>{t('askMe.workStyleKeep')}</PixelButton>
              <PixelButton variant="primary" size="sm" disabled={busy === id} onClick={() => void decide(offer, 'use')}>{t('askMe.workStyleUse')}</PixelButton>
            </div>
          </section>
        );
      })}
    </>
  );
}
