import { useEffect, useState, type CSSProperties } from 'react';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { useStore, type Agent } from '@/store/store';
import { OFFICE_CAST, type OfficeCharacterName } from '@/scene/office/cast';
import { type AccentColorName } from '@/design/tokens';
import {
  type AgentProvider,
  type HarnessConfig,
  AGENT_PROVIDER_PRESETS,
  buildSpawnCommand,
  modelsForProvider,
  inferAgentProvider,
  providerPreset,
  isClaudeProvider
} from '@/store/config';
import { BUILD_ENGINES } from '@shared/agentProvider';
import { splitAgentRole, joinAgentRole } from '@shared/agentRole';

const ACCENTS: AccentColorName[] = ['coral', 'mint', 'sky', 'lemon', 'lilac', 'peach'];

export interface EditAgentModalProps {
  agent: Agent;
  onClose: () => void;
}

/**
 * Compact post-hire editor for Identity / Engine / Briefing. Mirrors the Add
 * Agent fields that matter after spawn; save only patches the durable roster
 * via updateAgent (engine changes apply on the next restart).
 */
export function EditAgentModal({ agent, onClose }: EditAgentModalProps) {
  const updateAgent = useStore((s) => s.updateAgent);
  const [config, setConfig] = useState<HarnessConfig | null>(null);

  const [name, setName] = useState(agent.name);
  const [character, setCharacter] = useState<OfficeCharacterName>(agent.character);
  const [accent, setAccent] = useState<AccentColorName>(agent.accent);
  const [provider, setProvider] = useState<AgentProvider>(
    inferAgentProvider(agent.command, agent.provider)
  );
  const [model, setModel] = useState<string | undefined>(agent.model);
  // The stored role is one string ("Finance: Keeps track of..."), shown here as
  // two fields and joined back on save (agentRole.ts).
  const [role, setRole] = useState(() => splitAgentRole(agent.description).role);
  const [roleDescription, setRoleDescription] = useState(() => splitAgentRole(agent.description).roleDescription);
  const [goal, setGoal] = useState(agent.goal ?? '');

  useEffect(() => {
    void window.cth.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  // Keep form in sync when the selected agent changes while the modal is open.
  useEffect(() => {
    setName(agent.name);
    setCharacter(agent.character);
    setAccent(agent.accent);
    setProvider(inferAgentProvider(agent.command, agent.provider));
    setModel(agent.model);
    setRole(splitAgentRole(agent.description).role);
    setRoleDescription(splitAgentRole(agent.description).roleDescription);
    setGoal(agent.goal ?? '');
  }, [agent.id]);

  const pickProvider = (id: AgentProvider) => {
    setProvider(id);
    if (!config) {
      setModel(undefined);
      return;
    }
    const nextModel = isClaudeProvider(id) ? config.defaultModel : config.providerDefaultModels?.[id];
    setModel(nextModel);
  };

  const preset = providerPreset(provider);

  const save = () => {
    const trimmedName = name.trim() || agent.name;
    // Both fields cleared keeps the role it had, rather than saving a blank.
    const trimmedDescription = joinAgentRole(role, roleDescription) || agent.description;
    const trimmedGoal = goal.trim();
    const command = config
      ? buildSpawnCommand(config, model, provider)
      : agent.command;

    updateAgent(agent.id, {
      name: trimmedName,
      character,
      accent,
      provider,
      model,
      command,
      description: trimmedDescription,
      goal: trimmedGoal || undefined
    });
    // Michael routes work by the role in the office registry. Update it now, so
    // he sees the change on his next message instead of after a restart.
    if (trimmedDescription !== agent.description) {
      void window.cth.hivePatchAgentRole(agent.id, trimmedDescription).catch(() => undefined);
    }
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26, 19, 32, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 500
      }}
    >
      {/* Same box as Add Agent (940 / 95vw / 86vh). They are the two halves of
          one job — describe an agent — and a tall narrow dialog next to a wide
          one reads as two unrelated screens. */}
      <div onClick={(e) => e.stopPropagation()} style={{ width: 940, maxWidth: '95vw' }}>
        <PixelPanel variant="dialog" title="EDIT AGENT" style={{ padding: 16 }} noPadding>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 14,
            padding: 16, maxHeight: '86vh', overflowY: 'auto'
          }}>
            {/* Two columns so the extra width is used rather than padded.
                Identity and Engine are short field lists; Briefing is free
                text and takes the taller side. minHeight keeps the dialog from
                collapsing into a wide thin strip on a small form. */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 16, alignItems: 'start', minHeight: 260
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <Section label="Identity" hint="name · character · color">
              <Row label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Stanley"
                  style={inputStyle}
                  autoFocus
                />
              </Row>

              <Row label="Character">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {OFFICE_CAST.map((c) => {
                    const active = character === c.name;
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => { setCharacter(c.name); setName(c.displayName); }}
                        title={c.blurb}
                        style={{
                          padding: 4,
                          background: active ? `var(--cth-${accent}-light)` : 'var(--cth-cream-100)',
                          boxShadow: active
                            ? 'inset 0 0 0 1.5px var(--cth-ink-500)'
                            : 'inset 0 0 0 1px var(--cth-ink-100)',
                          cursor: 'pointer', border: 'none', width: 52,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
                        }}
                      >
                        <div style={{
                          width: 40, height: 48,
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                          overflow: 'hidden'
                        }}>
                          <SpritePortrait character={c.name} scale={1.5} />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--cth-ink-700)' }}>{c.displayName}</span>
                      </button>
                    );
                  })}
                </div>
              </Row>

              <Row label="Color">
                <div style={{ display: 'flex', gap: 6 }}>
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAccent(a)}
                      title={a}
                      style={{
                        width: 28, height: 28,
                        background: `var(--cth-${a})`,
                        boxShadow: accent === a
                          ? 'inset 0 0 0 1.5px var(--cth-ink-500), 0 0 0 2px var(--cth-ink-900)'
                          : 'inset 0 0 0 1px var(--cth-ink-300)',
                        cursor: 'pointer', border: 'none'
                      }}
                    />
                  ))}
                </div>
              </Row>
            </Section>

            <Section label="Engine" hint="provider · model">
              <Row label="Provider">
                {/* A list, not a grid of buttons. Only the engines this build
                    offers (BUILD_ENGINES, like setup), plus the agent's own if it
                    runs on another, so a list never hides what it is on. */}
                <select
                  value={provider}
                  onChange={(e) => pickProvider(e.target.value as AgentProvider)}
                  style={inputStyle}
                >
                  {AGENT_PROVIDER_PRESETS
                    .filter((p) => BUILD_ENGINES.includes(p.id) || p.id === provider)
                    .map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Row>

              {preset.supportsModel && (
                <Row label="Model">
                  <select
                    value={model ?? ''}
                    onChange={(e) => setModel(e.target.value || undefined)}
                    style={inputStyle}
                  >
                    {/* Always list the current model: a <select> whose value
                        matches no option shows its first row while the saved
                        model stays the other one. */}
                    {(() => {
                      const known = modelsForProvider(provider);
                      return model && !known.some((m) => m.id === model)
                        ? [...known, { id: model, label: `${model} (current)` }]
                        : known;
                    })().map((m) => <option key={m.id ?? m.label} value={m.id ?? ''}>{m.label}</option>)}
                  </select>
                </Row>
              )}

              <span style={{ fontSize: 14, color: 'var(--cth-ink-500)', lineHeight: '18px' }}>
                A new engine or model takes effect the next time this team member starts.
              </span>
            </Section>

              </div>
              <div style={{ minWidth: 0 }}>
            <Section label="Briefing" hint="role · work style">
              <Row label="Role">
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="For example: Finance"
                  style={inputStyle}
                />
              </Row>

              <Row label="Role description">
                <textarea
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder="For example: Keeps track of money in and money out, and sends a weekly summary"
                  rows={3}
                  style={{ ...inputStyle, fontFamily: 'var(--cth-font-ui)', resize: 'vertical' }}
                />
              </Row>
              <span style={helperStyle}>
                Michael reads the role and role description to decide which work to give this team member.
              </span>

              <Row label="Work style (optional)">
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="For example: Check every number twice. Send a short summary when you finish."
                  rows={4}
                  style={{ ...inputStyle, fontFamily: 'var(--cth-font-ui)', resize: 'vertical', minHeight: 200 }}
                />
              </Row>
              <span style={helperStyle}>
                Michael doesn't see this. It's how this team member gets their work done: the steps they follow and what they check before they finish.
              </span>
            </Section>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <PixelButton variant="ghost" size="md" onClick={onClose}>cancel</PixelButton>
              <div style={{ flex: 1 }} />
              <PixelButton variant="primary" size="md" onClick={save}>save changes</PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

/** A plain note under a field: what it is for, in the owner's words. */
const helperStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: '18px',
  color: 'var(--cth-ink-500)'
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px 4px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 16,
  color: 'var(--cth-ink-900)',
  outline: 'none',
  boxSizing: 'border-box'
};

function Section({
  label,
  hint,
  children
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--cth-font-display)',
          fontSize: 9, lineHeight: '12px',
          color: 'var(--cth-ink-900)',
          textTransform: 'uppercase'
        }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontFamily: 'var(--cth-font-display)',
        fontSize: 8, lineHeight: '12px',
        color: 'var(--cth-ink-700)',
        textTransform: 'uppercase'
      }}>{label}</span>
      {children}
    </label>
  );
}
