import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { type HiveTask, type HumanQA, openQuestion, waitsOnHuman } from './TasksKanban';
import { compareByNewestAsk } from './askMeOrder';
import { answerMessages, raiserOf } from '@shared/askMeRouting';
import { isComposingKey } from '@shared/imeGuard';
import { useRtl } from '@/i18n/useDirection';
import { ScheduleRequestCards, useScheduleRequests } from './ScheduleRequestCards';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

/**
 * ASK ME — first-class human feedback through the task system.
 *
 * Tasks the god can only move with the human's input sit here. An entry isn't
 * necessarily a question — it can be a TO-DO only the human can perform
 * (create an account, approve a purchase, provide credentials, test on a real
 * device). Each card shows the open ask, a place to respond (an answer, or a
 * "done, here's the result" confirmation), and the CASCADE of downstream
 * tasks stuck waiting on this one — so "why isn't X done?" reads as "ah,
 * because I still owe something here."
 *
 * Sending an answer does two things:
 *   1. writes it into the card's humanQA entry in hive/tasks.json (the
 *      decision is documented ON the task, forever), and
 *   2. mails the god so it picks the answer up, unblocks the card, and the
 *      work continues — no separate HumanQuestion.md side-channel anymore.
 */

const POLL_MS = 5000;

function parse(raw: unknown): HiveTask[] {
  const list = (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks))
    ? (raw as { tasks: HiveTask[] }).tasks
    : [];
  return list.filter((t) => !!t && typeof t === 'object');
}

/** All tasks transitively waiting on `id` (dependents chain), cycle-safe. */
function dependentsTree(id: string, all: HiveTask[], seen = new Set<string>()): HiveTask[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const direct = all.filter((t) => Array.isArray(t.dependsOn) && t.dependsOn.includes(id) && t.status !== 'done');
  return direct.flatMap((d) => [d, ...dependentsTree(d.id, all, seen)]);
}

export function AskMeTab() {
  const { t: translate } = useTranslation();
  const rtl = useRtl();
  const godName = useResolvedGodName();
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  // Drafts live in the STORE (keyed by task id) — switching tabs unmounts this
  // view, and a half-typed answer must survive the round trip.
  const drafts = useStore((s) => s.answerDrafts);
  const setAnswerDraft = useStore((s) => s.setAnswerDraft);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const [sending, setSending] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Schedule changes the team asked for; they wait here for the owner (R6).
  const { requests: scheduleRequests, refresh: refreshScheduleRequests } = useScheduleRequests();

  const refresh = useCallback(async () => {
    try { setTasks(parse(await window.cth.hiveTasks())); } catch { /* keep last good */ }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  const nameFor = (id?: string): string | undefined =>
    id ? (agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id) : undefined;

  // Newest ask at the top, oldest at the bottom. Before this the board had no
  // comparator at all, so a question's position was an accident of where its
  // card sat in tasks.json. `filter` already returns a fresh array, so sorting
  // in place never touches the store's own ordering. The ask each card is
  // ranked by comes from openQuestion() — the same predicate waitsOnHuman uses
  // — and only this OUTER list is sorted; a card's humanQA history stays
  // chronological (see askMeOrder.ts).
  const waiting = tasks
    .filter(waitsOnHuman)
    .sort((a, b) => compareByNewestAsk(openQuestion(a), openQuestion(b)));

  /**
   * Apply `patch` to the OPEN humanQA entry of one card, on the RAW ledger.
   * Returns whether it landed.
   *
   * Re-reads tasks.json first rather than writing this view's 5s-old snapshot,
   * because `hive:writeTasks` treats the incoming array as the card MEMBERSHIP:
   * writing our snapshot back would delete any card the god added since the last
   * poll. Re-locating the open question by its text also means an answer can
   * never land on a different question the god swapped in underneath us — in
   * that case nothing is written and the draft is kept.
   */

  const sendAnswer = async (task: HiveTask) => {
    const text = (drafts[task.id] ?? '').trim();
    const open = openQuestion(task);
    if (!text || !open || sending) return;
    setSending(task.id);
    try {
      // 1) Document the answer ON the card.
      const next = tasks.map((t) => {
        if (t.id !== task.id) return t;
        const qa = (t.humanQA ?? []).map((e) =>
          e === open || (e.q === open.q && !e.a)
            ? { ...e, a: text, answeredAt: new Date().toISOString() }
            : e
        );
        return { ...t, humanQA: qa };
      });
      const updated = next.find((candidate) => candidate.id === task.id);
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA })
        : { ok: false };
      if (!result.ok) throw new Error('task changed before answer could be saved');
      setTasks(next);
      // 2) The answer goes to whoever raised the question, and into their
      //    memory notes, and Michael is told so he can unblock the card
      //    (askMeRouting.ts).
      const agents = useStore.getState().agents;
      const raiser = raiserOf(open, task, new Set(agents.map((a) => a.id)));
      const raiserName = agents.find((a) => a.id === raiser)?.name ?? raiser;
      for (const m of answerMessages({ raiser, raiserName, taskId: task.id, title: task.title, q: open.q, a: text })) {
        await window.cth.hiveSend({ to: m.to, act: 'inform', subject: m.subject, body: m.body }, 'human');
      }
      await window.cth.hiveRememberOwnerAnswer({ agentId: raiser, task: task.title, q: open.q, a: text }).catch(() => undefined);
      setAnswerDraft(task.id, '');
    } catch { /* leave the draft so the user can retry */ }
    setSending(null);
  };

  // Dismiss the open ask off the ASK ME board WITHOUT answering it. We mark the
  // open humanQA entry `dismissedAt` (no fabricated answer) so openQuestion()
  // stops returning it and the card leaves this view — the question itself stays
  // on the card, so the Q&A history is never dropped (protocol). The task stays
  // blocked on the kanban; the god can re-ask by appending a fresh humanQA entry.
  const dismiss = async (task: HiveTask) => {
    const open = openQuestion(task);
    if (!open || sending === task.id) return;
    const next = tasks.map((t) => {
      if (t.id !== task.id) return t;
      const qa = (t.humanQA ?? []).map((e) =>
        e === open || (e.q === open.q && !e.a && !e.dismissedAt)
          ? { ...e, dismissedAt: new Date().toISOString() }
          : e
      );
      return { ...t, humanQA: qa };
    });
    setTasks(next); // optimistic — the card disappears immediately
    try {
      const updated = next.find((candidate) => candidate.id === task.id);
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA })
        : { ok: false };
      if (!result.ok) throw new Error('task changed before ask could be dismissed');
    } catch {
      setTasks(tasks); // restore on failure so the user can retry
    }
  };

  return (
    // Design v2 (branding/DESIGN.md 7.8): white cards with a coral rule. Michael's
    // question, an answer box, and what is stuck behind it. Scrolls on its own
    // so the board heading stays put.
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
      <ScheduleRequestCards requests={scheduleRequests} refresh={refreshScheduleRequests} />
      {waiting.length === 0 && scheduleRequests.length === 0 && (
        <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--cth-ink-3)', fontSize: 12.5, lineHeight: '19px' }}>
          <div style={{ fontWeight: 600, color: 'var(--cth-ink-2)', marginBottom: 4 }}>{translate('shell.boardEmptyTitle')}</div>
          {translate('shell.boardEmptySub', { godName })}
        </div>
      )}
      {waiting.map((t) => {
        const open = openQuestion(t)!;
        const stuck = dependentsTree(t.id, tasks);
        const who = nameFor(t.assignee);
        const answered = t.humanQA?.filter((e) => e.a).length ?? 0;
        return (
          <section key={t.id} aria-label={t.title} style={card}>
            <span aria-hidden="true" style={coralRule} />
            {/* Title (opens the task) and dismiss. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <button
                onClick={() => openTaskDetail(t.id)}
                title={translate('askMe.openDetail')}
                style={{
                  flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'start',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600, lineHeight: '17px',
                  color: 'var(--cth-indigo-text)', textDecoration: 'underline',
                  textDecorationColor: 'color-mix(in srgb, var(--cth-indigo-text) 28%, transparent)', textUnderlineOffset: 3
                }}
              >
                {t.title}
              </button>
              {/* Dismiss: clears this ask off the board without answering it. The
                  card's Q&A history is kept (the question stays on the task,
                  marked dismissed). */}
              <button
                onClick={() => void dismiss(t)}
                disabled={sending === t.id}
                title={translate('askMe.dismissTitle')}
                aria-label={translate('askMe.dismissAria')}
                style={{
                  flexShrink: 0, width: 20, height: 20, padding: 0, marginTop: -1, marginInlineEnd: -4,
                  display: 'grid', placeItems: 'center', border: 'none', borderRadius: 6, background: 'transparent',
                  cursor: sending === t.id ? 'default' : 'pointer', color: 'var(--cth-ink-3)', fontSize: 12, lineHeight: 1
                }}
              >✕</button>
            </div>
            {/* Who it belongs to, and who is asking. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {who && (
                <span style={personChip}>
                  <span style={avatarDot}>{who.slice(0, 1).toUpperCase()}</span>{who}
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--cth-ink-3)' }}>
                <span style={{ ...avatarDot, background: 'var(--cth-ink)', color: 'var(--cth-bg)' }}>{godName.slice(0, 1).toUpperCase()}</span>
                {translate('askMe.from')} <b style={{ fontWeight: 600, color: 'var(--cth-ink-2)' }}>{godName}</b>
              </span>
            </div>
            {/* The question, as markdown: Michael writes lists, emphasis and code. */}
            <div dir={rtl ? 'auto' : undefined} style={{ margin: '6px 0 8px', fontSize: 12, lineHeight: '16.5px', color: 'var(--cth-ink)' }}>
              <MarkdownPreview source={open.q} variant="card" />
            </div>
            <textarea
              className="cth-input"
              dir={rtl ? 'auto' : undefined}
              value={drafts[t.id] ?? ''}
              onChange={(e) => setAnswerDraft(t.id, e.target.value)}
              onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendAnswer(t); }}
              rows={2}
              placeholder={translate('askMe.answerPlaceholder')}
              style={{
                display: 'block', width: '100%', boxSizing: 'border-box', padding: '6px 9px', resize: 'vertical',
                background: 'var(--cth-card-2)', border: 'none',
                fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, lineHeight: '16px',
                color: 'var(--cth-ink)', outline: 'none'
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <PixelButton
                variant="primary" size="sm"
                disabled={!(drafts[t.id] ?? '').trim() || sending === t.id}
                onClick={() => void sendAnswer(t)}
              >
                {sending === t.id ? translate('askMe.sending') : translate('askMe.respond')}
              </PixelButton>
              {who && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--cth-ink-3)' }}>
                  <BookmarkGlyph /> {translate('askMe.savedTo', { name: who })}
                </span>
              )}
              {answered > 0 && (
                <button
                  onClick={() => openTaskDetail(t.id)}
                  title={translate('askMe.viewAnswersHistory')}
                  style={{
                    marginInlineStart: 'auto', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                    fontFamily: 'var(--cth-font-ui)', fontSize: 11, color: 'var(--cth-ink-3)', textDecoration: 'underline'
                  }}
                >
                  {answered === 1
                    ? translate('askMe.viewAnswers', { count: answered })
                    : translate('askMe.viewAnswersPlural', { count: answered })}
                </button>
              )}
            </div>
            {/* The cascade: what is stuck behind this answer. */}
            {stuck.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--cth-line)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--cth-coral-text)' }}>
                  {stuck.length === 1
                    ? translate('askMe.blockingDownstream', { count: stuck.length })
                    : translate('askMe.blockingDownstreamPlural', { count: stuck.length })}
                </div>
                {stuck.slice(0, 6).map((d) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cth-ink-2)' }}>
                    <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 2, background: d.status === 'blocked' ? 'var(--cth-coral-base)' : 'var(--cth-blue)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                    {nameFor(d.assignee) && <span style={{ fontSize: 10.5, color: 'var(--cth-ink-3)' }}>{nameFor(d.assignee)}</span>}
                  </div>
                ))}
                {stuck.length > 6 && (
                  <div style={{ fontSize: 10.5, color: 'var(--cth-ink-3)' }}>{translate('askMe.more', { count: stuck.length - 6 })}</div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const card: CSSProperties = {
  position: 'relative', flexShrink: 0,
  padding: '10px 12px 10px 13px', borderRadius: 'var(--cth-r-xl)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)'
};
const coralRule: CSSProperties = {
  position: 'absolute', insetInlineStart: 0, top: 12, bottom: 12, width: 3,
  borderStartEndRadius: 3, borderEndEndRadius: 3, background: 'var(--cth-coral-base)'
};
const personChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px 2px 2px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', fontSize: 10.5, fontWeight: 600, color: 'var(--cth-ink-2)'
};
const avatarDot: CSSProperties = {
  width: 17, height: 17, borderRadius: '50%', display: 'inline-grid', placeItems: 'center',
  background: 'var(--cth-indigo-soft)', color: 'var(--cth-indigo-text)', fontSize: 9, fontWeight: 700
};

function BookmarkGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
