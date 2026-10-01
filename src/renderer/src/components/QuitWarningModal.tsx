import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { PixelButton } from './PixelButton';
import { Dialog } from '@/shell/Dialog';
import { MiniButton } from './triggers/ui';
import { ACTION_AT_PROMPT, actionText, useStore, type Agent } from '@/store/store';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { CLOSING_TIME_REMIND_MS } from '@shared/closingTime';
import { actionMessage, describeRow, headerLine } from './closingTimeRows';

/** Renderer-side closing-time view state. Mirrors the main process's
 *  ClosingTimeEvent phases, plus a local 'error' for a failed start. */
export interface ClosingTimeState {
  phase: 'started' | 'progress' | 'complete' | 'timeout' | 'error';
  acked: number;
  total: number;
  error?: string;
  /** Who confirmed, who is still being waited on, who the owner closed
   *  without, and Michael's id (main's ClosingTimeEvent). Absent on 'error'. */
  confirmed?: string[];
  waiting?: string[];
  excused?: string[];
  godId?: string;
  godLive?: boolean;
  /** The app reopens itself once closed (a Claude Code update). */
  relaunch?: boolean;
}

export interface QuitWarningModalProps {
  ptyCount: number;
  /** Non-null while the closing-time protocol runs — switches the dialog into
   *  the "wrapping up the floor" progress view. */
  closing?: ClosingTimeState | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** Start the graceful shutdown (the third button). */
  onClosingTime?: () => void;
}

export function QuitWarningModal({ ptyCount, closing, onCancel, onConfirm, onClosingTime }: QuitWarningModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    await onConfirm();
    // No need to clear busy — the app is quitting.
  };

  const inClosingTime = !!closing && closing.phase !== 'error';
  const many = ptyCount !== 1;

  // Above EVERY modal, not just most of them (zIndex 1000). Modals in this app
  // sit at 500 (add agent, edit agent, the release drop) and overlays below
  // that. At 300 this dialog opened BEHIND the release drop, so clicking quit
  // with a drop on screen looked like quit did nothing, while a hidden dialog
  // held the app open. This is the last thing the user is asked before the
  // process dies; it outranks whatever it interrupts.
  if (inClosingTime) {
    const c = closing!;
    return (
      <Dialog
        title={t('quit.closingTitle')}
        onClose={onCancel}
        closable={false}
        width={520}
        zIndex={1000}
        footer={c.phase !== 'complete' ? (
          <>
            <PixelButton variant="secondary" size="md" onClick={onCancel} disabled={busy}>{t('quit.cancelBack')}</PixelButton>
            <PixelButton variant="destructive" size="md" onClick={confirm} disabled={busy}>{busy ? t('quit.killing') : t('quit.forceQuit')}</PixelButton>
          </>
        ) : undefined}
      >
        <Lead
          tone={c.phase === 'complete' ? 'green' : 'amber'}
          title={c.phase === 'complete'
            ? (c.relaunch ? t('quit.savedReopen') : t('quit.saved'))
            : c.phase === 'timeout' ? t('quit.stillWrapping') : t('quit.wrapping')}
          body={c.phase === 'complete'
            ? (c.relaunch ? t('quit.savedBodyRelaunch') : t('quit.savedBody'))
            : (c.relaunch ? t('quit.wrappingBodyRelaunch') : t('quit.wrappingBody'))}
        />
        <div style={strip}>
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontWeight: 500 }}>{headerLine(closing!, t)}</span>
          {/* "Keep waiting" is wrong once Michael's terminal has ended. */}
          {closing!.phase === 'timeout' && closing!.godLive !== false && (
            <div style={{ marginTop: 6 }}>{t('quit.slow')}</div>
          )}
        </div>
        <ClosingTimeRows closing={c} />
      </Dialog>
    );
  }

  return (
    <Dialog
      title={t('quit.title')}
      onClose={onCancel}
      busy={busy}
      width={520}
      zIndex={1000}
      footer={(
        <>
          <PixelButton variant="secondary" size="md" onClick={onCancel} disabled={busy}>{t('quit.keepRunning')}</PixelButton>
          {onClosingTime && (
            <PixelButton variant="primary" size="md" onClick={onClosingTime} disabled={busy}>{t('quit.closingTime')}</PixelButton>
          )}
          <PixelButton variant="destructive" size="md" onClick={confirm} disabled={busy}>
            {busy ? t('quit.killing') : many ? t('quit.killQuitPlural') : t('quit.killQuit')}
          </PixelButton>
        </>
      )}
    >
      <Lead
        tone="coral"
        title={many ? t('quit.runningPlural', { count: ptyCount }) : t('quit.running', { count: ptyCount })}
        body={many ? t('quit.bodyPlural', { count: ptyCount }) : t('quit.body')}
      />
      <div style={strip}>{t('quit.tip')}</div>
      {closing?.phase === 'error' && (
        <div role="alert" style={errorStyle}>{closing.error ?? t('quit.startFailed')}</div>
      )}
    </Dialog>
  );
}

/** The icon, headline and sentence at the top of the dialog. */
function Lead({ tone, title, body }: { tone: 'coral' | 'amber' | 'green'; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
        background: `var(--cth-${tone}-soft)`, color: `var(--cth-${tone}-text)`
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {tone === 'green' ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>}
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cth-ink)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-2)' }}>{body}</div>
      </div>
    </div>
  );
}

const strip: CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-card-2)',
  boxShadow: 'inset 0 0 0 1px var(--cth-line)', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)'
};


/**
 * Who is still working at closing time (owner, 2026-09-29): one row per team
 * member being waited on, then those closed without, then those who
 * confirmed, then Michael. A waiting row says what the agent is doing (the
 * hook's safe one-line detail, or its caption) and for how long, with Remind
 * and Close without them. Rows always come from main's
 * latest event; only "Reminded" and the confirm step are local.
 */
function ClosingTimeRows({ closing }: { closing: ClosingTimeState }) {
  const { t } = useTranslation();
  // Only the agents on the list: the store changes on every burst of terminal
  // output from any agent, and the dialog need not re-render for the others.
  const listed = new Set([...(closing.waiting ?? []), ...(closing.excused ?? []), ...(closing.confirmed ?? []), closing.godId ?? '']);
  const agents = useStore(useShallow((s) => s.agents.filter((a) => listed.has(a.id))));
  const godName = useResolvedGodName();
  const [now, setNow] = useState(() => Date.now());
  const [reminded, setReminded] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState<Record<string, string | undefined>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  // A Remind or Close without them on its way: its buttons wait, so a double
  // click cannot send twice.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // Keyboard focus returns to a row's Close without them when its confirm
  // closes, since the confirm replaced it (review, owner 2026-09-29).
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const keepButton = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [refocus, setRefocus] = useState<string | null>(null);
  useEffect(() => {
    if (!refocus) return;
    // "keep" = the open confirm's Keep waiting (a refused Close without them).
    // The confirm (or the whole row) may be gone by the time a refusal lands.
    ((refocus === 'keep' ? keepButton.current : triggers.current[refocus]) ?? listRef.current)?.focus();
    setRefocus(null);
  }, [refocus]);
  // Minutes on screen move without waiting for the next event.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const godId = closing.godId;
  if (!godId) return null;
  const waiting = closing.waiting ?? [];
  const excused = closing.excused ?? [];
  const confirmed = closing.confirmed ?? [];
  const byId = (id: string): Agent | undefined => agents.find((a) => a.id === id);
  const nameOf = (id: string): string => (id === godId ? godName : byId(id)?.name ?? id);
  const done = closing.phase === 'complete';

  // A refusal is shown on the row, never taken as success; a refused Close
  // without them keeps its confirm open (owner, 2026-09-29).
  const act = async (id: string, kind: 'remind' | 'excuse'): Promise<void> => {
    if (busy[id]) return;
    setBusy((b) => ({ ...b, [id]: true }));
    setFailed((f) => ({ ...f, [id]: undefined }));
    let res: { ok: boolean; error?: string } | undefined;
    try {
      res = kind === 'remind' ? await window.cth.closingTimeRemind(id) : await window.cth.closingTimeExcuse(id);
    } catch { res = undefined; }
    setBusy((b) => ({ ...b, [id]: false }));
    const message = actionMessage(res, t('closingTime.sendFailed'));
    // The pressed button was disabled while in flight, which drops keyboard
    // focus: put it back on the row (review, owner 2026-09-29).
    if (message) { setFailed((f) => ({ ...f, [id]: message })); setRefocus(kind === 'excuse' ? 'keep' : id); return; }
    if (kind === 'remind') setReminded((r) => ({ ...r, [id]: Date.now() }));
    else setConfirming(null);
    setRefocus(id);
  };
  const keepWaiting = (id: string): void => { setConfirming(null); setRefocus(id); };

  const remindButton = (id: string) => (now - (reminded[id] ?? -Infinity) < CLOSING_TIME_REMIND_MS
    ? <span style={hint}>{t('closingTime.reminded')}</span>
    : <MiniButton disabled={!!busy[id]} onClick={() => { void act(id, 'remind'); }}>{t('closingTime.remind')}</MiniButton>);

  // What an agent is doing now, and for how long.
  const doing = (a: Agent | undefined) => describeRow(a, now, t, ACTION_AT_PROMPT, actionText);

  const godDone = waiting.length === 0;
  // Michael's terminal ended: nobody can finish the close (review, owner 2026-09-29).
  const godGone = closing.godLive === false;
  return (
    <div ref={listRef} tabIndex={-1} role="list" aria-label={t('closingTime.listLabel')} style={{ outline: 'none', maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {waiting.map((id) => {
        const d = doing(byId(id));
        return (
          <div key={id} role="listitem" style={row}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>{nameOf(id)}</span>
              <span style={hint}>{d.state}</span>
              {!done && (
                <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
                  {remindButton(id)}
                  {confirming !== id && <MiniButton buttonRef={(el) => { triggers.current[id] = el; }} onClick={() => setConfirming(id)}>{t('closingTime.closeWithout')}</MiniButton>}
                </span>
              )}
            </div>
            {d.line && <div style={detailStyle}>{d.line}</div>}
            {confirming === id && (
              <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <span>{t('closingTime.confirmClose', { name: nameOf(id) })}</span>
                <MiniButton tone="destructive" disabled={!!busy[id]} onClick={() => { void act(id, 'excuse'); }}>{t('closingTime.closeWithout')}</MiniButton>
                <MiniButton autoFocus buttonRef={keepButton} onClick={() => keepWaiting(id)}>{t('closingTime.keepWaiting')}</MiniButton>
              </div>
            )}
            {failed[id] && <div role="alert" style={errorStyle}>! {failed[id]}</div>}
          </div>
        );
      })}
      {excused.map((id) => (
        <div key={id} role="listitem" style={row}>
          <span style={{ fontWeight: 600 }}>{nameOf(id)}</span> <span style={hint}>{t('closingTime.excused')}</span>
        </div>
      ))}
      {confirmed.map((id) => (
        <div key={id} role="listitem" style={row}>
          <span style={{ fontWeight: 600 }}>{nameOf(id)}</span> <span style={hint}>{t('closingTime.confirmed')}</span>
        </div>
      ))}
      <div role="listitem" style={row}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{godName}</span>
          <span style={hint}>{godGone ? t('closingTime.michaelEnded') : godDone ? t('closingTime.michaelBoard') : t('closingTime.michaelWaiting')}</span>
          {!done && !godGone && <span style={{ marginInlineStart: 'auto' }}>{remindButton(godId)}</span>}
        </div>
        {godDone && !done && !godGone && (() => { const d = doing(byId(godId)); return d.line ? <div style={detailStyle}>{d.line}</div> : null; })()}
        {failed[godId] && <div role="alert" style={errorStyle}>! {failed[godId]}</div>}
      </div>
    </div>
  );
}

const row: CSSProperties = { padding: '9px 0', borderTop: '1px solid var(--cth-line)', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink)' };
/** Captions and status words (branding/DESIGN.md 4.2). */
const hint: CSSProperties = { fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-3)' };
/** A failed Remind or Close without them, or a closing time that would not
 *  start: coral soft box, coral text, so it reads as an error at AA contrast. */
const errorStyle: CSSProperties = { marginTop: 6, padding: '6px 10px', borderRadius: 'var(--cth-r-md)', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-coral-text)', background: 'var(--cth-coral-soft)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--cth-coral) 35%, transparent)' };
const detailStyle: CSSProperties = { fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)' };
