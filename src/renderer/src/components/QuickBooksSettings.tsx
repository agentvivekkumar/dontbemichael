import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Toggle, MiniButton } from './triggers/ui';
import { useHarnessConfig } from '@/hooks/useHarnessConfig';

type Status = 'checking' | 'connected' | 'needs-sign-in' | 'not-added' | 'unknown';

const CLAUDE_CONNECTORS_URL = 'https://claude.ai/settings/connectors';

/**
 * Settings > Connections > QuickBooks (owner, 2026-09-29): the central switch
 * for the QuickBooks on the owner's Claude account. The app does not connect
 * to Intuit itself.
 *
 * - Off (the default): no agent can use it, and no Capabilities tab shows it.
 * - On: the app asks the Claude CLI whether the account has QuickBooks. When
 *   it does, who uses it is chosen on each Capabilities tab; when it doesn't,
 *   the steps to connect it in Claude, and Check again.
 */
export function QuickBooksSettings() {
  const { t } = useTranslation();
  const config = useHarnessConfig();
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Status>('checking');
  const on = config?.quickbooksClaude === true;

  // Only the latest check's answer is shown: an older, slower one can't
  // overwrite it.
  const latest = useRef(0);
  const check = useCallback(async (): Promise<void> => {
    const n = ++latest.current;
    setStatus('checking');
    let next: Status;
    try { next = await window.cth.quickbooksClaudeStatus(); } catch { next = 'unknown'; }
    if (n === latest.current) setStatus(next);
  }, []);
  // Checked when the section shows with the switch on, and when it turns on.
  useEffect(() => { if (on) void check(); }, [on, check]);

  if (!config) return null;

  const set = async (next: boolean): Promise<void> => {
    setFailed(false);
    try { await window.cth.updateConfig({ quickbooksClaude: next }); } catch { setFailed(true); }
  };

  const steps = [t('quickbooksSettings.step1'), t('quickbooksSettings.step2'), t('quickbooksSettings.step3'), t('quickbooksSettings.step4')];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 10, fontWeight: 600, lineHeight: '12px', color: 'var(--cth-ink-500)', textTransform: 'uppercase' }}>
            {t('quickbooksSettings.title')}
          </div>
          <div style={hint}>{t(on ? 'quickbooksSettings.introOn' : 'quickbooksSettings.introOff')}</div>
        </div>
        <Toggle on={on} label={t('quickbooksSettings.label')} onClick={() => { void set(!on); }} />
      </div>

      {failed && <div role="alert" style={{ fontSize: 13, color: 'var(--cth-ink-900)' }}>! {t('capabilities.saveFailed')}</div>}

      {on && (
        <div aria-live="polite" style={{ background: status === 'connected' ? 'var(--cth-mint-light)' : status === 'checking' ? 'var(--cth-paper-100)' : 'var(--cth-lemon-light)', padding: 12, fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-900)' }}>
          {status === 'checking' && <div>{t('quickbooksSettings.checking')}</div>}
          {status === 'connected' && <div>{t('quickbooksSettings.connected')}</div>}
          {status !== 'checking' && status !== 'connected' && (
            <>
              <div style={{ fontWeight: 600 }}>{t(`quickbooksSettings.${status === 'needs-sign-in' ? 'needsSignIn' : status === 'not-added' ? 'notAdded' : 'unknown'}`)}</div>
              <ol style={{ margin: '8px 0 0', paddingInlineStart: 20 }}>
                {steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <MiniButton onClick={() => { void window.cth.openExternal(CLAUDE_CONNECTORS_URL); }}>{t('quickbooksSettings.openClaude')}</MiniButton>
                <MiniButton onClick={() => { void check(); }}>{t('quickbooksSettings.checkAgain')}</MiniButton>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const hint: CSSProperties = { fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-500)' };
