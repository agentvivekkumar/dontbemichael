import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';
import { clearLocalState } from './SettingsModal';
import type { HarnessConfig } from '@/store/config';

function folderName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

/**
 * "We can't find your office." Shown at launch ONLY when the office folder
 * (config.harnessHome) has gone missing: moved, renamed or deleted. Every normal
 * launch goes straight to the floor; switching folders on purpose lives in
 * Settings → General (owner, 2026-09-24). It replaced a picker that asked on
 * EVERY launch which "harness config" to open.
 *
 * Main has not bootstrapped anything at this point (homeFolder.ts), so nothing
 * rebuilt an empty office at the old path behind the owner's back. Each way out
 * relaunches the app against a real office.
 */
export function OfficeFolderMissing({ config }: { config: HarnessConfig }) {
  const { t } = useTranslation();
  const missing = config.harnessHome ?? '';
  const [recents, setRecents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [confirmStartOver, setConfirmStartOver] = useState(false);

  // Offer only recent folders that still hold an office: a dead entry here
  // would lead straight back to this screen.
  useEffect(() => {
    let alive = true;
    const candidates = (config.recentHives ?? []).filter((h) => h && h !== missing);
    void Promise.all(candidates.map((h) => window.cth.homeStatus(h).then((s) => (s.hasOffice ? h : null)).catch(() => null)))
      .then((ok) => { if (alive) setRecents(ok.filter((h): h is string => !!h)); });
    return () => { alive = false; };
  }, [config.recentHives, missing]);

  /** Switch to a folder that holds an office. The same office, moved, so the
   *  renderer's saved state stays. Success relaunches and never returns. */
  const openOffice = async (path: string) => {
    setError(undefined);
    setBusy(true);
    const status = await window.cth.homeStatus(path).catch(() => null);
    if (!status?.hasOffice) {
      setError(t('officeMissing.notAnOffice'));
      setBusy(false);
      return;
    }
    const res = await window.cth.changeHome(path, 'fresh').catch((e) => ({ ok: false, error: String(e) }));
    if (!res.ok) { setError(res.error ?? t('officeMissing.couldNotOpen')); setBusy(false); }
  };

  const find = async () => {
    setError(undefined);
    const res = await window.cth.chooseFolder();
    if (res.ok) void openOffice(res.path);
    else if (res.error !== 'cancelled') setError(res.error);
  };

  const startOver = async () => {
    setError(undefined);
    setBusy(true);
    // An empty office: the old team's cards must not come back with it.
    clearLocalState();
    const res = await window.cth.startOverHere().catch((e) => ({ ok: false, error: String(e) }));
    if (!res.ok) { setError(res.error ?? t('officeMissing.couldNotOpen')); setBusy(false); }
  };

  const sectionLabel = { fontFamily: 'var(--cth-font-display)', fontSize: 9, color: 'var(--cth-ink-500)', marginBottom: 4 } as const;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--cth-cream-200)',
      backgroundImage: 'repeating-linear-gradient(45deg, rgba(232, 217, 160, 0.4) 0 1px, transparent 1px 8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 32
    }}>
      <div style={{ width: 560, maxWidth: '94vw' }}>
        <PixelPanel variant="dialog" title={t('officeMissing.title')} noPadding>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
              {t('officeMissing.body')}
            </p>
            <div style={{
              padding: '8px 12px', fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-700)',
              background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
              wordBreak: 'break-all'
            }}>{missing}</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
              {t('officeMissing.whyItMatters')}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PixelButton variant="primary" size="md" onClick={find} disabled={busy}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="folder" /> {t('officeMissing.find')}
                </span>
              </PixelButton>
              <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('officeMissing.findHint')}</span>
            </div>

            {recents.length > 0 && (
              <div>
                <div style={sectionLabel}>{t('officeMissing.recent')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {recents.map((h) => (
                    <button
                      key={h}
                      onClick={() => { void openOffice(h); }}
                      disabled={busy}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                        border: 'none', cursor: busy ? 'default' : 'pointer', textAlign: 'left'
                      }}
                    >
                      <Icon name="folder" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
                          {folderName(h)}
                        </div>
                        <div style={{
                          fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', direction: 'rtl', textAlign: 'left'
                        }}>{h}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--cth-ink-300)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!confirmStartOver ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <PixelButton variant="secondary" size="sm" onClick={() => setConfirmStartOver(true)} disabled={busy}>
                    {t('officeMissing.startOver')}
                  </PixelButton>
                  <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('officeMissing.startOverHint')}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--cth-ink-900)', fontWeight: 600 }}>{t('officeMissing.startOverConfirm')}</span>
                  <PixelButton variant="primary" size="sm" onClick={() => { void startOver(); }} disabled={busy}>
                    {t('officeMissing.startOverYes')}
                  </PixelButton>
                  <PixelButton variant="ghost" size="sm" onClick={() => setConfirmStartOver(false)} disabled={busy}>
                    {t('common.cancel')}
                  </PixelButton>
                </div>
              )}
            </div>

            {error && <div style={{ fontSize: 12, lineHeight: '18px', color: '#6E1423' }}>{error}</div>}
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
