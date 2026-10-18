import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import type { WhatsAppAccountRecord } from '@shared/whatsapp';

export function AddWhatsAppDialog({
  fix,
  onClose,
  onSaved
}: {
  fix?: WhatsAppAccountRecord;
  onClose: () => void;
  onSaved: (rec: WhatsAppAccountRecord) => void;
}) {
  const { t } = useTranslation();
  const [phoneNumberId, setPhoneNumberId] = useState(fix?.phoneNumberId ?? '');
  const [wabaId, setWabaId] = useState(fix?.wabaId ?? '');
  const [label, setLabel] = useState(fix?.label ?? '');
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState(fix?.displayPhoneNumber ?? '');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (fix ? tokenRef.current : firstRef.current)?.focus();
  }, [fix]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
      e.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (e.key !== 'Tab' || !boxRef.current) return;
    const items = [...boxRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.cth.whatsappSave({
        id: fix?.id,
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim() || undefined,
        label: label.trim(),
        displayPhoneNumber: displayPhoneNumber.trim() || undefined,
        token: token.trim()
      });
      setBusy(false);
      if (res.ok) {
        onSaved(res.record);
      } else {
        setError(res.reason);
      }
    } catch (e: unknown) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      style={backdropStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-whatsapp-title"
        onKeyDown={onKeyDown}
        style={dialogCardStyle}
      >
        <h2 id="add-whatsapp-title" style={titleStyle}>
          {fix ? t('whatsapp.fixTitle', 'Fix WhatsApp Business connection') : t('whatsapp.addTitle', 'Connect WhatsApp Business')}
        </h2>

        <p style={introStyle}>
          {t('whatsapp.dialogIntro', 'Enter your WhatsApp Business Cloud API details from Meta for Developers. Tokens are encrypted and stored locally.')}
        </p>

        {error && (
          <div role="alert" style={errorBannerStyle}>
            ! {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="wa-phone-id" style={labelStyle}>
              {t('whatsapp.phoneIdLabel', 'Phone Number ID *')}
            </label>
            <input
              id="wa-phone-id"
              ref={firstRef}
              type="text"
              disabled={busy || !!fix}
              placeholder="e.g. 104958291823912"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="wa-label" style={labelStyle}>
              {t('whatsapp.accountLabel', 'Label / Line Name *')}
            </label>
            <input
              id="wa-label"
              type="text"
              disabled={busy}
              placeholder="e.g. Customer Support WhatsApp"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="wa-display-num" style={labelStyle}>
              {t('whatsapp.displayPhoneLabel', 'Display Phone Number (optional)')}
            </label>
            <input
              id="wa-display-num"
              type="text"
              disabled={busy}
              placeholder="e.g. +1 (555) 234-5678"
              value={displayPhoneNumber}
              onChange={(e) => setDisplayPhoneNumber(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="wa-waba-id" style={labelStyle}>
              {t('whatsapp.wabaIdLabel', 'WhatsApp Business Account ID (WABA ID, optional)')}
            </label>
            <input
              id="wa-waba-id"
              type="text"
              disabled={busy}
              placeholder="e.g. 192837465019283"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="wa-token" style={labelStyle}>
              {t('whatsapp.tokenLabel', 'Cloud API Permanent Access Token *')}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="wa-token"
                ref={tokenRef}
                type={showToken ? 'text' : 'password'}
                disabled={busy}
                placeholder="EAAG..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                style={showBtnStyle}
              >
                {showToken ? t('mailboxes.hide', 'Hide') : t('mailboxes.show', 'Show')}
              </button>
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={cancelBtnStyle}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <PixelButton
            variant="primary"
            disabled={busy || !phoneNumberId.trim() || !label.trim() || !token.trim()}
            onClick={() => void save()}
          >
            {busy ? t('whatsapp.testing', 'Testing connection...') : fix ? t('whatsapp.saveChanges', 'Save & Connect') : t('whatsapp.connect', 'Test & Connect')}
          </PixelButton>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'var(--cth-backdrop)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16
};

const dialogCardStyle: CSSProperties = {
  background: 'var(--cth-canvas-card, #FFFDF5)',
  border: '1px solid var(--cth-ink-200, #E0DFDB)',
  boxShadow: 'var(--cth-shadow-dialog, 0 16px 32px rgba(0,0,0,0.2))',
  borderRadius: 'var(--cth-radius-card, 4px)',
  width: '100%',
  maxWidth: 500,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16
};

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  fontFamily: 'var(--cth-font-display, inherit)',
  margin: 0,
  color: 'var(--cth-ink-900)'
};

const introStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: '18px',
  color: 'var(--cth-ink-500)',
  margin: 0
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: 'var(--cth-ink-700)'
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: 'inherit',
  border: '1px solid var(--cth-ink-200)',
  borderRadius: 2,
  background: 'var(--cth-canvas-input, #FFFFFF)',
  color: 'var(--cth-ink-900)'
};

const showBtnStyle: CSSProperties = {
  border: '1px solid var(--cth-ink-200)',
  background: 'transparent',
  padding: '0 10px',
  fontSize: 12,
  cursor: 'pointer',
  borderRadius: 2,
  color: 'var(--cth-ink-700)'
};

const errorBannerStyle: CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  background: 'var(--cth-coral-light, #FFE6E6)',
  color: 'var(--cth-coral-dark, #A01010)',
  borderRadius: 2
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 8
};

const cancelBtnStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: '6px 12px',
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--cth-ink-700)'
};
