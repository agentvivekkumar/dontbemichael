import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useRtl } from '@/i18n/useDirection';
import { parseRoleLine, workStyleBody } from '@shared/agentProfile';
import type { AgentDefinitionV2 } from '@shared/agentDefinition';
import type { Agent } from '@/store/store';

/**
 * PROFILE: who this agent is, the first tab on every agent (owner, 2026-09-25;
 * docs/designs/agent-profile.md). The job title and what the job is, what to
 * send them and what goes elsewhere, what they do and what they ask you about
 * first, the key facts, and the full instructions they follow.
 *
 * Everything comes from what the app already stores: the agent's role line and
 * work style, and its card in the office's business pack (read once per launch).
 */

/** The agent's card in this office's pack, by id. Loaded once and shared. */
let packCards: Promise<Map<string, AgentDefinitionV2>> | null = null;
function loadPackCards(): Promise<Map<string, AgentDefinitionV2>> {
  if (!packCards) {
    packCards = Promise.all([window.cth.packsList(), window.cth.getConfig()])
      .then(([res, config]) => {
        const type = (config as { businessType?: string }).businessType;
        const pack = res.packs.find((p) => p.pack.businessType === type)?.pack ?? res.core;
        return new Map((pack?.agents ?? []).map((a) => [a.id, a]));
      })
      .catch(() => { packCards = null; return new Map(); });
  }
  return packCards;
}

export function ProfileTab({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const godName = useResolvedGodName();
  const [card, setCard] = useState<AgentDefinitionV2 | undefined>(undefined);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    let alive = true;
    setShowInstructions(false);
    loadPackCards().then((m) => { if (alive) setCard(m.get(agent.id)); });
    return () => { alive = false; };
  }, [agent.id]);

  const role = useMemo(() => parseRoleLine(agent.description), [agent.description]);
  const instructions = workStyleBody(agent.goal);
  const name = agent.isGod ? godName : agent.name;
  const title = role.title || card?.role || (agent.isGod ? t('profile.officeManager') : '');
  const summary = role.summary || card?.summary || '';
  const does = card?.does ?? [];
  const asksFirst = card?.wontDo ?? [];
  const connections = card?.connections ?? [];
  const dir = rtl ? 'auto' : undefined;

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', background: 'var(--cth-paper-200)' }}>
      <div style={{ padding: '16px 16px 24px', maxWidth: '72ch' }}>
        {title && (
          <h2 dir={dir} style={{ margin: 0, fontFamily: 'var(--cth-font-display)', fontSize: 12, lineHeight: '20px', fontWeight: 400, color: 'var(--cth-ink-900)' }}>
            {title}
          </h2>
        )}
        {summary ? (
          <p dir={dir} style={{ margin: '8px 0 0', fontSize: 16, lineHeight: '24px', color: 'var(--cth-ink-900)' }}>{summary}</p>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-500)' }}>{t('profile.noRole', { name })}</p>
        )}

        {role.sendFor.length > 0 && (
          <Section title={t('profile.sendFor', { name })}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {role.sendFor.map((s) => (
                <li key={s} dir={dir} style={{
                  padding: '2px 8px', fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-900)',
                  background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
                }}>{s}</li>
              ))}
            </ul>
            {role.notFor && (
              <p dir={dir} style={{ margin: '8px 0 0', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>{role.notFor}</p>
            )}
          </Section>
        )}

        {does.length > 0 && (
          <Section title={t('profile.does', { name })}>
            <List items={does} mark="✓" markColor="var(--cth-mint)" />
          </Section>
        )}

        {asksFirst.length > 0 && (
          <Section title={t('profile.asksFirst')}>
            <List items={asksFirst} mark="?" markColor="var(--cth-peach)" />
          </Section>
        )}

        <Section title={t('profile.facts')}>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 16, rowGap: 6 }}>
            {agent.cwd && <Fact label={t('profile.folder')}><span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 13, wordBreak: 'break-all' }}>{agent.cwd}</span></Fact>}
            {connections.length > 0 && (
              <Fact label={t('profile.connections')}>
                {connections.map((c) => t(`onboarding.team.conn.${c.id}`, { defaultValue: c.id })).join(t('profile.listJoiner'))}
              </Fact>
            )}
            {card?.firstAction && <Fact label={t('profile.firstJob')}>{card.firstAction}</Fact>}
            {agent.model && <Fact label={t('profile.model')}>{agent.model}</Fact>}
          </dl>
        </Section>

        {instructions && (
          <Section title={t('profile.instructions', { name })}>
            <button
              type="button"
              aria-expanded={showInstructions}
              onClick={() => setShowInstructions((v) => !v)}
              style={{
                padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-900)',
                textDecoration: 'underline', textUnderlineOffset: 2
              }}
            >
              {showInstructions ? t('profile.hideInstructions') : t('profile.showInstructions')}
            </button>
            {showInstructions && (
              <div style={{
                marginTop: 8, padding: '4px 12px', fontSize: 14, lineHeight: '20px',
                background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
              }}>
                <MarkdownPreview source={instructions} variant="card" />
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px', fontWeight: 600, color: 'var(--cth-ink-700)' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function List({ items, mark, markColor }: { items: string[]; mark: string; markColor: string }) {
  const rtl = useRtl();
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it) => (
        <li key={it} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
          <span aria-hidden style={{ width: 12, flexShrink: 0, textAlign: 'center', fontWeight: 700, color: markColor }}>{mark}</span>
          <span dir={rtl ? 'auto' : undefined}>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink-500)' }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-900)', minWidth: 0 }}>{children}</dd>
    </>
  );
}
