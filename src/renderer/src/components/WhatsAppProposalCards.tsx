import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { WhatsAppProposal, WhatsAppProposalDecision } from '@shared/whatsappProposals';
import { useStore } from '@/store/store';
import { AgentAvatar } from './AgentAvatar';
import { GrowingTextarea } from './GrowingTextarea';
import { PixelButton } from './PixelButton';
import { partLabel } from './fieldText';

/**
 * Send on approval for WhatsApp Business:
 * Displays WhatsApp proposals waiting on Ask Me.
 * The owner can edit the recipient phone number and message body, then:
 * - Approve (team member sends the approved version)
 * - Ask for changes (with note sent to agent)
 * - Don't send
 */
export function WhatsAppProposalCards({
  proposals,
  refresh
}: {
  proposals: WhatsAppProposal[];
  refresh: () => void;
}) {
  return (
    <>
      {proposals.map((p) => (
        <ProposalCard key={p.id} p={p} refresh={refresh} />
      ))}
    </>
  );
}

const isolate = (s: string): string => `\u2068${s}\u2069`;

const field: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  border: 'none',
  outline: 'none',
  background: 'var(--cth-card)',
  color: 'var(--cth-ink)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 12.5,
  lineHeight: '18px'
};

const label: CSSProperties = partLabel;

const meta: CSSProperties = {
  fontSize: 11.5,
  lineHeight: '16px',
  color: 'var(--cth-ink-2)',
  overflowWrap: 'anywhere'
};

function ProposalCard({ p, refresh }: { p: WhatsAppProposal; refresh: () => void }) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const name = agents.find((a) => a.id === p.agentId)?.name ?? p.agentId;
  const [to, setTo] = useState(p.to);
  const [text, setText] = useState(p.text);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const decide = async (decision: WhatsAppProposalDecision): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await window.cth.decideWhatsAppProposal?.(
        p.id,
        decision,
        decision === 'approve' ? { to, text } : undefined,
        decision === 'changes' ? note : undefined
      );
      if (res && !res.ok) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <section
      aria-label={t('askMe.whatsAppTitle', { name })}
      style={{
        position: 'relative',
        flexShrink: 0,
        padding: '12px 14px',
        borderRadius: 'var(--cth-r-xl)',
        background: 'var(--cth-card)',
        boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'var(--cth-font-ui)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12.5,
          fontWeight: 600,
          lineHeight: '17px',
          color: 'var(--cth-ink)'
        }}
      >
        <AgentAvatar id={p.agentId} name={name} size={17} />
        {t('askMe.whatsAppTitle', { name })}
      </div>

      <div style={meta}>
        <div>{t('askMe.mailTo', { to: isolate(p.to) })}</div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={label}>{t('askMe.mailTo', { to: '' })}</span>
        <input
          className="cth-input"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={busy}
          dir="ltr"
          style={field}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={label}>{t('askMe.mailBody')}</span>
        <GrowingTextarea
          className="cth-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          maxHeight={320}
          dir="auto"
          style={field}
        />
      </label>

      {asking && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={label}>{t('askMe.mailNote')}</span>
          <GrowingTextarea
            className="cth-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            autoFocus
            maxHeight={160}
            dir="auto"
            style={field}
          />
        </label>
      )}

      {failed && (
        <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>
          {t('askMe.mailFailed')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {asking ? (
          <>
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={() => setAsking(false)}
              disabled={busy}
            >
              {t('askMe.mailCancel')}
            </PixelButton>
            <PixelButton
              variant="primary"
              size="sm"
              onClick={() => void decide('changes')}
              disabled={busy || !note.trim()}
            >
              {t('askMe.mailSendNote')}
            </PixelButton>
          </>
        ) : (
          <>
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={() => void decide('decline')}
              disabled={busy}
            >
              {t('askMe.mailDecline')}
            </PixelButton>
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={() => setAsking(true)}
              disabled={busy}
            >
              {t('askMe.mailChanges')}
            </PixelButton>
            <PixelButton
              variant="primary"
              size="sm"
              onClick={() => void decide('approve')}
              disabled={busy || !to.trim() || !text.trim()}
            >
              {t('askMe.approve')}
            </PixelButton>
          </>
        )}
      </div>
    </section>
  );
}
