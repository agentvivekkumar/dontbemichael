import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { Toggle, MiniButton } from './triggers/ui';
import { AddMailboxDialog } from './AddMailboxDialog';
import { useHarnessConfig } from '@/hooks/useHarnessConfig';
import { useStore } from '@/store/store';
import { PROVIDER_PRESETS, teamEmailOn, type MailboxRecord } from '@shared/mailboxes';

/**
 * Settings > Connections > Mailboxes (docs/designs/multi-mailbox.md, design
 * review D-T1). One line per mailbox: address, service, who uses it, status,
 * then Fix or Edit; Add a mailbox sits top right. The last line is the owner's
 * Claude account, and it alone carries an on/off switch (the old Email &
 * Calendar switch): allowed lets every agent use the email and calendar
 * connected in Claude, blocked stops everyone. It is not per agent and never
 * touches the mailboxes added here (owner, 2026-09-26). Status is always
 * a word as well as a colour (DESIGN.md 3.4). Removing a mailbox names who
 * loses it (design 8A).
 */
export function MailboxesSettings() {
  const { t } = useTranslation();
  const config = useHarnessConfig();
  const agents = useStore((s) => s.agents);
  const [dialog, setDialog] = useState<{ fix?: MailboxRecord } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  if (!config) return null;
  const mailboxes = config.mailboxes ?? [];
  const teamOn = teamEmailOn(config.mcpDefaults);
  const needs = mailboxes.filter((m) => m.status === 'needs-attention').length;

  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.name ?? id;
  const usersOf = (mailboxId: string): string[] =>
    Object.entries(config.agentCapabilities ?? {})
      .filter(([, c]) => c.email?.enabled && c.email.mailboxes[0] === mailboxId)
      .map(([id]) => nameOf(id));
  const list = (names: string[]): string => names.join(t('profile.listJoiner'));

  const setTeam = async (on: boolean): Promise<void> => {
    setFailed(false);
    try {
      await window.cth.updateConfig({ mcpDefaults: { ...(config.mcpDefaults ?? {}), 'email-calendar': { enabled: on } } });
    } catch { setFailed(true); }
  };

  const remove = async (id: string): Promise<void> => {
    setConfirming(null);
    try { await window.cth.mailRemove(id); } catch { setFailed(true); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', color: 'var(--cth-ink-500)', textTransform: 'uppercase' }}>
            {t('mailboxes.title')}
            {needs > 0 && <span style={{ ...badge, ...needsBadge, marginInlineStart: 8, textTransform: 'none', fontFamily: 'var(--cth-font-ui)' }}><Dot color="var(--cth-coral)" />{t('mailboxes.needsCount', { count: needs })}</span>}
          </div>
          <div style={hint}>{t('mailboxes.intro')}</div>
        </div>
        <PixelButton variant="primary" size="sm" onClick={() => setDialog({})}>{t('mailboxes.add')}</PixelButton>
      </div>

      {failed && <div role="alert" style={{ fontSize: 13, color: 'var(--cth-ink-900)' }}>! {t('capabilities.saveFailed')}</div>}

      {mailboxes.length === 0 ? (
        <div style={{ background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', padding: 12, fontSize: 13, lineHeight: '18px' }}>
          {t('mailboxes.empty')}
        </div>
      ) : (
        <div role="list">
          {mailboxes.map((m, i) => {
            const users = usersOf(m.id);
            const needsYou = m.status === 'needs-attention';
            return (
              <div key={m.id} role="listitem" style={{ ...row, borderTop: i === 0 ? 'none' : row.borderTop }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>{m.address}</div>
                  <div style={hint}>
                    {m.provider === 'other' ? t('mailboxes.other') : PROVIDER_PRESETS[m.provider].label}
                    {' · '}
                    {users.length ? t('mailboxes.usedBy', { names: list(users) }) : t('mailboxes.usedByNobody')}
                  </div>
                  {needsYou && m.statusReason && <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-900)' }}>! {m.statusReason}</div>}
                  {confirming === m.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13 }}>{t('mailboxes.sure')}{users.length ? ` ${t('mailboxes.removeAffects', { names: list(users) })}` : ''}</span>
                      <MiniButton tone="destructive" autoFocus onClick={() => { void remove(m.id); }}>{t('mailboxes.removeIt')}</MiniButton>
                      <MiniButton onClick={() => setConfirming(null)}>{t('mailboxes.keep')}</MiniButton>
                    </div>
                  )}
                </div>
                <span style={{ ...badge, ...(needsYou ? needsBadge : okBadge) }}>
                  <Dot color={needsYou ? 'var(--cth-coral)' : 'var(--cth-mint)'} />
                  {needsYou ? t('mailboxes.statusNeeds') : t('mailboxes.statusConnected')}
                </span>
                <PixelButton variant={needsYou ? 'secondary' : 'ghost'} size="sm" onClick={() => setDialog({ fix: m })}>
                  {needsYou ? t('mailboxes.fix') : t('mailboxes.edit')}
                </PixelButton>
                {confirming !== m.id && <PixelButton variant="ghost" size="sm" onClick={() => setConfirming(m.id)}>{t('mailboxes.remove')}</PixelButton>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ ...row }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('mailboxes.claudeAccount')}</div>
          <div style={hint}>{t('mailboxes.claudeAccountSub')}</div>
          <div style={hint}>{t('mailboxes.claudeAccessDesc')}</div>
        </div>
        <Toggle on={teamOn} label={t('mailboxes.claudeAccessLabel')} onLabel={t('mailboxes.claudeAccessOn')} offLabel={t('mailboxes.claudeAccessOff')} onClick={() => { void setTeam(!teamOn); }} />
      </div>

      {dialog && (
        <AddMailboxDialog
          fix={dialog.fix}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" style={{ width: 8, height: 8, background: color, display: 'inline-block' }} />;
}

const hint: CSSProperties = { fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-500)' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--cth-ink-100)' };
const badge: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, lineHeight: '20px', padding: '0 6px', flexShrink: 0 };
const okBadge: CSSProperties = { background: 'color-mix(in srgb, var(--cth-mint) 20%, var(--cth-cream-100))', color: 'var(--cth-ink-900)' };
const needsBadge: CSSProperties = { background: 'var(--cth-coral-light)', color: 'var(--cth-ink-900)' };
