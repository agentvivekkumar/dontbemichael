import { useEffect, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type QueuedMessage } from '@/store/store';
import type { HarnessConfig } from '@/store/config';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useMissions } from '@/components/triggers/ScheduleList';
import { nextRunAt } from '@shared/missions';
import { isComposingKey } from '@shared/imeGuard';
import { GrowingTextarea } from '@/components/GrowingTextarea';

const EMPTY_QUEUE: QueuedMessage[] = [];

/**
 * The v2 bottom bar (branding/DESIGN.md 7.19), floating over the stage: brief
 * Michael, see the next scheduled job, and hire. The composer queues into
 * Michael's terminal exactly like the composer on his Work tab: same store
 * queue, same draft, same attachment convention.
 */
export function BottomBar({ config }: { config: HarnessConfig }) {
  return (
    <div style={{
      position: 'absolute', insetInlineStart: 24, insetInlineEnd: 22, bottom: 24, zIndex: 70,
      display: 'flex', alignItems: 'flex-end', gap: 14, pointerEvents: 'none'
    }}>
      <TalkToMichael />
      {/* Centered on the composer's resting height, so they stay put while a
          long message grows the composer upward. */}
      <div style={{ height: 50, display: 'flex', alignItems: 'center', gap: 14 }}>
        <NextJobChip />
        <PackAndHire config={config} />
      </div>
    </div>
  );
}

interface Attachment { path: string; name: string }

function TalkToMichael() {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const god = useStore((s) => s.agents.find((a) => a.isGod));
  const godId = god?.id ?? 'god';
  const text = useStore((s) => s.drafts[godId] ?? '');
  const setDraft = useStore((s) => s.setDraft);
  const enqueueMessage = useStore((s) => s.enqueueMessage);
  const queue = useStore((s) => s.messageQueues[godId]) ?? EMPTY_QUEUE;
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const add = (incoming: Attachment[]) => setAttachments((prev) => {
    const seen = new Set(prev.map((a) => a.path));
    return [...prev, ...incoming.filter((a) => a.path && !seen.has(a.path))];
  });
  const pick = async () => { const res = await window.cth.attachFiles(); if (res.ok) add(res.files); };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []);
    add(files.map((f) => ({ path: window.cth.pathForFile(f), name: f.name })).filter((a) => a.path));
  };

  const canSend = !!god && (!!text.trim() || attachments.length > 0);
  const send = () => {
    if (!canSend) return;
    // Same "Attached files:" convention as MessageQueueComposer, so Michael reads
    // the files by path.
    const body = attachments.length
      ? (text.trim() ? `${text}\n\nAttached files:\n` : 'Attached files:\n') + attachments.map((a) => `- ${a.path} (${a.name})`).join('\n')
      : text;
    enqueueMessage(godId, body);
    void window.cth.trackMessageSent('composer');
    setDraft(godId, '');
    setAttachments([]);
  };
  // Enter sends; Shift+Enter starts a new line (the box grows with it).
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={{
        pointerEvents: 'auto', position: 'relative',
        // The buttons stay on the bottom row while the message grows upward.
        width: 420, minHeight: 50, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '7px 7px 7px 8px',
        background: 'var(--cth-card)', borderRadius: 'var(--cth-r-2xl)',
        boxShadow: 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-lg)'
      }}
    >
      <button onClick={() => void pick()} aria-label={t('shell.attach')} title={t('shell.attach')} style={{
        width: 34, height: 34, flexShrink: 0, border: 'none', borderRadius: 'var(--cth-r-md)', cursor: 'pointer',
        display: 'grid', placeItems: 'center', background: 'var(--cth-neutral-soft)', color: 'var(--cth-ink-2)'
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
        </svg>
      </button>
      <div style={{ flex: 1, minWidth: 0, alignSelf: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {attachments.map((a) => (
              <span key={a.path} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 3px 0 8px',
                borderRadius: 'var(--cth-r-pill)', background: 'var(--cth-neutral-soft)', fontSize: 11, color: 'var(--cth-ink-2)'
              }}>
                {a.name}
                <button onClick={() => setAttachments((p) => p.filter((x) => x.path !== a.path))}
                  aria-label={t('shell.removeAttachment', { name: a.name })}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cth-ink-3)', fontSize: 10 }}>✕</button>
              </span>
            ))}
          </div>
        )}
        <GrowingTextarea
          value={text}
          onChange={(e) => setDraft(godId, e.target.value)}
          onKeyDown={onKey}
          placeholder={t('shell.briefPlaceholder', { godName })}
          aria-label={t('shell.brief', { godName })}
          maxHeight={140}
          style={{
            display: 'block', boxSizing: 'border-box', padding: '1px 0', margin: 0,
            border: 'none', outline: 'none', background: 'transparent', width: '100%',
            fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink)'
          }}
        />
      </div>
      <button onClick={send} disabled={!canSend} style={{
        height: 36, padding: '0 14px', flexShrink: 0, border: 'none', borderRadius: 11,
        display: 'inline-flex', alignItems: 'center', gap: 7, cursor: canSend ? 'pointer' : 'default',
        background: canSend ? 'var(--cth-ink)' : 'var(--cth-neutral-soft)', color: canSend ? 'var(--cth-bg)' : 'var(--cth-ink-3)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600
      }}>
        {t('shell.send')}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
      {queue.length > 0 && (
        <span style={{
          position: 'absolute', top: -10, insetInlineEnd: 12, height: 20, padding: '0 8px',
          display: 'inline-flex', alignItems: 'center', borderRadius: 'var(--cth-r-pill)',
          background: 'var(--cth-indigo-soft)', color: 'var(--cth-indigo-text)', fontSize: 11, fontWeight: 600,
          boxShadow: 'var(--cth-shadow-sm)'
        }}>{t('shell.queued', { count: queue.length, godName })}</span>
      )}
    </div>
  );
}

/** The next scheduled job across the office. Click opens Michael's Office schedule. */
function NextJobChip() {
  const { t } = useTranslation();
  const { missions } = useMissions();
  const agents = useStore((s) => s.agents);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);

  let best: { at: number; label: string; who?: string } | null = null;
  for (const m of missions) {
    // Auto-compaction is housekeeping, not a job anyone asked for.
    if (!m.enabled || m.kind === 'compact') continue;
    const at = nextRunAt(m, now);
    if (at === null) continue;
    if (!best || at < best.at) {
      const who = (m.to === 'god' ? agents.find((a) => a.isGod) : agents.find((a) => a.id === m.to))?.name;
      best = { at, label: m.label, who };
    }
  }
  if (!best) return null;
  const when = new Date(best.at);
  const sameDay = when.toDateString() === new Date(now).toDateString();
  const time = sameDay
    ? when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : when.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  const open = () => {
    const god = useStore.getState().agents.find((a) => a.isGod);
    if (god) useStore.getState().select(god.id);
    useStore.getState().requestCommandCenterTab('triggers');
  };
  return (
    <button onClick={open} style={{
      pointerEvents: 'auto', height: 40, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 8,
      maxWidth: 360, border: 'none', borderRadius: 'var(--cth-r-lg)', cursor: 'pointer',
      background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)',
      fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, color: 'var(--cth-ink-2)', whiteSpace: 'nowrap'
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
      </svg>
      {t('shell.next')}
      <span style={{ fontFamily: 'var(--cth-font-mono)', fontWeight: 600, color: 'var(--cth-ink)' }}>{time}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{best.who ? `${best.who}, ${best.label}` : best.label}</span>
    </button>
  );
}

/** Which pack the team came from, and the Hire button (opens the hire wizard). */
function PackAndHire({ config }: { config: HarnessConfig }) {
  const { t } = useTranslation();
  const [pack, setPack] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void window.cth.packsList().then((res) => {
      if (!alive) return;
      const p = res.packs.find((x) => x.pack.businessType === config.businessType)?.pack;
      setPack(p?.displayName ?? null);
    }).catch(() => { /* no pack line */ });
    return () => { alive = false; };
  }, [config.businessType]);

  return (
    <div style={{ marginInlineStart: 'auto', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
      {pack && <span style={{ fontSize: 11.5, color: 'var(--cth-ink-3)', whiteSpace: 'nowrap' }}>{t('shell.teamFromPack', { pack })}</span>}
      <button onClick={() => useStore.getState().setAddAgentOpen(true)} style={{
        height: 32, padding: '0 13px', display: 'inline-flex', alignItems: 'center', gap: 6,
        border: 'none', borderRadius: 10, cursor: 'pointer',
        background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-sm)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--cth-ink)'
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        {t('shell.hire')}
      </button>
    </div>
  );
}
