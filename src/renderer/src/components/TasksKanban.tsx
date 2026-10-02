import { askTitle } from './askHeadline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { InfoTip } from './InfoTip';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { useRtl } from '@/i18n/useDirection';
import { isReplacedAsk, openAskIndex } from '@shared/askMeRouting';
import { useDialog } from '@/shell/useDialog';
import { useBackdropClose } from '@/hooks/useBackdropClose';

/** A card on the task kanban. Mirrors HiveTask in the main/preload process —
 *  re-declared locally so the renderer doesn't reach into the preload package
 *  (same convention as store/config.ts). */
export interface HumanQA {
  q: string;
  a?: string;
  askedAt?: string;
  answeredAt?: string;
  /** Set when the human dismisses the ask from the ASK ME board WITHOUT
   *  answering — the question stays on the card (history is preserved) but
   *  openQuestion() stops returning it, so the card leaves ASK ME. */
  dismissedAt?: string;
  /** The agent whose work needs the answer, and which learns from it; "god"
   *  when Michael raised it himself. */
  raisedBy?: string;
}

export interface HiveTask {
  id: string;
  title: string;
  description?: string;
  /** The running notes agents keep on a card (Michael is told the owner reads them). */
  notes?: string;
  assignee?: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  dependsOn: string[];
  priority: number;
  createdAt: string;
  /** First-class human feedback: the god appends {q} when a card needs the
   *  human; the ASK ME view fills in {a}. Full history stays on the card. */
  humanQA?: HumanQA[];
}

/** The card's currently open question for the human, if any. An entry the human
 *  dismissed (dismissedAt) counts as resolved, same as an answered one. */
export function openQuestion(t: HiveTask): HumanQA | undefined {
  // Only the newest ask can be open; an older unanswered one was replaced by it
  // (askMeRouting.ts openAskIndex, owner 2026-09-25).
  const i = openAskIndex(t.humanQA);
  return i >= 0 ? t.humanQA![i] : undefined;
}

/** Waiting on the human = blocked with an unanswered question on the card. */
export function waitsOnHuman(t: HiveTask): boolean {
  return t.status === 'blocked' && !!openQuestion(t);
}

type Status = HiveTask['status'];

// Design v2 (branding/DESIGN.md 7.20): each column's key dot and chip colors.
const COLUMNS: { key: Status; labelKey: string; accent: string; soft: string; text: string }[] = [
  { key: 'todo',    labelKey: 'kanban.colTodo',    accent: 'var(--cth-ink-4)',      soft: 'var(--cth-neutral-soft)', text: 'var(--cth-ink-2)' },
  { key: 'doing',   labelKey: 'kanban.colDoing',   accent: 'var(--cth-blue)',       soft: 'var(--cth-blue-soft)',    text: 'var(--cth-blue-text)' },
  { key: 'blocked', labelKey: 'kanban.colBlocked', accent: 'var(--cth-coral-base)', soft: 'var(--cth-coral-soft)',   text: 'var(--cth-coral-text)' },
  { key: 'done',    labelKey: 'kanban.colDone',    accent: 'var(--cth-green)',      soft: 'var(--cth-green-soft)',   text: 'var(--cth-green-text)' }
];
/** How many done cards show before "N more" (DESIGN.md 7.20). */
const DONE_SHOWN = 5;

const POLL_MS = 5000;

/** Deterministic fallback id derived from a task's content (djb2 → base36).
 *  Used for tasks lacking a valid string id so re-parsing tasks.json on every
 *  5s poll yields the SAME id — no React key churn / card remount. Unlike
 *  shortId() (random, for brand-new tasks), this never changes across polls. */
function stableId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) ^ seed.charCodeAt(i)) | 0;
  return `t-${(h >>> 0).toString(36)}`;
}

/** Normalize whatever hive:tasks returns into a typed task array. The god
 *  writes this file by hand — every field except the shape itself is optional
 *  in practice, so EVERY consumer must go through this (exported for the
 *  detail overlay; a raw card without dependsOn once crashed it). */
export function parseTasks(raw: unknown): HiveTask[] {
  const list = (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks))
    ? (raw as { tasks: unknown[] }).tasks
    : [];
  return list
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t, i) => ({
      id: typeof t.id === 'string' && t.id
        ? t.id
        : stableId(`${typeof t.title === 'string' ? t.title : ''}|${typeof t.createdAt === 'string' ? t.createdAt : ''}|${i}`),
      title: typeof t.title === 'string' ? t.title : '(untitled)',
      // The app writes "description" (a Slack or webhook request); agents keep
      // their running "notes" (owner, 2026-10-01: the detail showed neither on
      // most cards). The detail shows both.
      description: typeof t.description === 'string' ? t.description : undefined,
      notes: typeof t.notes === 'string' ? t.notes : undefined,
      assignee: typeof t.assignee === 'string' ? t.assignee : undefined,
      status: (['todo', 'doing', 'blocked', 'done'] as const).includes(t.status as Status)
        ? (t.status as Status) : 'todo',
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter((d): d is string => typeof d === 'string') : [],
      priority: typeof t.priority === 'number' ? t.priority : 3,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      humanQA: Array.isArray(t.humanQA)
        ? (t.humanQA as unknown[])
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { q?: unknown }).q === 'string')
          .map((e) => ({
            q: e.q as string,
            a: typeof e.a === 'string' ? e.a : undefined,
            askedAt: typeof e.askedAt === 'string' ? e.askedAt : undefined,
            answeredAt: typeof e.answeredAt === 'string' ? e.answeredAt : undefined,
            // Preserve a dismissal across the 5s re-parse, else the card would
            // resurface on the next poll (openQuestion would see it as open).
            dismissedAt: typeof e.dismissedAt === 'string' ? e.dismissedAt : undefined
          }))
        : undefined
    }));
}

/**
 * Task kanban over hive/tasks.json — a READ surface. Polls every 5s; cards
 * carry just the title and open the app-wide detail overlay on click. The god
 * is the ledger's writer: new work enters via the dispatch box (mailed to the
 * god), never by the human inserting cards the orchestrator never heard about.
 */
export function TasksKanban() {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const agents = useStore((s) => s.agents);
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  // Detail view: cards show just the title — clicking one opens the full
  // breakdown as an APP-WIDE overlay over the office floor (see
  // TaskDetailOverlay) — the content grows (contracts, deps, human Q&A), so it
  // gets the big stage instead of the narrow side panel.
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try { setTasks(parseTasks(await window.cth.hiveTasks())); } catch { /* keep last good */ }
  }, []);

  // Dismiss a card off the board (human-initiated). The kanban is otherwise the
  // god's to write, but a person can clear a card they no longer want tracked.
  // Main removes the named id from its latest on-disk ledger, so a webhook or
  // god card added since this renderer's last poll cannot be lost.
  const dismissTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id)); // optimistic
    try {
      const result = await window.cth.hiveDeleteTask(id);
      if (!result.ok) void refresh();
    } catch { /* keep last good; the next poll re-syncs from disk */ }
  }, [refresh]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  const restorableAgents = useStore((s) => s.restorableAgents);
  /** Resolve an assignee id to a display name — falls back to the restorable
   *  roster so a done card keeps its author's name even after that worker's
   *  terminal is gone, then to the raw id. */
  const nameFor = (id?: string): string | undefined =>
    id
      ? (agents.find((a) => a.id === id)?.name
        ?? restorableAgents.find((a) => a.id === id)?.name
        ?? id)
      : undefined;

  const [showAllDone, setShowAllDone] = useState(false);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', padding: '18px 24px 0' }}>
      {/* Header (DESIGN.md 7.20): the board's counts, and why there is no add
          button: new work goes through Michael, who writes the ledger. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--cth-ink)' }}>{t('floorView.tasks')}</h1>
        <InfoTip text={t('floorView.tasksIntro')} />
        {COLUMNS.map((col) => (
          <span key={col.key} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 999,
            background: col.key === 'blocked' || col.key === 'done' ? col.soft : 'var(--cth-card)',
            boxShadow: col.key === 'blocked' || col.key === 'done' ? 'none' : 'inset 0 0 0 1px var(--cth-line)',
            fontSize: 11.5, fontWeight: 500, color: col.key === 'blocked' || col.key === 'done' ? col.text : 'var(--cth-ink-2)'
          }}>
            <i style={{ width: 6, height: 6, borderRadius: 2, background: col.accent, display: 'block' }} />
            {t(col.labelKey)}
            <b style={{ fontFamily: 'var(--cth-font-mono)', fontWeight: 600 }}>{tasks.filter((x) => x.status === col.key).length}</b>
          </span>
        ))}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--cth-ink-3)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          {t('kanban.newWorkHint', { godName })}
        </span>
      </div>

      {/* Columns */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
        {COLUMNS.map((col) => {
          const all = tasks.filter((x) => x.status === col.key);
          // Done reads newest first, folded or not (it is kept in creation order).
          const cards = col.key === 'done' ? (showAllDone ? [...all].reverse() : all.slice(-DONE_SHOWN).reverse()) : all;
          return (
            <div key={col.key} style={{
              flex: '1 1 0', minWidth: 200, display: 'flex', flexDirection: 'column', borderRadius: 'var(--cth-r-xl)',
              background: col.key === 'blocked' ? 'var(--cth-coral-soft)' : 'color-mix(in srgb, var(--cth-floor) 55%, transparent)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 14px 8px', fontSize: 13, fontWeight: 600, color: col.key === 'blocked' ? col.text : 'var(--cth-ink)' }}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: col.accent, display: 'block' }} />
                {t(col.labelKey)}
                <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11.5, fontWeight: 500, color: 'var(--cth-ink-3)' }}>{all.length}</span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 10px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {all.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--cth-ink-3)', textAlign: 'center', padding: '10px 0' }}>{t('kanban.empty')}</div>
                )}
                {cards.map((x) => (
                  <TaskCard
                    key={x.id}
                    task={x}
                    accent={col.accent}
                    done={col.key === 'done'}
                    assigneeName={nameFor(x.assignee)}
                    onOpen={() => openTaskDetail(x.id)}
                    onDismiss={() => dismissTask(x.id)}
                  />
                ))}
                {col.key === 'done' && all.length > DONE_SHOWN && (
                  <button onClick={() => setShowAllDone((v) => !v)} style={{
                    alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                    fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, color: 'var(--cth-ink-3)'
                  }}>{showAllDone ? t('kanban.showFewer') : t('kanban.more', { count: all.length - DONE_SHOWN })}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
// Deliberately minimal — a colored status edge, the task id, the title, a
// whisper of an assignee. Everything else (the full contract, deps, controls)
// lives in the detail view a click away: a kanban card can carry little more
// than a title.

function TaskCard({ task, done, assigneeName, onOpen, onDismiss }: {
  task: HiveTask;
  accent: string;
  done?: boolean;
  assigneeName?: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        onClick={onOpen}
        title={t('kanban.openTaskDetails')}
        style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 12px',
          border: 'none', cursor: 'pointer', textAlign: 'start', borderRadius: 'var(--cth-r-lg)',
          background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)',
          fontFamily: 'var(--cth-font-ui)'
        }}
      >
        {/* The id the god writes into tasks.json: cards are referred to by id in
            dispatches and messages, so it is readable without opening the card. */}
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 10.5, color: 'var(--cth-ink-3)', paddingInlineEnd: 22 }}>#{task.id.replace(/^#/, '')}</span>
        <span style={{
          fontSize: 12.5, fontWeight: 600, lineHeight: '17px', letterSpacing: '-0.01em', color: done ? 'var(--cth-ink-2)' : 'var(--cth-ink)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>{askTitle(task.title)}</span>
        {assigneeName && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cth-ink-3)' }}>
            <span style={{ width: 17, height: 17, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', background: 'var(--cth-neutral-soft)', color: 'var(--cth-ink-2)', fontSize: 9, fontWeight: 700 }}>
              {assigneeName.slice(0, 1).toUpperCase()}
            </span>
            {assigneeName}
          </span>
        )}
      </button>
      {waitsOnHuman(task) && (
        <span title={t('kanban.needsYouTitle')} style={{
          position: 'absolute', top: 9, insetInlineEnd: 10, width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'var(--cth-coral-strong)', color: 'var(--cth-on-coral)', fontSize: 11, fontWeight: 700, pointerEvents: 'none'
        }}>?</span>
      )}
      {done && !waitsOnHuman(task) && (
        <span aria-hidden="true" style={{ position: 'absolute', top: 10, insetInlineEnd: 11, color: 'var(--cth-green)', pointerEvents: 'none' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
        </span>
      )}
      {/* Dismiss: a sibling button (not nested) so it never opens the card. */}
      {hover && !waitsOnHuman(task) && !done && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          title={t('kanban.dismissTitle')}
          aria-label={t('kanban.dismissAria')}
          style={{
            position: 'absolute', top: 7, insetInlineEnd: 7, width: 20, height: 20, padding: 0, borderRadius: 6,
            display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer', background: 'var(--cth-neutral-soft)',
            color: 'var(--cth-ink-3)', fontSize: 11
          }}
        >✕</button>
      )}
    </div>
  );
}

// ─── Detail view ─────────────────────────────────────────────────────────────
// The full breakdown of one task: status, assignee, priority, the complete
// description (the god writes 4-part dispatch contracts in there — preserved
// line by line), dependencies resolved to their titles, the human Q&A trail,
// and the move/assign controls that used to crowd every card. Rendered as an
// APP-WIDE overlay (over the office floor) — this content grows, so it gets
// the big stage instead of the narrow side panel. Exported for App's
// TaskDetailOverlay; opened via the store's openTaskDetail from anywhere.

export function TaskDetail({ task, all, assigneeName, onMove, onAssign, onClose }: {
  task: HiveTask;
  all: HiveTask[];
  assigneeName?: string;
  onMove: (s: Status) => void;
  onAssign: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const detailGodName = useResolvedGodName();
  const col = COLUMNS.find((c) => c.key === task.status) ?? COLUMNS[0];
  // Belt + suspenders: parseTasks normalizes these, but the ledger is a
  // hand-written file — never trust a card's shape at the point of use.
  const deps = (task.dependsOn ?? [])
    .map((id) => all.find((t) => t.id === id))
    .filter((t): t is HiveTask => !!t);
  const created = new Date(task.createdAt);
  // The shared dialog behavior (DESIGN.md 7.21, 7.23, 12): Esc closes it but
  // never from a field such as the status select, focus stays inside and
  // goes back where it was; the backdrop closes on a full click.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialog(dialogRef, onClose);
  const backdrop = useBackdropClose(onClose);
  const label = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cth-ink-3)', marginBottom: 5 }}>{text}</div>
  );
  return (
    <div
      {...backdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 280,
        background: 'color-mix(in srgb, var(--cth-bg) 60%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
      }}
    >
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={askTitle(task.title)} style={{
        width: 560, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: 'var(--cth-card)', borderRadius: 'var(--cth-r-2xl)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)'
      }}>
        {/* Header: the id and close on one row, the title under them at full
            width (owner, 2026-10-01: side by side, a long id squeezed the title). */}
        <div style={{ padding: '16px 20px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span title={task.id} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 8px', borderRadius: 6, background: 'var(--cth-neutral-soft)', fontFamily: 'var(--cth-font-mono)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-2)' }}>#{task.id.replace(/^#/, '')}</span>
          <button onClick={onClose} aria-label={t('common.close')} style={{ marginInlineStart: 'auto', flexShrink: 0, width: 30, height: 30, borderRadius: 'var(--cth-r-md)', border: 'none', cursor: 'pointer', background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', color: 'var(--cth-ink-2)', display: 'grid', placeItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 16, fontWeight: 600, lineHeight: '22px', letterSpacing: '-0.02em', color: 'var(--cth-ink)' }}>{askTitle(task.title)}</div>
        </div>
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflowY: 'auto', borderTop: '1px solid var(--cth-line)' }}>
          {/* Facts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', justifyContent: 'space-between', gap: 12, paddingTop: 14 }}>
            <div>{label(t('kanban.status'))}
              <select value={task.status} onChange={(e) => onMove(e.target.value as Status)} style={{
                height: 30, padding: '0 8px', borderRadius: 'var(--cth-r-md)', border: 'none', cursor: 'pointer',
                background: col.soft, color: col.text, boxShadow: 'inset 0 0 0 1px var(--cth-line-input)',
                fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600
              }}>
                {COLUMNS.map((c) => (<option key={c.key} value={c.key}>{t(c.labelKey)}</option>))}
              </select>
            </div>
            <div>{label(t('kanban.assignee'))}
              {assigneeName
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px 0 4px', borderRadius: 999, background: 'var(--cth-neutral-soft)', fontSize: 12.5, fontWeight: 600, color: 'var(--cth-ink-2)' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', background: 'var(--cth-card)', fontSize: 10, fontWeight: 700 }}>{assigneeName.slice(0, 1).toUpperCase()}</span>
                    {assigneeName}
                  </span>
                : <span style={{ fontSize: 12.5, color: 'var(--cth-ink-3)' }}>{t('kanban.unassigned')}</span>}
            </div>
            <div>{label(t('kanban.priorityLabel'))}<PriorityDots level={Math.max(1, Math.min(5, task.priority))} /></div>
            <div>{label(t('kanban.created'))}
              <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12, color: 'var(--cth-ink-2)' }}>
                {isNaN(created.getTime()) ? '' : created.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* What the card is for, and the notes kept on it, line by line;
              nothing for either when the card has none. */}
          {([['description', task.description], ['notes', task.notes]] as const).map(([key, text]) => text?.trim() ? (
            <div key={key}>{label(t(`kanban.${key}`))}
              <div style={{ fontSize: 12.5, lineHeight: '19px', color: 'var(--cth-ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} dir={rtl ? 'auto' : undefined}>
                {text.trim()}
              </div>
            </div>
          ) : null)}

          {/* The owner Q&A trail: every decision documented on the card. */}
          {(task.humanQA?.length ?? 0) > 0 && (
            <div>{label(t('kanban.humanQA'))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {task.humanQA!.map((e, i) => {
                  const open = !e.a && !isReplacedAsk(task.humanQA, i) && !e.dismissedAt;
                  return (
                    <div key={i} style={{
                      padding: '10px 12px', borderRadius: 'var(--cth-r-lg)',
                      background: open ? 'var(--cth-coral-soft)' : 'var(--cth-card-2)',
                      boxShadow: `inset 0 0 0 1px ${open ? 'color-mix(in srgb, var(--cth-coral-base) 30%, transparent)' : 'var(--cth-line)'}`,
                      fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-2)' }}>{t('kanban.question')}</span>
                        {open && <span style={{ marginInlineStart: 'auto', padding: '1px 8px', borderRadius: 999, background: 'var(--cth-coral-strong)', color: 'var(--cth-on-coral)', fontSize: 10.5, fontWeight: 600 }}>{t('kanban.awaitingAnswer')}</span>}
                      </div>
                      <MarkdownPreview source={e.q} variant="card" />
                      {e.a ? (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--cth-line)' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--cth-green-text)', marginBottom: 2 }}>{t('kanban.answer')}</div>
                          <MarkdownPreview source={e.a} variant="card" />
                        </div>
                      ) : isReplacedAsk(task.humanQA, i) ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--cth-ink-3)' }}>{t('kanban.askReplaced')}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dependencies, resolved to titles */}
          {deps.length > 0 && (
            <div>{label(t('kanban.dependsOn'))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {deps.map((d) => {
                  const dc = COLUMNS.find((c) => c.key === d.status) ?? COLUMNS[0];
                  return (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--cth-r-md)', boxShadow: 'inset 0 0 0 1px var(--cth-line)', fontSize: 12.5, color: 'var(--cth-ink-2)' }}>
                      <i style={{ width: 7, height: 7, borderRadius: 2, background: dc.accent, display: 'block', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-3)' }}>#{d.id.replace(/^#/, '')}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--cth-ink)' }}>{d.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {/* Footer: hand it to Michael, or close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--cth-line)' }}>
          <PixelButton variant="secondary" size="md" onClick={onAssign}>{t('kanban.assign')}</PixelButton>
          <span style={{ fontSize: 11.5, color: 'var(--cth-ink-3)' }}>{t('kanban.assignHint', { godName: detailGodName })}</span>
          <span style={{ flex: 1 }} />
          <PixelButton variant="secondary" size="md" onClick={onClose}>
            {t('common.close')}
            <kbd style={{ marginInlineStart: 4, padding: '0 5px', borderRadius: 4, boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', fontFamily: 'var(--cth-font-mono)', fontSize: 10, color: 'var(--cth-ink-3)' }}>Esc</kbd>
          </PixelButton>
        </div>
      </div>
    </div>
  );
}

function PriorityDots({ level }: { level: number }) {
  const { t } = useTranslation();
  // 1 = lowest, 5 = highest (DESIGN.md 7.21): five dots, filled in ink.
  return (
    <span title={t('kanban.priority', { level })} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 30 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i <= level ? 'var(--cth-ink)' : 'var(--cth-line-2)' }} />
      ))}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontFamily: 'var(--cth-font-ui)',
  fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-900)', outline: 'none', boxSizing: 'border-box'
};

const selectStyle: React.CSSProperties = {
  padding: '3px 6px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontFamily: 'var(--cth-font-ui)',
  fontSize: 12, color: 'var(--cth-ink-900)', cursor: 'pointer'
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 10, fontWeight: 600, color: 'var(--cth-ink-500)'
};
