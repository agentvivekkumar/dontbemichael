import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import type { AgentProvider } from '@shared/agentProvider';
import { engineSetupPhase, type EngineSetupStatus } from '@shared/engineSetup';
import { InfoTip } from './InfoTip';
import { PixelButton } from './PixelButton';
import { PtyTerminalView } from './PtyTerminalView';

/** The setup terminals main runs (src/main/engineSetup.ts). */
const INSTALL_PTY = 'engine-setup-install';
const SIGNIN_PTY = 'engine-setup-signin';
/** How often the step looks again while the owner signs in in the browser. */
const SIGNIN_POLL_MS = 2000;

/**
 * Get Michael ready (docs/designs/get-michael-ready.md): Claude Code on this
 * computer, and the owner's Claude account, as two rows. A missing Claude
 * installs on its own with Claude's standalone installer; sign in opens the
 * browser and the step notices when it is done. The terminals stay behind
 * Show details. Used as setup's last step and in the Ask me card's dialog.
 */
export function GetMichaelReady({ provider, onReadyChange }: {
  provider?: AgentProvider;
  onReadyChange?: (ready: boolean) => void;
}) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const [status, setStatus] = useState<EngineSetupStatus | undefined>();
  const [installing, setInstalling] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);
  const [browser, setBrowser] = useState(false);
  const [signInStuck, setSignInStuck] = useState(false);
  const [details, setDetails] = useState(false);
  const reads = useRef(0);
  const autoInstalled = useRef(false);

  const read = useCallback(async (): Promise<EngineSetupStatus | undefined> => {
    const mine = ++reads.current;
    try {
      const s = await window.cth.engineSetupStatus(provider);
      if (mine === reads.current) setStatus(s);
      return s;
    } catch {
      return undefined;
    }
  }, [provider]);

  const install = useCallback(async () => {
    setInstallFailed(false);
    setInstalling(true);
    const res = await window.cth.engineSetupInstall().catch(() => ({ ok: false }));
    if (!res.ok) { setInstalling(false); setInstallFailed(true); }
  }, []);

  const signIn = useCallback(async () => {
    setSignInStuck(false);
    const res = await window.cth.engineSetupSignIn().catch(() => ({ ok: false }));
    setBrowser(res.ok);
    if (!res.ok) setSignInStuck(true);
  }, []);

  // First look, then install at once when Claude is missing: the owner already
  // pressed Next to get here, so there is nothing to ask.
  useEffect(() => {
    void read().then((s) => {
      if (s && s.applies && !s.installed && !autoInstalled.current) {
        autoInstalled.current = true;
        void install();
      }
    });
  }, [read, install]);

  // A setup terminal ended: read again. An install that ended without Claude
  // found failed; a sign in that ended still signed out did not finish.
  useEffect(() => window.cth.onEngineSetupChanged((e) => {
    void read().then((s) => {
      if (!s) return;
      if (e.id === INSTALL_PTY) {
        setInstalling(false);
        setInstallFailed(!s.installed);
      }
      if (e.id === SIGNIN_PTY && s.signedIn === false) {
        setBrowser(false);
        setSignInStuck(true);
      }
    });
  }), [read]);

  // While the owner signs in in the browser, look every 2 s.
  useEffect(() => {
    if (!browser) return;
    const iv = setInterval(() => { void read(); }, SIGNIN_POLL_MS);
    return () => clearInterval(iv);
  }, [browser, read]);

  const phase = engineSetupPhase(status, { installing, installFailed, browser });
  const ready = phase === 'ready';
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  // A finished step has nothing to show behind Show details.
  useEffect(() => { if (ready) setDetails(false); }, [ready]);

  const detailsPty = phase === 'installing' || phase === 'installFailed' ? INSTALL_PTY
    : phase === 'browser' ? SIGNIN_PTY : null;
  const detailsToggle = detailsPty && (
    <button type="button" onClick={() => setDetails((d) => !d)} style={linkBtn}>
      {details ? t('engineSetup.hideDetails') : (phase === 'browser' ? t('engineSetup.showClaude') : t('engineSetup.showDetails'))}
    </button>
  );
  const terminal = details && detailsPty && (
    <div style={{ marginTop: 10, height: 168, borderRadius: 'var(--cth-r-md)', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--cth-line)' }}>
      <PtyTerminalView key={detailsPty} ptyId={detailsPty} embedded />
    </div>
  );

  const claudeRow = (() => {
    switch (phase) {
      case 'checking': return <Row icon={<Spinner />} tone="wait" label={t('engineSetup.claude')} status={t('engineSetup.checking')} />;
      case 'installing': return (
        <Row icon={<Spinner />} tone="wait" label={t('engineSetup.claude')} status={t('engineSetup.installing')}>
          <div className="cth-engine-bar" aria-hidden><i /></div>
          <div style={actions}>{detailsToggle}</div>
          {terminal}
        </Row>
      );
      case 'installFailed': return (
        <Row icon="!" tone="bad" label={t('engineSetup.claude')} status={t('engineSetup.installFailed')} bad>
          <div style={actions}>
            <PixelButton variant="primary" size="sm" onClick={() => { setDetails(false); void install(); }}>{t('engineSetup.tryAgain')}</PixelButton>
            {detailsToggle}
          </div>
          {terminal}
        </Row>
      );
      default: return <Row icon="✓" tone="ok" label={t('engineSetup.claude')} status={t('engineSetup.installed')} />;
    }
  })();

  const accountRow = (() => {
    switch (phase) {
      case 'checking':
      case 'installing':
      case 'installFailed':
        return <Row icon="·" tone="idle" label={t('engineSetup.account')} status={t('engineSetup.waitingInstall')} dim />;
      case 'signin': return (
        <Row icon="→" tone="idle" label={t('engineSetup.account')} status={signInStuck ? t('engineSetup.signInStuck') : t('engineSetup.signInWhy', { godName })} bad={signInStuck}>
          <div style={actions}><PixelButton variant="primary" size="sm" onClick={() => void signIn()}>{t('engineSetup.signIn')}</PixelButton></div>
        </Row>
      );
      case 'browser': return (
        <Row icon={<Spinner />} tone="wait" label={t('engineSetup.account')} status={t('engineSetup.inBrowser')}>
          <div style={actions}>
            <PixelButton variant="secondary" size="sm" onClick={() => void signIn()}>{t('engineSetup.openBrowserAgain')}</PixelButton>
            {detailsToggle}
          </div>
          {terminal}
        </Row>
      );
      default: return (
        <Row icon="✓" tone="ok" label={t('engineSetup.account')}
          status={status?.email ? t('engineSetup.signedInAs', { email: status.email }) : t('engineSetup.signedIn')} />
      );
    }
  })();

  return (
    <div role="group" aria-label={t('engineSetup.title', { godName })} aria-busy={phase === 'checking' || phase === 'installing'}
      style={{ display: 'flex', flexDirection: 'column', borderRadius: 'var(--cth-r-lg)', boxShadow: 'inset 0 0 0 1px var(--cth-line)' }}>
      {claudeRow}
      <div style={{ borderTop: '1px solid var(--cth-line)' }} />
      {accountRow}
    </div>
  );
}

/** The step's heading line: the title with its explanation behind an info icon. */
export function GetMichaelReadyInfo() {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  return <InfoTip text={t('engineSetup.info', { godName })} label={t('engineSetup.title', { godName })} />;
}

const TONES = {
  ok: { background: 'var(--cth-green-soft)', color: 'var(--cth-green-text)' },
  bad: { background: 'var(--cth-coral-soft)', color: 'var(--cth-coral-text)' },
  wait: { background: 'var(--cth-indigo-soft)', color: 'var(--cth-indigo-text)' },
  idle: { background: 'var(--cth-neutral-soft)', color: 'var(--cth-ink-2)' }
} as const;

function Row({ icon, tone, label, status, bad, dim, children }: {
  icon: ReactNode; tone: keyof typeof TONES; label: string; status: string; bad?: boolean; dim?: boolean; children?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, opacity: dim ? 0.55 : 1 }}>
      <span aria-hidden style={{ width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--cth-r-md)', fontSize: 13, ...TONES[tone] }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cth-ink)' }}>{label}</div>
        <div role={bad ? 'alert' : undefined} style={{ fontSize: 12, lineHeight: '18px', marginTop: 2, color: bad ? 'var(--cth-coral-text)' : 'var(--cth-ink-3)' }}>{status}</div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="cth-engine-spin" />;
}

const actions: React.CSSProperties = { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' };
const linkBtn: React.CSSProperties = {
  minHeight: 28, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-2)', textDecoration: 'underline'
};
