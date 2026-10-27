import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { Disclosure, MiniButton } from './triggers/ui';
import { InfoTip } from './InfoTip';
import { AddWhatsAppDialog } from './AddWhatsAppDialog';
import { groupName } from './fieldText';
import { WhatsAppDraftList } from './WhatsAppDraftList';
import { useHarnessConfig } from '@/hooks/useHarnessConfig';
import { useStore } from '@/store/store';
import type { WhatsAppAccountRecord } from '@shared/whatsapp';

export function WhatsAppSettings() {
  const { t } = useTranslation();
  const config = useHarnessConfig();
  const agents = useStore((s) => s.agents);
  const [dialog, setDialog] = useState<{ fix?: WhatsAppAccountRecord } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !config) return;
    decided.current = true;
    if ((config.whatsappAccounts ?? []).some((a) => a.status === 'needs-attention')) setOpen(true);
  }, [config]);

  const rootRef = useRef<HTMLDivElement>(null);
  const refocus = (key: string): void => {
    setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`[data-focus="${key}"] button`)?.focus(), 0);
  };

  if (!config) return null;

  const accounts = [...(config.whatsappAccounts ?? [])].sort((a, b) => {
    const aNeeds = a.status === 'needs-attention' ? 0 : 1;
    const bNeeds = b.status === 'needs-attention' ? 0 : 1;
    return aNeeds - bNeeds || a.label.localeCompare(b.label);
  });
  const needs = accounts.filter((a) => a.status === 'needs-attention').length;

  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.name ?? id;
  const usersOf = (accountId: string): string[] =>
    Object.entries(config.agentCapabilities ?? {})
      .filter(([, c]) => c.whatsapp?.enabled && c.whatsapp.accounts?.[0] === accountId)
      .map(([id]) => nameOf(id));

  const list = (names: string[]): string => names.join(t('profile.listJoiner', ', '));

  const remove = async (id: string): Promise<void> => {
    setConfirming(null);
    let ok = false;
    try {
      const res = await window.cth.whatsappRemove(id);
      ok = res.ok;
    } catch {
      /* reported below */
    }
    if (!ok) setFailed(true);
    refocus(ok ? 'add-wa' : `remove-wa-${id}`);
  };

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          style={foldButton}
        >
          <Disclosure open={open} />
          <span style={groupName}>
            {t('whatsapp.title', 'WhatsApp Business')}
          </span>
          <span style={hint}>
            {accounts.length === 0
              ? t('whatsapp.summaryNone', 'No numbers connected')
              : accounts.length === 1
              ? t('whatsapp.summaryOne', '1 number connected')
              : t('whatsapp.summaryCount', '{{count}} numbers connected', { count: accounts.length })}
          </span>
          {needs > 0 && (
            <span style={{ ...badge, ...needsBadge }}>
              <Dot color="var(--cth-coral)" />
              {t('whatsapp.needsCount', '{{count}} needs you', { count: needs })}
            </span>
          )}
        </button>

        <InfoTip
          label={t('whatsapp.title', 'WhatsApp Business')}
          text={t(
            'whatsapp.intro',
            'Connect WhatsApp Business Cloud API phone numbers. Assign one number to an agent on their Access tab (e.g. Customer Support or Sales).'
          )}
        />
        <span style={{ flex: 1 }} />
        <span data-focus="add-wa">
          <PixelButton variant="primary" size="sm" onClick={() => setDialog({})}>
            {t('whatsapp.add', 'Add a WhatsApp number')}
          </PixelButton>
        </span>
      </div>

      <div style={hint}>{t('whatsapp.sendOnlyNote')}</div>

      {failed && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--cth-ink-900)' }}>
          ! {t('capabilities.saveFailed', 'Save failed. Try again.')}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--cth-dur-base) var(--cth-ease)'
        }}
      >
        <div
          style={{
            overflow: 'hidden',
            minHeight: 0,
            visibility: open ? 'visible' : 'hidden',
            transition: `visibility 0s linear ${open ? '0s' : 'var(--cth-dur-base)'}`
          }}
        >
          <div id={listId}>
            {accounts.length > 0 && (
              <div role="list">
                {accounts.map((a) => {
                  const users = usersOf(a.id);
                  const needsYou = a.status === 'needs-attention';
                  return (
                    <div key={a.id} role="listitem" style={row}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{a.label}</div>
                        <div style={hint}>
                          {a.displayPhoneNumber || `ID: ${a.phoneNumberId}`}
                          {' · '}
                          {users.length ? t('whatsapp.usedBy', 'Used by {{names}}', { names: list(users) }) : t('whatsapp.usedByNobody', 'Not assigned to anyone')}
                        </div>
                        {needsYou && a.statusReason && (
                          <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-900)' }}>
                            ! {a.statusReason}
                          </div>
                        )}
                        <WhatsAppDraftList accountId={a.id} nameOf={nameOf} />
                        {confirming === a.id && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13 }}>
                              {t('whatsapp.sure', 'Remove this number?')}
                              {users.length ? ` ${t('whatsapp.removeAffects', '{{names}} will lose access.', { names: list(users) })}` : ''}
                            </span>
                            <MiniButton tone="destructive" autoFocus onClick={() => void remove(a.id)}>
                              {t('whatsapp.removeIt', 'Remove it')}
                            </MiniButton>
                            <MiniButton onClick={() => { setConfirming(null); refocus(`remove-wa-${a.id}`); }}>
                              {t('common.keep', 'Keep')}
                            </MiniButton>
                          </div>
                        )}
                      </div>

                      <span style={{ ...badge, ...(needsYou ? needsBadge : okBadge) }}>
                        <Dot color={needsYou ? 'var(--cth-coral)' : 'var(--cth-mint)'} />
                        {needsYou ? t('whatsapp.statusNeeds', 'needs you') : t('whatsapp.statusConnected', 'connected')}
                      </span>

                      <span data-focus={`fix-wa-${a.id}`}>
                        <PixelButton variant={needsYou ? 'secondary' : 'ghost'} size="sm" onClick={() => setDialog({ fix: a })}>
                          {needsYou ? t('whatsapp.fix', 'Fix') : t('common.edit', 'Edit')}
                        </PixelButton>
                      </span>

                      {confirming !== a.id && (
                        <span data-focus={`remove-wa-${a.id}`}>
                          <PixelButton variant="ghost" size="sm" onClick={() => setConfirming(a.id)}>
                            {t('common.remove', 'Remove')}
                          </PixelButton>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {dialog && (
        <AddWhatsAppDialog
          fix={dialog.fix}
          onClose={() => {
            refocus(dialog.fix ? `fix-wa-${dialog.fix.id}` : 'add-wa');
            setDialog(null);
          }}
          onSaved={() => {
            refocus(dialog.fix ? `fix-wa-${dialog.fix.id}` : 'add-wa');
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" style={{ width: 8, height: 8, background: color, display: 'inline-block' }} />;
}

const hint: CSSProperties = { fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-500)' };
const foldButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'start',
  fontFamily: 'var(--cth-font-ui)',
  color: 'var(--cth-ink-900)'
};
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 0',
  borderTop: '1px solid var(--cth-ink-100)'
};
const badge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 13,
  lineHeight: '20px',
  padding: '0 6px',
  flexShrink: 0
};
const okBadge: CSSProperties = { background: 'var(--cth-mint-light, #E0F8EE)', color: 'var(--cth-ink-900)' };
const needsBadge: CSSProperties = { background: 'var(--cth-coral-light, #FFE6E6)', color: 'var(--cth-ink-900)' };
