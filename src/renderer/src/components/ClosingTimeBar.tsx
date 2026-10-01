import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
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

export interface ClosingTimeBarProps {
  /** Null until main's first event; the bar still shows "starting". */
  closing: ClosingTimeState | null;
  /** Back to work: closing time is called off and nothing quits. */
  onCancel: () => void;
  /** Quit now without waiting (a hard quit; unsaved work is lost). */
  onForceQuit: () => void;
  /** Start closing time again after a refused start. */
  onRetry: () => void;
}

/**
 * Closing time on the office floor (owner, 2026-09-30: the quit dialog
 * defeated the lights going out). Quitting starts closing time straight away;
 * this bar takes the bottom bar's place and says how many people are still
 * working while their pods go dark one by one. Who is still working, with
 * Remind and Close without them, opens under it. Cancel goes back to work;
 * Force quit asks once, because unsaved work is lost.
 */
export function ClosingTimeBar({ closing, onCancel, onForceQuit, onRetry }: ClosingTimeBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = closing;
  const error = c?.phase === 'error';
  const done = c?.phase === 'complete';
  const waiting = c?.waiting?.length ?? 0;
  const pct = c && c.total > 0 ? Math.min(100, Math.round((c.acked / c.total) * 100)) : done ? 100 : 0;
  const force = async () => { setBusy(true); onForceQuit(); };

  const status = error
    ? (c?.error ?? t('quit.startFailed'))
    : done
      ? (c?.relaunch ? t('quit.savedReopen') : t('quit.saved'))
      : !c || c.total === 0 && c.phase === 'started'
        ? t('closingBar.starting')
        : headerLine(c, t);

  return (
    <div role="region" aria-label={t('closingBar.title')} style={{
      position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 80,
      width: 'min(720px, calc(100% - 48px))', display: 'flex', flexDirection: 'column',
      background: 'var(--cth-card)', borderRadius: 'var(--cth-r-xl)', fontFamily: 'var(--cth-font-ui)',
      boxShadow: `inset 0 0 0 1px ${error ? 'color-mix(in srgb, var(--cth-coral) 45%, transparent)' : 'var(--cth-line)'}, var(--cth-shadow-lg)`
    }}>
      {/* Who is still working, above the bar so it opens upward from it. */}
      {open && c && !error && (
        <div style={{ padding: '6px 16px 2px', maxHeight: 300, overflowY: 'auto', borderBottom: '1px solid var(--cth-line)' }}>
          {c.phase === 'timeout' && c.godLive !== false && (
            <div style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)', padding: '6px 0' }}>{t('quit.slow')}</div>
          )}
          <ClosingTimeRows closing={c} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 14px', minHeight: 56, boxSizing: 'border-box' }}>
        <span aria-hidden="true" style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
          background: error ? 'var(--cth-coral-soft)' : 'var(--cth-indigo-soft)', color: error ? 'var(--cth-coral-text)' : 'var(--cth-indigo-text)'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <b style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--cth-ink)', flexShrink: 0 }}>{t('closingBar.title')}</b>
            <span role="status" aria-live="polite" style={{ fontSize: 12.5, color: error ? 'var(--cth-coral-text)' : 'var(--cth-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status}</span>
          </div>
          {!error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--cth-line)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 2, background: done ? 'var(--cth-green)' : 'var(--cth-indigo)', transition: 'width 600ms var(--cth-ease)' }} />
              </span>
              {c && !done && waiting > 0 && (
                <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={linkBtn}>
                  {open ? t('closingBar.hideWho') : (waiting === 1 ? t('closingBar.left', { count: waiting }) : t('closingBar.leftPlural', { count: waiting }))}
                </button>
              )}
            </div>
          )}
        </div>
        {!done && (
          confirmForce ? (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--cth-ink-2)', maxWidth: 170 }}>{t('closingBar.confirmForce')}</span>
              <button type="button" className="cth-toast-btn" autoFocus onClick={() => setConfirmForce(false)}>{t('closingBar.keepClosing')}</button>
              <button type="button" className="cth-toast-btn" style={{ background: 'var(--cth-coral-strong)', color: '#fff', boxShadow: 'none' }} disabled={busy} onClick={() => { void force(); }}>
                {busy ? t('quit.killing') : t('quit.forceQuit')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {error && <button type="button" className="cth-toast-btn primary" onClick={onRetry}>{t('closingBar.tryAgain')}</button>}
              <button type="button" className="cth-toast-btn" onClick={onCancel}>{t('quit.cancelBack')}</button>
              <button type="button" className="cth-toast-btn" style={{ color: 'var(--cth-coral-text)' }} onClick={() => setConfirmForce(true)}>{t('quit.forceQuit')}</button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

const linkBtn: CSSProperties = {
  flexShrink: 0, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--cth-indigo-text)'
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
