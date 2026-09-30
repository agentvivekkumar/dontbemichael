import { useEffect, useRef, useState } from 'react';
import { useStore, selectedAgent, ROSTER_BOOT_HOME } from '@/store/store';
import { rosterNeedsReload } from '@/store/rosterSource';
import { startMockLoop, stopMockLoop } from '@/store/mockEvents';
import type { HarnessConfig } from '@/store/config';
import { DEFAULT_ORG_TRIGGER } from '@shared/triggers';
import { StudioStage } from '@/scene/studio/StudioStage';
import { FloorViewIntro } from '@/components/FloorViewToggle';
import { TasksKanban } from '@/components/TasksKanban';
import { MemoryGraphPanel } from '@/components/MemoryGraphPanel';
import { useHive } from '@/hooks/useHive';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useGodNameSync } from '@/i18n/useGodNameSync';
import { useDirectionSync } from '@/i18n/useDirection';
import { useArabicTerminalSync } from '@/terminal/useArabicTerminalSync';
import { AgentDetailPanel } from '@/components/AgentDetailPanel';
import { AddAgentModal } from '@/components/AddAgentModal';
import { MichaelBooting } from '@/components/MichaelBooting';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { OfficeFolderMissing } from '@/components/OfficeFolderMissing';
import { QuitWarningModal, type ClosingTimeState } from '@/components/QuitWarningModal';
import { CompletionToast } from '@/realtime/CompletionToast';
import { UpdateToast } from '@/components/UpdateToast';
import { CliUpdateToast } from '@/components/CliUpdateNotice';
import { SettingsModal, type Section as SettingsSection } from '@/components/SettingsModal';
import { PixelPanel } from '@/components/PixelPanel';
import { PixelButton } from '@/components/PixelButton';
import { SidebarSplitter } from '@/components/SidebarSplitter';
import { acquireTerminal } from '@/components/terminalPool';
import { FullscreenTerminal } from '@/components/FullscreenTerminal';
import { TaskDetailOverlay } from '@/components/TaskDetailOverlay';
import { IdePanel } from '@/ide/IdePanel';
import { SHOW_IDE, SHOW_OFFICE_THEME } from '@shared/buildFeatures';
import { useHoldOptionToTalk } from '@/freeflow/holdOption';
import { useTranslation } from 'react-i18next';
import { TopBar, NeedsYouStrip } from '@/shell/TopBar';
import { NeedsYouBoard } from '@/shell/NeedsYouBoard';
import { BottomBar } from '@/shell/BottomBar';

// Injected at build time from package.json (see electron.vite.config.ts).
declare const __APP_VERSION__: string;

export function App() {
  // Point every {{godName}} string at the orchestrator's real, renameable name.
  useGodNameSync();
  // Mirror the document only for a user who has picked an RTL app language.
  useDirectionSync();
  // Let terminals that are ALREADY open follow a language switch too.
  useArabicTerminalSync();
  const agent = useStore(selectedAgent);
  const agents = useStore(s => s.agents);
  const agentCount = agents.length;
  const addAgentOpen = useStore(s => s.addAgentOpen);
  const setAddAgentOpen = useStore(s => s.setAddAgentOpen);
  const clearPendingHires = useStore(s => s.clearPendingHires);
  const godStatus = useStore(s => s.godStatus);
  const fullscreenAgentId = useStore(s => s.fullscreenAgentId);
  const { t } = useTranslation();
  const needsYouOpen = useStore(s => s.needsYouOpen);
  const sidebarWidth = useStore(s => s.sidebarWidth);
  const setSidebarWidth = useStore(s => s.setSidebarWidth);
  const ideOpen = useStore(s => s.ideOpen);
  const setIdeOpen = useStore(s => s.setIdeOpen);
  const floorView = useStore(s => s.floorView);
  const godId = useStore(s => s.agents.find((a) => a.isGod)?.id) ?? 'god';

  const [config, setConfig] = useState<HarnessConfig | null>(null);
  // Is the office folder there? Checked once per launch. 'ok' goes straight to
  // the floor; 'missing' (moved, renamed or deleted) shows OfficeFolderMissing.
  // There is no picker on a normal launch any more: switching folders on
  // purpose lives in Settings → General (owner, 2026-09-24).
  const [homeState, setHomeState] = useState<'checking' | 'ok' | 'missing'>('checking');
  const hiveOpened = homeState === 'ok';
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Which tab Settings opens on. Set by a `cth:open-settings` deep link, reset
   *  to undefined (→ General) whenever the modal is opened the normal way. */
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined);
  const [quitWarn, setQuitWarn] = useState<{ ptyCount: number } | null>(null);
  const [closing, setClosing] = useState<ClosingTimeState | null>(null);
  const [vpWidth, setVpWidth] = useState<number>(window.innerWidth);

  // Deep link into Settings from anywhere in the tree. Settings' open state is
  // local to App, so a nested control (e.g. "set it now" beside a disabled Talk
  // button) has no path to it without threading a prop through every layer
  // between; a window event keeps that plumbing out of the components in
  // between, matching the existing `cth:` CustomEvent convention.
  useEffect(() => {
    const onOpenSettings = (e: Event): void => {
      const section = (e as CustomEvent<{ section?: SettingsSection }>).detail?.section;
      setSettingsSection(section);
      setSettingsOpen(true);
    };
    window.addEventListener('cth:open-settings', onOpenSettings);
    return () => window.removeEventListener('cth:open-settings', onOpenSettings);
  }, []);

  // Initial config load
  useEffect(() => {
    let cancelled = false;
    window.cth.getConfig().then(c => {
      if (cancelled) return;
      setConfig(c);
      // Mirror the Free Flow flag into the store so the composer mic button shows
      // only when enabled (Settings keeps this in sync on save).
      useStore.getState().setFreeflowEnabled(!!c.freeflowEnabled);
      // Mirror boolean key-presence ONLY (never the key value) so the composer can
      // show the voice button disabled-with-tooltip when Free Flow is on but no
      // Groq key is set (Settings keeps this in sync on save).
      useStore.getState().setHasGroqKey(!!c.groqApiKey);
      // Mirror the active office theme so OfficeFloor renders it (gated on the
      // tvShowOffices flag; off = always the office). Settings keeps this synced.
      // With the picker hidden (SHOW_OFFICE_THEME) it is always the office.
      useStore.getState().setOfficeTheme(SHOW_OFFICE_THEME && c.tvShowOffices ? (c.officeTheme ?? 'office') : 'office');
      // Mirror the triggers so Settings → Connections and the Command Center's
      // Triggers tab read one list, not two copies that drift — whichever surface
      // saves calls these same setters and the other repaints. No extra IPC: main
      // deep-fills both fields on every config read (withTriggerDefaults), so
      // getConfig() already serves what listWebhooks()/getOrgTrigger() would.
      // `c` is typed as the PRELOAD's HarnessConfig, which hasn't picked the two
      // fields up yet (another lane's file); the renderer mirror type declares them.
      const withTriggers = c as HarnessConfig;
      useStore.getState().setWebhookTriggers(withTriggers.webhookTriggers ?? []);
      useStore.getState().setOrgTrigger(withTriggers.orgTrigger ?? DEFAULT_ORG_TRIGGER);
    });
    // Mirror BYOK OpenAI key presence (boolean only; the key never leaves main) so the
    // Realtime Michael voice toggle can gate on it. Lives in the secret broker, not
    // config — so fetch it rather than derive from c.
    window.cth.realtimeHasOpenAiKey().then(has => {
      if (!cancelled) useStore.getState().setHasOpenAiKey(has);
    });
    return () => { cancelled = true; };
  }, []);

  // Free Flow entry point B — hold-Option (⌥) to talk. In-renderer push-to-talk
  // for whichever agent the user is viewing; gated on the flag, terminal-safe
  // (solo-hold threshold, aborts on any other key). See freeflow/holdOption.ts.
  useHoldOptionToTalk();

  // Config subscription — the copy loaded above would otherwise go stale the
  // moment anything saves a setting.
  useEffect(() => window.cth.onConfigChanged(setConfig), []);

  // Quit warning subscription
  useEffect(() => window.cth.onCloseRequested((info) => setQuitWarn(info)), []);

  // Shareable hires: a validated manifest arriving via the dontbemichael://
  // deep link (or file import) pre-fills the Add-Agent modal. Never spawns by itself.
  const enqueuePendingHires = useStore(s => s.enqueuePendingHires);
  const closeAddAgentReview = () => {
    clearPendingHires();
    setAddAgentOpen(false);
  };
  useEffect(() => {
    const unsub = window.cth.onHireImport?.((m) => {
      enqueuePendingHires([m]);
      setAddAgentOpen(true);
    });
    // Pull anything that arrived before this subscription existed (cold-start
    // deep links; packaged renderers load too fast for push-on-load).
    void window.cth.drainPendingHires?.().then((queued) => {
      if (queued && queued.length > 0) {
        enqueuePendingHires(queued);
        setAddAgentOpen(true);
      }
    });
    return unsub;
  }, [enqueuePendingHires, setAddAgentOpen]);
  useEffect(() => window.cth.onHireError?.((info) => {
    console.error('[hire] import failed:', info.error);
  }), []);

  // Closing-time progress: drives the quit dialog's "wrapping up" view. The
  // dialog stays up through the whole protocol; on 'complete' the main process
  // tears down and quits by itself moments later.
  useEffect(() => window.cth.onClosingTime?.((ev) => {
    const { phase, ...rows } = ev;
    if (phase === 'cancelled') { setClosing(null); return; }
    // Every field main sends reaches the dialog; none is copied by hand.
    setClosing({ phase, ...rows });
    if (phase === 'started' || phase === 'progress') setQuitWarn((w) => w ?? { ptyCount: 0 });
  }), []);

  const startClosingTime = async (opts?: { relaunch?: boolean }): Promise<boolean> => {
    const res = await window.cth.startClosingTime(opts);
    if (!res.ok) setClosing({ phase: 'error', acked: 0, total: 0, error: res.error });
    return res.ok;
  };
  // The owner asked to reopen (CliUpdateNotice). Kept until they cancel, so a
  // retry from the quit dialog (after a refused start) still reopens.
  const reopenAsked = useRef(false);
  // A Claude Code update is waiting (CliUpdateNotice): the owner's click closes
  // the office the safe way, then the app reopens on the new version.
  const closeOfficeAndReopen = (liveAgents: number): Promise<boolean> => {
    reopenAsked.current = true;
    setQuitWarn((w) => w ?? { ptyCount: liveAgents });
    return startClosingTime({ relaunch: true });
  };
  const cancelClosingTime = () => {
    void window.cth.cancelClosingTime();
    setClosing(null);
  };

  // The hive: god-agent bootstrap, hook-driven avatars, idle-agent waking. Held
  // off (passing null no-ops the hook) until the office folder check passes
  // (homeState 'ok'), so Michael never boots against a missing office.
  useEffect(() => {
    if (!config?.onboardingComplete || homeState !== 'checking') return;
    let alive = true;
    window.cth.homeStatus()
      .then((st) => { if (alive) setHomeState(st.hasOffice ? 'ok' : 'missing'); })
      // A failed check must not lock the owner out of a healthy office.
      .catch(() => { if (alive) setHomeState('ok'); });
    return () => { alive = false; };
  }, [config?.onboardingComplete, homeState]);
  useHive(hiveOpened ? config : null);

  // Pre-warm a persistent terminal for every live agent so its output is
  // buffered from spawn. Switching agents then re-attaches an already-rendered
  // terminal instantly (with full history) instead of building a blank one.
  useEffect(() => {
    for (const a of agents) if (a.ptyId) acquireTerminal(a.ptyId);
  }, [agents]);

  // Synthetic demo loop — CAGED (#5B). It must never animate alongside a live
  // hive (it would fire fake envelope handoffs and step seeded agents). Run it
  // only as an explicit showcase (VITE_CTH_DEMO=1 in dev) or on a genuinely
  // empty floor, and stop it the instant the first real PTY agent appears
  // (Michael always spawns, so in normal operation it effectively never runs).
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    const DEMO = import.meta.env.DEV && import.meta.env.VITE_CTH_DEMO === '1';
    const evaluate = () => {
      const hasLive = useStore.getState().agents.some((a) => a.ptyId);
      if (DEMO || !hasLive) startMockLoop();
      else stopMockLoop();
    };
    evaluate();
    const unsub = useStore.subscribe(evaluate);
    return () => { unsub(); stopMockLoop(); };
  }, [config?.onboardingComplete]);

  // Reconcile restored agents against the PTYs still alive in the main process.
  // After a renderer reload (e.g. the laptop slept and Vite reloaded the page),
  // this keeps agents whose process survived and drops any that truly died.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    let cancelled = false;
    window.cth.listPtys().then((list) => {
      if (cancelled) return;
      useStore.getState().reconcileWithLivePtys(list.map((p) => p.id));
    }).catch(() => { /* ignore — keep restored agents as-is */ });
    return () => { cancelled = true; };
  }, [config?.onboardingComplete]);

  // Re-apply the persisted focus-mode preference as the roster fills in.
  //
  // Not a one-shot at store construction: at launch every restored agent still
  // carries the PREVIOUS session's PTY id, so the reconcile above prunes the lot
  // and correctly drops focus mode to null before god has respawned. The
  // preference therefore has to be re-checked once agents with live terminals
  // actually exist. `restoreFocusMode` is a no-op unless the preference is on and
  // focus mode is currently off, so re-running it on every roster change is safe
  // and pressing Esc stays sticky.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    useStore.getState().restoreFocusMode();
  }, [config?.onboardingComplete, agents]);

  // Track viewport width for splitter clamping
  useEffect(() => {
    const onResize = () => setVpWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!config) {
    return <div style={{ width: '100vw', height: '100vh', background: 'var(--cth-cream-100)' }} />;
  }

  if (!config.onboardingComplete) {
    // Just-onboarded users go straight into the office they set up (homeState 'ok').
    // If setup chose an office the store was not built for, reload first so the
    // floor reads that office's roster instead of saving an empty one over it
    // (rosterSource.ts, rosterNeedsReload).
    return <OnboardingWizard onComplete={(next) => {
      if (rosterNeedsReload(ROSTER_BOOT_HOME, next.harnessHome)) { window.location.reload(); return; }
      setConfig(next); setHomeState('ok');
    }} />;
  }

  if (homeState === 'checking') {
    return <div style={{ width: '100vw', height: '100vh', background: 'var(--cth-cream-100)' }} />;
  }
  if (homeState === 'missing') {
    return <OfficeFolderMissing config={config} />;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw', height: '100vh',
      overflow: 'hidden', background: 'var(--cth-bg)'
    }}>
      {/* Toasts: voice completions, app updates, Claude Code updates. Each one
          positions itself and renders null until it has something to say. */}
      <CompletionToast />
      <UpdateToast />
      <CliUpdateToast onCloseAndReopen={closeOfficeAndReopen} />

      {/* Design v2 shell (branding/DESIGN.md 5.2): top bar, the stage with the
          bottom bar floating over it, and the right column. No agent strip and
          no permanent Command Center: people live on the stage. */}
      <TopBar onOpenSettings={() => { setSettingsSection(undefined); setSettingsOpen(true); }} />

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative', background: 'var(--cth-bg)' }}>
          <StudioStage config={config} />
          {agentCount === 0 && godStatus === 'booting' && <MichaelBooting />}
          {agentCount === 0 && godStatus !== 'booting' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{ pointerEvents: 'auto', width: 340 }}>
                <PixelPanel variant="dialog" noPadding>
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>{t('shell.noAgentTitle')}</div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-2)' }}>{t('shell.noAgentBody')}</p>
                    <PixelButton variant="primary" size="md" onClick={() => setAddAgentOpen(true)}>{t('shell.hire')}</PixelButton>
                  </div>
                </PixelPanel>
              </div>
            </div>
          )}
          {floorView !== 'office' && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', flexDirection: 'column',
              // Room for the floating bottom bar, so it never covers the last cards.
              paddingBottom: 96,
              background: 'var(--cth-bg)'
            }}>
              <FloorViewIntro view={floorView} />
              {floorView === 'tasks' && <TasksKanban />}
              {floorView === 'graph' && (
                <MemoryGraphPanel godId={godId} onJumpToMemory={(id) => useStore.getState().openAgentMemory(id)} />
              )}
            </div>
          )}
          <BottomBar config={config} />
        </div>

        <SidebarSplitter
          width={sidebarWidth}
          onChange={setSidebarWidth}
          viewportWidth={vpWidth}
        />

        <div style={{
          width: sidebarWidth, flexShrink: 0, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(var(--cth-rail), var(--cth-rail))',
          borderInlineStart: '1px solid var(--cth-line)'
        }}>
          {needsYouOpen || !agent ? (
            <NeedsYouBoard config={config} />
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 12px 0' }}>
              <NeedsYouStrip />
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <AgentDetailPanel agent={agent} />
              </div>
            </div>
          )}
        </div>
      </div>

      {addAgentOpen && (
        <AddAgentModal
          onClose={closeAddAgentReview}
          config={config}
          onConfigChange={setConfig}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          config={config}
          initialSection={settingsSection}
          onClose={() => { setSettingsOpen(false); setSettingsSection(undefined); }}
        />
      )}

      {quitWarn && (
        <QuitWarningModal
          ptyCount={quitWarn.ptyCount}
          closing={closing}
          onCancel={() => {
            reopenAsked.current = false;
            if (closing) cancelClosingTime();
            window.cth.cancelClose();
            setQuitWarn(null);
          }}
          onConfirm={async () => { await window.cth.confirmClose(); }}
          onClosingTime={() => { void startClosingTime(reopenAsked.current ? { relaunch: true } : undefined); }}
        />
      )}

      {fullscreenAgentId && <FullscreenTerminal config={config} />}
      {SHOW_IDE && ideOpen && <IdePanel />}
      <TaskDetailOverlay />
    </div>
  );
}
