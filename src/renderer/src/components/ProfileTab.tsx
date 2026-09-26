import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { PixelButton } from './PixelButton';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useRtl } from '@/i18n/useDirection';
import { parseRoleLine, workStyleBody } from '@shared/agentProfile';
import { fillBusiness } from '@shared/teamPlan';
import type { AgentDefinitionV2 } from '@shared/agentDefinition';
import { useStore, type Agent } from '@/store/store';

/**
 * PROFILE: who this agent is, the first tab on every agent (owner, 2026-09-25;
 * docs/designs/agent-profile.md). The job title and what the job is, what to
 * send them and what goes elsewhere, what they do and what they ask you about
 * first, the key facts, and the full instructions they follow.
 *
 * Everything comes from what the app already stores: the agent's role line and
 * work style, and its card in the office's business pack (read once per launch).
 */

/** What the office's pack and settings say: each agent's card by id, and for
 *  Michael the business and what he's told about it. Loaded once and shared. */
interface OfficeInfo {
  cards: Map<string, AgentDefinitionV2>;
  business: { name?: string; city?: string };
  /** The pack's briefing with the business filled in; Michael gets it at start. */
  briefing: string;
}
let officeInfo: Promise<OfficeInfo> | null = null;
function loadOfficeInfo(): Promise<OfficeInfo> {
  if (!officeInfo) {
    officeInfo = Promise.all([window.cth.packsList(), window.cth.getConfig()])
      .then(([res, config]) => {
        const c = config as { businessType?: string; businessName?: string; companyProfile?: { address?: { city?: string } } };
        const pack = res.packs.find((p) => p.pack.businessType === c.businessType)?.pack ?? res.core;
        const business = { name: c.businessName?.trim() || undefined, city: c.companyProfile?.address?.city?.trim() || undefined };
        return {
          cards: new Map((pack?.agents ?? []).map((a) => [a.id, a])),
          business,
          briefing: pack?.briefing ? fillBusiness(pack.briefing, business) : ''
        };
      })
      .catch(() => { officeInfo = null; return { cards: new Map(), business: {}, briefing: '' }; });
  }
  return officeInfo;
}

export function ProfileTab({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const godName = useResolvedGodName();
  const [card, setCard] = useState<AgentDefinitionV2 | undefined>(undefined);
  const [office, setOffice] = useState<OfficeInfo | null>(null);
  const agents = useStore((s) => s.agents);
  const [showInstructions, setShowInstructions] = useState(false);
  const [folderError, setFolderError] = useState(false);
  /** The agent's work folder in Finder (or the OS file browser). fs:revealPath
   *  opens a folder and never launches a file. */
  const openFolder = () => {
    setFolderError(false);
    window.cth.revealPath(agent.cwd)
      .then((r) => { if (!r.ok) setFolderError(true); })
      .catch(() => setFolderError(true));
  };

  useEffect(() => {
    let alive = true;
    setShowInstructions(false);
    setFolderError(false);
    loadOfficeInfo().then((o) => { if (alive) { setOffice(o); setCard(o.cards.get(agent.id)); } });
    return () => { alive = false; };
  }, [agent.id]);

  const role = useMemo(() => parseRoleLine(agent.description), [agent.description]);
  const instructions = workStyleBody(agent.goal);
  const name = agent.isGod ? godName : agent.name;
  const title = role.title || card?.role || (agent.isGod ? t('profile.officeManager') : '');
  const god = !!agent.isGod;
  // Michael has no pack card: his profile says what his instructions tell him
  // to do (hive.ts godPrompt), in the owner's words.
  const summary = god ? t('profile.god.summary', { name }) : (role.summary || card?.summary || '');
  const does = god ? (t('profile.god.does', { returnObjects: true, name }) as string[]) : (card?.does ?? []);
  const asksFirst = god ? (t('profile.god.asksFirst', { returnObjects: true }) as string[]) : (card?.wontDo ?? []);
  const team = god ? agents.filter((a) => !a.isGod && !a.isAssistant && !a.archived) : [];
  const businessLine = office?.business.name
    ? [office.business.name, office.business.city].filter(Boolean).join(t('profile.listJoiner'))
    : '';
  const connections = card?.connections ?? [];

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', background: 'var(--cth-paper-200)' }}>
      <div style={{ padding: '16px 16px 24px', maxWidth: '72ch' }}>
        {title && (
          <h2 dir={rtl ? 'auto' : undefined} style={{ margin: 0, fontFamily: 'var(--cth-font-display)', fontSize: 12, lineHeight: '20px', fontWeight: 400, color: 'var(--cth-ink-900)' }}>
            {title}
          </h2>
        )}
        {summary ? (
          <p dir={rtl ? 'auto' : undefined} style={{ margin: '8px 0 0', fontSize: 16, lineHeight: '24px', color: 'var(--cth-ink-900)' }}>{summary}</p>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-500)' }}>{t('profile.noRole', { name })}</p>
        )}

        {/* No "send them" section: Michael decides who gets what (owner, 2026-09-25).
            parseRoleLine still takes the routing sentences out of the summary. */}
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

        {team.length > 0 && (
          <Section title={t('profile.god.team', { count: team.length })}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {team.map((a) => {
                const job = parseRoleLine(a.description).title;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => useStore.getState().select(a.id)}
                      style={{
                        padding: '2px 8px', border: 'none', cursor: 'pointer', fontFamily: 'var(--cth-font-ui)',
                        fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-900)', textAlign: 'start',
                        background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{a.name}</span>
                      {job && <span style={{ color: 'var(--cth-ink-500)' }}>{t('profile.listJoiner')}{job}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {god && office?.briefing && (
          <Section title={t('profile.god.business', { name })}>
            <p dir={rtl ? 'auto' : undefined} style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--cth-ink-900)' }}>{office.briefing}</p>
          </Section>
        )}

        <Section title={t('profile.facts')}>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 16, rowGap: 6 }}>
            {god && businessLine && <Fact label={t('profile.god.businessFact')}>{businessLine}</Fact>}
            {agent.cwd && (
              <Fact label={t('profile.folder')}>
                <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 13, wordBreak: 'break-all' }}>{agent.cwd}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <PixelButton variant="secondary" size="sm" onClick={openFolder}>{t('profile.openFolder')}</PixelButton>
                  {folderError && <span role="alert" style={{ fontSize: 13, color: 'var(--cth-coral)' }}>! {t('profile.openFolderFailed')}</span>}
                </span>
              </Fact>
            )}
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
