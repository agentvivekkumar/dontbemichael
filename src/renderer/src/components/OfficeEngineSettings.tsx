import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BUILD_ENGINES,
  providerPreset,
  inferAgentProvider,
  type AgentProvider
} from '@shared/agentProvider';
import {
  classifyEngineAvailability,
  type EngineAvailability
} from '@shared/engineAvailability';
import type { ToolStatus } from '@shared/toolCatalog';
import {
  modelsForProvider,
  buildSpawnCommand,
  type HarnessConfig
} from '@/store/config';
import { useStore } from '@/store/store';
import { ProviderLogo } from './ProviderLogo';
import { PixelButton } from './PixelButton';
import { useRestoreTeam } from '@/hooks/useRestoreTeam';
import { refreshNeedsYou } from '@/shell/useNeedsYou';

export interface OfficeEngineSettingsProps {
  config: HarnessConfig;
  stage: (patch: Partial<HarnessConfig>) => void;
  godName?: string;
}

const PROVIDER_SUBTITLES: Record<AgentProvider, string> = {
  claude: 'Anthropic',
  antigravity: 'Google DeepMind',
  gemini: 'Google',
  codex: 'OpenAI',
  grok: 'xAI',
  cursor: 'Cursor',
  qwen: 'Alibaba',
  opencode: 'OpenCode',
  crush: 'Charm',
  pi: 'Inflection',
  copilot: 'GitHub',
  kimi: 'Moonshot',
  custom: 'Custom'
};

export function OfficeEngineSettings({ config, stage, godName = 'Michael' }: OfficeEngineSettingsProps) {
  const { t } = useTranslation();
  const updateAgent = useStore((s) => s.updateAgent);
  const { restoreTeam, restoring } = useRestoreTeam(config);

  const activePrimary = config.godProvider ?? inferAgentProvider(config.defaultCommand);
  const [selectedPrimary, setSelectedPrimary] = useState<AgentProvider>(activePrimary);
  const [selectedPrimaryModel, setSelectedPrimaryModel] = useState<string | undefined>(
    config.godModel ?? (activePrimary === 'claude'
      ? (config.defaultModel ?? modelsForProvider('claude')[0]?.id)
      : (config.providerDefaultModels?.[activePrimary] ?? (activePrimary === 'antigravity' ? 'Gemini 3.8 Flash (High)' : modelsForProvider(activePrimary)[0]?.id)))
  );

  const [selectedSecondary, setSelectedSecondary] = useState<AgentProvider | 'none'>(
    config.secondaryEngine ?? 'none'
  );
  const [selectedSecondaryModel, setSelectedSecondaryModel] = useState<string | undefined>(
    config.secondaryModel
  );
  const [autoFailover, setAutoFailover] = useState<boolean>(config.autoFailover ?? true);

  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const [copied, setCopied] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.cth?.toolsStatus?.().then((statuses) => {
      if (alive && Array.isArray(statuses)) {
        setToolStatuses(statuses);
      }
    });
    return () => { alive = false; };
  }, []);

  // Update primary model whenever selected primary changes
  useEffect(() => {
    const models = modelsForProvider(selectedPrimary);
    if (selectedPrimary === 'claude') {
      setSelectedPrimaryModel((prev) => (prev && models.some((m) => m.id === prev) ? prev : (config.defaultModel ?? models[0]?.id)));
    } else {
      setSelectedPrimaryModel((prev) => {
        if (prev && models.some((m) => m.id === prev)) return prev;
        return config.providerDefaultModels?.[selectedPrimary] ?? (selectedPrimary === 'antigravity' ? 'Gemini 3.8 Flash (High)' : models[0]?.id);
      });
    }
  }, [selectedPrimary]);

  // Update secondary model whenever selected secondary changes
  useEffect(() => {
    if (selectedSecondary === 'none') {
      setSelectedSecondaryModel(undefined);
    } else {
      const models = modelsForProvider(selectedSecondary);
      setSelectedSecondaryModel((prev) => {
        if (prev && models.some((m) => m.id === prev)) return prev;
        return config.secondaryModel ?? (selectedSecondary === 'antigravity' ? 'Gemini 3.8 Flash (High)' : models[0]?.id);
      });
    }
  }, [selectedSecondary]);

  const primaryPreset = providerPreset(selectedPrimary);
  const primaryModels = modelsForProvider(selectedPrimary);
  const primaryAvailability: EngineAvailability = classifyEngineAvailability(toolStatuses, selectedPrimary);
  const isPrimaryInstalled = primaryAvailability.state === 'installed';
  const isCurrentPrimary = activePrimary === selectedPrimary;

  const secondaryPreset = selectedSecondary !== 'none' ? providerPreset(selectedSecondary) : null;
  const secondaryModels = selectedSecondary !== 'none' ? modelsForProvider(selectedSecondary) : [];
  const secondaryAvailability: EngineAvailability | null = selectedSecondary !== 'none'
    ? classifyEngineAvailability(toolStatuses, selectedSecondary)
    : null;
  const isSecondaryInstalled = secondaryAvailability?.state === 'installed';

  const handleCopyInstall = (cmd?: string) => {
    if (!cmd) return;
    void navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const buildConfigPatch = (
    primary = selectedPrimary,
    primaryModel = selectedPrimaryModel,
    sec = selectedSecondary,
    secModel = selectedSecondaryModel,
    failover = autoFailover
  ): Partial<HarnessConfig> => {
    const pPreset = providerPreset(primary);
    const patch: Partial<HarnessConfig> = {
      defaultCommand: pPreset.defaultCommand,
      godProvider: primary,
      godModel: primaryModel,
      secondaryEngine: sec === 'none' ? undefined : sec,
      secondaryModel: sec === 'none' ? undefined : secModel,
      autoFailover: failover
    };
    if (primary === 'claude' && primaryModel) {
      patch.defaultModel = primaryModel;
    } else if (primaryModel) {
      patch.providerDefaultModels = {
        ...(config.providerDefaultModels ?? {}),
        [primary]: primaryModel
      };
    }
    return patch;
  };

  const onSelectPrimary = (p: AgentProvider) => {
    setSelectedPrimary(p);
    const models = modelsForProvider(p);
    const nextModel = p === 'claude'
      ? (config.defaultModel ?? models[0]?.id)
      : (config.providerDefaultModels?.[p] ?? (p === 'antigravity' ? 'Gemini 3.8 Flash (High)' : models[0]?.id));
    setSelectedPrimaryModel(nextModel);
    stage(buildConfigPatch(p, nextModel));
  };

  const onSelectPrimaryModel = (m: string | undefined) => {
    setSelectedPrimaryModel(m);
    stage(buildConfigPatch(selectedPrimary, m));
  };

  const onSelectSecondary = (s: AgentProvider | 'none') => {
    setSelectedSecondary(s);
    const sModels = s !== 'none' ? modelsForProvider(s) : [];
    const nextSModel = s !== 'none'
      ? (config.secondaryModel ?? (s === 'antigravity' ? 'Gemini 3.8 Flash (High)' : sModels[0]?.id))
      : undefined;
    setSelectedSecondaryModel(nextSModel);
    stage(buildConfigPatch(selectedPrimary, selectedPrimaryModel, s, nextSModel));
  };

  const onSelectSecondaryModel = (m: string | undefined) => {
    setSelectedSecondaryModel(m);
    stage(buildConfigPatch(selectedPrimary, selectedPrimaryModel, selectedSecondary, m));
  };

  const onToggleAutoFailover = (val: boolean) => {
    setAutoFailover(val);
    stage(buildConfigPatch(selectedPrimary, selectedPrimaryModel, selectedSecondary, selectedSecondaryModel, val));
  };

  const handleSetAsOfficeEngine = () => {
    const patch = buildConfigPatch();
    stage(patch);
    void window.cth?.updateConfig?.(patch);
    setActionNotice(`${primaryPreset.label} is now the primary office engine.`);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleApplyToOfficeAndStartAll = async () => {
    setIsApplyingAll(true);
    try {
      const patch = buildConfigPatch();
      stage(patch);
      await window.cth?.updateConfig?.(patch);

      // 1. Update all agents across live roster, restorable list, and archived list
      const state = useStore.getState();
      const allKnown = [...state.agents, ...state.restorableAgents, ...state.archivedAgents];
      for (const a of allKnown) {
        const command = buildSpawnCommand(
          { ...config, ...patch },
          selectedPrimaryModel,
          selectedPrimaryProviderPatch(selectedPrimary)
        );
        updateAgent(a.id, {
          provider: selectedPrimary,
          model: selectedPrimaryModel,
          command
        });
      }

      // 2. Synchronize all agents in hive registry.json and clear blocked cache in main process
      await window.cth?.hiveSyncAllProviders?.(selectedPrimary);

      // 3. Spawn all resting / unstarted team members so they are actively clocking in
      await restoreTeam();

      // 4. Refresh needs you cards
      refreshNeedsYou();

      setActionNotice(`Switched all team members to ${primaryPreset.label} and started office!`);
    } catch (err) {
      console.error('[OfficeEngineSettings] Error applying to office:', err);
      setActionNotice('Updated settings, but some agents could not start.');
    } finally {
      setIsApplyingAll(false);
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  function selectedPrimaryProviderPatch(p: AgentProvider): AgentProvider {
    return p;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Overview header */}
      <div>
        <div style={{
          fontFamily: 'var(--cth-font-display)', fontSize: 10, fontWeight: 600,
          lineHeight: '12px', color: 'var(--cth-ink-500)', textTransform: 'uppercase', marginBottom: 4
        }}>
          Office AI Engines
        </div>
        <div style={{ fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>
          Configure the primary engine for {godName} and your team, plus an optional backup engine with automatic failover.
        </div>
      </div>

      {/* SECTION 1: PRIMARY AI ENGINE */}
      <div style={{
        borderRadius: 'var(--cth-r-md)',
        padding: 14,
        background: 'var(--cth-cream-100)',
        boxShadow: 'inset 0 0 0 1px var(--cth-line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cth-ink-900)' }}>
              Primary AI Engine
            </div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
              Powers {godName} and active team members.
            </div>
          </div>
          {isCurrentPrimary && (
            <span style={{
              borderRadius: 'var(--cth-r-md)',
              padding: '2px 8px',
              fontSize: 10.5,
              fontWeight: 700,
              fontFamily: 'var(--cth-font-mono)',
              background: 'var(--cth-mint-light)',
              boxShadow: 'inset 0 0 0 1px var(--cth-mint)',
              color: 'var(--cth-ink-900)'
            }}>
              ACTIVE PRIMARY
            </span>
          )}
        </div>

        {/* Primary engine selection cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 8
        }}>
          {BUILD_ENGINES.map((providerId) => {
            const p = providerPreset(providerId);
            const avail = classifyEngineAvailability(toolStatuses, providerId);
            const isSelected = selectedPrimary === providerId;
            const isActive = activePrimary === providerId;
            const ready = avail.state === 'installed';

            return (
              <button
                key={providerId}
                type="button"
                onClick={() => onSelectPrimary(providerId)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '9px 11px',
                  borderRadius: 'var(--cth-r-md)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: isSelected ? 'var(--cth-sky-light)' : 'var(--cth-paper-100)',
                  boxShadow: isSelected
                    ? 'inset 0 0 0 2px var(--cth-indigo)'
                    : 'inset 0 0 0 1px var(--cth-line)',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ProviderLogo provider={providerId} size={15} />
                    <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
                      {p.label}
                    </span>
                  </div>
                  {isActive && (
                    <span style={{
                      fontSize: 8.5, fontWeight: 700, fontFamily: 'var(--cth-font-mono)',
                      padding: '1px 4px', borderRadius: 3, background: 'var(--cth-indigo)', color: '#fff'
                    }}>
                      OFFICE
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 'auto' }}>
                  <span style={{ fontSize: 10.5, color: 'var(--cth-ink-500)' }}>
                    {PROVIDER_SUBTITLES[providerId] ?? ''}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    fontFamily: 'var(--cth-font-mono)',
                    color: ready ? 'var(--cth-mint)' : 'var(--cth-ink-500)'
                  }}>
                    {ready ? 'READY' : 'AVAILABLE'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Primary model selector & CLI path */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
            Command: <code style={{ fontFamily: 'var(--cth-font-mono)', color: 'var(--cth-ink-900)' }}>{primaryPreset.defaultCommand}</code>
            {primaryAvailability.path ? ` (${primaryAvailability.path})` : ''}
          </div>

          {primaryModels.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: 'var(--cth-ink-700)', fontWeight: 500 }}>
                Model:
              </span>
              <select
                value={selectedPrimaryModel ?? ''}
                onChange={(e) => onSelectPrimaryModel(e.target.value || undefined)}
                className="cth-input"
                style={{
                  fontSize: 11.5,
                  padding: '3px 8px',
                  borderRadius: 'var(--cth-r-md)',
                  background: 'var(--cth-paper-100)',
                  color: 'var(--cth-ink-900)',
                  minWidth: 150
                }}
              >
                {primaryModels.map((m) => (
                  <option key={m.id ?? m.label} value={m.id ?? ''}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Primary CLI install command if missing */}
        {!isPrimaryInstalled && primaryAvailability.installCommand && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 'var(--cth-r-md)',
            background: 'var(--cth-cream-200)', fontSize: 11
          }}>
            <span style={{ color: 'var(--cth-ink-700)' }}>Install command:</span>
            <code style={{ fontFamily: 'var(--cth-font-mono)', flex: 1, overflowX: 'auto', color: 'var(--cth-ink-900)' }}>
              {primaryAvailability.installCommand}
            </code>
            <PixelButton variant="secondary" size="sm" onClick={() => handleCopyInstall(primaryAvailability.installCommand)}>
              {copied ? 'Copied' : 'Copy'}
            </PixelButton>
          </div>
        )}
      </div>

      {/* SECTION 2: SECONDARY BACKUP ENGINE & AUTO FAILOVER */}
      <div style={{
        borderRadius: 'var(--cth-r-md)',
        padding: 14,
        background: 'var(--cth-cream-100)',
        boxShadow: 'inset 0 0 0 1px var(--cth-line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cth-ink-900)' }}>
              Secondary AI Engine (Backup)
            </div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
              Stands by to take over tasks if the primary engine encounters limits or errors.
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 600, color: 'var(--cth-ink-900)', cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={autoFailover}
              onChange={(e) => onToggleAutoFailover(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Auto Failover</span>
          </label>
        </div>

        {/* Secondary engine selection cards (includes None) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 8
        }}>
          {/* Option: None / Disabled */}
          <button
            type="button"
            onClick={() => onSelectSecondary('none')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '9px 11px',
              borderRadius: 'var(--cth-r-md)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              background: selectedSecondary === 'none' ? 'var(--cth-sky-light)' : 'var(--cth-paper-100)',
              boxShadow: selectedSecondary === 'none'
                ? 'inset 0 0 0 2px var(--cth-indigo)'
                : 'inset 0 0 0 1px var(--cth-line)',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 5 }}>
              <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
                None (Disabled)
              </span>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--cth-ink-500)', marginTop: 'auto' }}>
              No backup engine
            </span>
          </button>

          {/* Supported secondary engines */}
          {BUILD_ENGINES.filter((id) => id !== selectedPrimary).map((providerId) => {
            const p = providerPreset(providerId);
            const avail = classifyEngineAvailability(toolStatuses, providerId);
            const isSelected = selectedSecondary === providerId;
            const ready = avail.state === 'installed';

            return (
              <button
                key={providerId}
                type="button"
                onClick={() => onSelectSecondary(providerId)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '9px 11px',
                  borderRadius: 'var(--cth-r-md)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: isSelected ? 'var(--cth-sky-light)' : 'var(--cth-paper-100)',
                  boxShadow: isSelected
                    ? 'inset 0 0 0 2px var(--cth-indigo)'
                    : 'inset 0 0 0 1px var(--cth-line)',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ProviderLogo provider={providerId} size={15} />
                    <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
                      {p.label}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 'auto' }}>
                  <span style={{ fontSize: 10.5, color: 'var(--cth-ink-500)' }}>
                    {PROVIDER_SUBTITLES[providerId] ?? ''}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    fontFamily: 'var(--cth-font-mono)',
                    color: ready ? 'var(--cth-mint)' : 'var(--cth-ink-500)'
                  }}>
                    {ready ? 'READY' : 'AVAILABLE'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Secondary model selector if an engine is picked */}
        {selectedSecondary !== 'none' && secondaryModels.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
              Command: <code style={{ fontFamily: 'var(--cth-font-mono)', color: 'var(--cth-ink-900)' }}>{secondaryPreset?.defaultCommand}</code>
              {secondaryAvailability?.path ? ` (${secondaryAvailability.path})` : ''}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: 'var(--cth-ink-700)', fontWeight: 500 }}>
                Backup Model:
              </span>
              <select
                value={selectedSecondaryModel ?? ''}
                onChange={(e) => onSelectSecondaryModel(e.target.value || undefined)}
                className="cth-input"
                style={{
                  fontSize: 11.5,
                  padding: '3px 8px',
                  borderRadius: 'var(--cth-r-md)',
                  background: 'var(--cth-paper-100)',
                  color: 'var(--cth-ink-900)',
                  minWidth: 150
                }}
              >
                {secondaryModels.map((m) => (
                  <option key={m.id ?? m.label} value={m.id ?? ''}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: ACTIONS & EXECUTION */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        paddingTop: 4
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PixelButton
            variant="secondary"
            size="md"
            onClick={handleSetAsOfficeEngine}
          >
            Set as Office Engine
          </PixelButton>

          <PixelButton
            variant="primary"
            size="md"
            onClick={handleApplyToOfficeAndStartAll}
            disabled={isApplyingAll || restoring}
          >
            {isApplyingAll || restoring ? 'Starting Team...' : 'Apply to Office & Start All Team Members'}
          </PixelButton>
        </div>

        {actionNotice && (
          <div style={{
            fontSize: 12, fontWeight: 500, color: 'var(--cth-mint-text, #0f766e)',
            padding: '4px 10px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-mint-light)'
          }}>
            {actionNotice}
          </div>
        )}
      </div>
    </div>
  );
}
