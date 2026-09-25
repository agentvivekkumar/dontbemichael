import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { useStore } from '@/store/store';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useRtl } from '@/i18n/useDirection';

type HistoryMessage = Awaited<ReturnType<Window['cth']['hiveHistory']>>[number];

/**
 * MESSAGES: an agent's handoff history (owner, 2026-09-25). What it received and
 * what it sent, handled or not, grouped by conversation, newest first. It is
 * the only place handoffs show: the terminal starts blank on every restart and
 * shows a handoff only as a file being written.
 *
 * Read only. The owner talks to a team member through Michael, or in 1:1 with
 * the message box under the terminal (docs/designs/owner-talks-via-michael.md).
 * Routine traffic (scheduler runs, closing time acknowledgements) is dimmed and
 * starts collapsed so the real handoffs stand out.
 */
export interface ThreadsPanelProps {
  agentId: string;
}

interface Thread {
  conversation: string;
  subject: string;
  messages: HistoryMessage[];
  routine: boolean;
}

const ACT_COLOR: Record<string, string> = {
  request: 'var(--cth-peach)', inform: 'var(--cth-sky)', propose: 'var(--cth-lilac)',
  query: 'var(--cth-lemon)', agree: 'var(--cth-mint)', refuse: 'var(--cth-coral)', done: 'var(--cth-mint)'
};

const SYSTEM_SENDERS = new Set(['scheduler', 'heartbeat', 'system', 'breaker']);

/** Traffic that isn't a handoff: the app's own notes and closing time acks. */
export function isRoutine(m: Pick<HistoryMessage, 'from' | 'subject'>): boolean {
  return SYSTEM_SENDERS.has(m.from) || /closing[\s_-]*time/i.test(m.subject ?? '');
}

export function groupThreads(msgs: HistoryMessage[], noSubject: string): Thread[] {
  const by = new Map<string, HistoryMessage[]>();
  for (const m of msgs) {
    const key = m.conversation || m.id;
    const arr = by.get(key) ?? [];
    arr.push(m);
    by.set(key, arr);
  }
  return [...by.entries()]
    .map(([conversation, list]) => {
      const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return {
        conversation,
        subject: sorted[0]?.subject || noSubject,
        messages: sorted,
        routine: sorted.every(isRoutine)
      };
    })
    .sort((a, b) => {
      const la = a.messages[a.messages.length - 1].created_at;
      const lb = b.messages[b.messages.length - 1].created_at;
      return la < lb ? 1 : -1; // newest activity first
    });
}

export function ThreadsPanel({ agentId }: ThreadsPanelProps) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const godName = useResolvedGodName();
  const agents = useStore((s) => s.agents);
  const self = agents.find((a) => a.id === agentId);
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const history = await window.cth.hiveHistory(agentId);
        if (alive) setMessages(history);
      } catch { /* keep last good state */ }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [agentId]);

  const threads = useMemo(() => groupThreads(messages, t('threads.noSubject')), [messages, t]);

  /** The name the owner knows: Michael by his name, "you" for the owner. */
  const nameOf = (id: string): string => {
    const lower = (id || '').toLowerCase();
    if (lower === 'human') return t('threads.you');
    if (lower === 'god' || lower === 'michael') return godName;
    if (lower === 'broadcast') return t('threads.everyone');
    const a = agents.find((x) => x.id === id);
    if (a?.isGod) return godName;
    return a?.name ?? id;
  };

  if (threads.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--cth-paper-200)' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--cth-ink-700)', textAlign: 'center', maxWidth: 280 }}>
          {t('threads.emptyHistory', { name: self?.name ?? agentId })}
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--cth-space-3)', background: 'var(--cth-paper-200)', display: 'flex', flexDirection: 'column', gap: 'var(--cth-space-3)' }}>
      {threads.map((thread) => {
        const open = openThreads[thread.conversation] ?? !thread.routine;
        return (
          <PixelPanel key={thread.conversation} variant="default" noPadding>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenThreads((s) => ({ ...s, [thread.conversation]: !open }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: rtl ? 'right' : 'left',
                padding: '6px 10px', border: 'none', cursor: 'pointer', background: 'var(--cth-cream-200)',
                fontFamily: 'var(--cth-font-ui)', fontSize: 14, lineHeight: '20px', fontWeight: 600,
                color: thread.routine ? 'var(--cth-ink-500)' : 'var(--cth-ink-900)', boxShadow: 'inset 0 -1px 0 var(--cth-ink-300)'
              }}
            >
              <span aria-hidden style={{ width: 12, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {thread.subject}
              </span>
              {thread.routine && <span style={{ fontSize: 13, fontWeight: 400 }}>{t('threads.routine')}</span>}
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--cth-ink-500)' }}>{thread.messages.length}</span>
            </button>

            {open && (
              <div style={{ padding: '8px 10px 10px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {thread.messages.map((m) => {
                  const isExp = expanded[m.id];
                  const long = m.body.length > 160;
                  const shown = isExp || !long ? m.body : m.body.slice(0, 160) + '…';
                  return (
                    <div key={m.id} style={{ boxShadow: 'inset 2px 0 0 var(--cth-ink-100)', paddingLeft: 8, opacity: isRoutine(m) ? 0.75 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
                          {t(m.dir === 'out' ? 'threads.sentTo' : 'threads.receivedFrom', { from: nameOf(m.from), to: nameOf(m.to) })}
                        </span>
                        <span style={{
                          fontSize: 13, lineHeight: '18px', padding: '0 6px',
                          background: 'var(--cth-cream-100)', boxShadow: `inset 0 0 0 1px ${ACT_COLOR[m.act] ?? 'var(--cth-ink-300)'}`,
                          color: 'var(--cth-ink-900)'
                        }}>{m.act}</span>
                        <span style={{ marginInlineStart: 'auto', fontSize: 13, color: 'var(--cth-ink-500)' }}>
                          {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <div dir={rtl ? 'auto' : undefined} style={{ fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-700)', marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {shown}
                        {long && (
                          <button
                            type="button"
                            onClick={() => setExpanded((s) => ({ ...s, [m.id]: !isExp }))}
                            style={{ marginInlineStart: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cth-sky)', fontSize: 13, padding: 0 }}
                          >{isExp ? t('threads.less') : t('threads.more')}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PixelPanel>
        );
      })}
    </div>
  );
}
