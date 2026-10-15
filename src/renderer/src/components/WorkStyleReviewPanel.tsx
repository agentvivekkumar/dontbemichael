import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { workStyleBody } from '@shared/agentProfile';
import type { WorkStyleReview } from '@shared/workStyleReview';

/**
 * The instructions written from a work style, shown in place of the work style
 * box before Hire or Save keeps them (shared/workStyleReview.ts). Read only:
 * the owner changes the work style, not the instructions. A simpler rewrite,
 * made when the hidden call could not answer, says so.
 */
export function WorkStyleReviewPanel({ review, name, onChange, grow }: {
  review: WorkStyleReview;
  name: string;
  onChange: () => void;
  grow?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section
      data-work-style-review
      aria-label={t('workStyleReview.title', { name })}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(grow ? { flex: 1 } : {}) }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cth-ink-2)' }}>{t('workStyleReview.title', { name })}</span>
      <span style={helperStyle}>{t('workStyleReview.intro')}</span>
      {review.source === 'rules' && (
        <div role="status" style={simplerStyle}>{t('workStyleReview.simpler')}</div>
      )}
      <div style={{ ...boxStyle, ...(grow ? { flex: 1, minHeight: 320 } : { maxHeight: 320 }) }}>
        <MarkdownPreview source={workStyleBody(review.text)} variant="card" />
      </div>
      <button type="button" onClick={onChange} style={linkStyle}>{t('workStyleReview.change')}</button>
    </section>
  );
}

const helperStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: '18px',
  color: 'var(--cth-ink-3)'
};

/** The same paper box a work style update card opens its new text in. */
const boxStyle: CSSProperties = {
  overflowY: 'auto',
  borderRadius: 'var(--cth-r-md)',
  padding: '4px 10px',
  fontSize: 12.5,
  lineHeight: '18px',
  background: 'var(--cth-paper-100)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
};

/** The amber note the hire wizard uses for a hire from a file. */
const simplerStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--cth-r-md)',
  background: 'var(--cth-amber-soft)',
  boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--cth-amber) 35%, transparent)',
  fontSize: 12.5,
  lineHeight: '18px',
  color: 'var(--cth-ink)'
};

const linkStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 12.5,
  color: 'var(--cth-ink-2)',
  textDecoration: 'underline',
  textUnderlineOffset: 2
};
