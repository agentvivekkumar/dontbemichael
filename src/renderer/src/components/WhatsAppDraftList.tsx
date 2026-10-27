import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { WhatsAppDraft } from '@shared/whatsappDrafts';
import { GrowingTextarea } from './GrowingTextarea';
import { MiniButton } from './triggers/ui';
import { hint, partLabel } from './fieldText';

/**
 * Draft only for WhatsApp: the drafts team members left on one number. The
 * Cloud API has no drafts folder, so they wait here; the owner reads each one,
 * edits it if needed, and sends it from the app or discards it.
 */
export function WhatsAppDraftList({ accountId, nameOf }: { accountId: string; nameOf: (agentId: string) => string }) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<WhatsAppDraft[]>([]);

  useEffect(() => {
    let live = true;
    const read = (): void => {
      window.cth.listWhatsAppDrafts({ accountId }).then((d) => { if (live) setDrafts(d); }).catch(() => { /* keep the last list */ });
    };
    read();
    const off = window.cth.onWhatsAppDraftsUpdated(read);
    return () => { live = false; off(); };
  }, [accountId]);

  if (!drafts.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <div style={partLabel}>{t('whatsapp.drafts', { count: drafts.length })}</div>
      {drafts.map((d) => <DraftRow key={d.id} d={d} name={nameOf(d.agentId)} />)}
    </div>
  );
}

function DraftRow({ d, name }: { d: WhatsAppDraft; name: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState(d.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.cth.sendWhatsAppDraft(d.id, text);
      if (!res.ok) setError(res.error);
    } catch {
      setError(t('capabilities.saveFailed'));
    }
    setBusy(false);
  };
  const discard = async (): Promise<void> => {
    setBusy(true);
    try { await window.cth.deleteWhatsAppDraft(d.id); } catch { /* the list stays as it was */ }
    setBusy(false);
  };

  return (
    <div style={card}>
      <div style={hint}>{t('whatsapp.draftFrom', { name, to: `⁨${d.to}⁩` })}</div>
      <GrowingTextarea
        className="cth-input"
        aria-label={t('whatsapp.draftFrom', { name, to: d.to })}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        maxHeight={240}
        dir="auto"
        style={field}
      />
      {error && <div role="alert" style={{ ...hint, color: 'var(--cth-coral-text)' }}>{t('whatsapp.draftFailed', { error })}</div>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <MiniButton onClick={() => void discard()} disabled={busy}>{t('whatsapp.draftDiscard')}</MiniButton>
        <MiniButton onClick={() => void send()} disabled={busy || !text.trim()}>{t('whatsapp.draftSend')}</MiniButton>
      </div>
    </div>
  );
}

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '8px 10px',
  borderRadius: 'var(--cth-r-lg)',
  background: 'var(--cth-card)',
  boxShadow: 'inset 0 0 0 1px var(--cth-line-2)'
};

const field: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  border: 'none',
  outline: 'none',
  background: 'var(--cth-card)',
  color: 'var(--cth-ink)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 12.5,
  lineHeight: '18px'
};
