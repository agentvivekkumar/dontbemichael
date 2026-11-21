import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/design/theme';
import { GrowingTextarea } from './GrowingTextarea';
import { askHeadline, askTitle, askedAgo } from './askHeadline';
import { family } from '@/scene/studio/theme';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import type { DegradedNotice } from '@shared/degradedNotices';
import { AgentAvatar } from './AgentAvatar';
import { AllClearTipCard, AnswersSent } from './AllClearTipCard';
import { type HiveTask, type HumanQA } from './TasksKanban';
import { compareByNewestAsk } from './askMeOrder';
import { answerMessages, askAsText, isAnswered, isReport, isWithdrawn, labeledAnswer, openAskIndexes, openReportIndexes, partAnswerText, raiserOf, readAskShape, type AskShape } from '@shared/askMeRouting';
import { noticeKindOf } from '@shared/noticeCards';
import { isComposingKey } from '@shared/imeGuard';
import { ScheduleRequestCards } from './ScheduleRequestCards';
import { ResearchKeptCards } from './ResearchKeptCards';
import { WorkStyleUpdateCards } from './WorkStyleUpdateCards';
import { MailProposalCards } from './MailProposalCards';
import { EngineSetupCard } from './EngineSetupCard';
import { OfficeBreakCard, useOfficeBreak } from './OfficeBreakNotice';
import { SilentEngineCards } from './SilentEngine';
import { silentCards } from '@shared/silentEngine';
import { FileText } from './FileChip';
import { ChoiceRows, PartLines } from './AskAnswerFields';
import { refreshNeedsYou, setupCardShown, updateNeedsYouTasks, useNeedsYou } from '@/shell/useNeedsYou';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useResearchName } from '@/shell/research';
import { FoundationCard } from './FoundationCard';
import { foundationAsk, isSettled, isSnoozed } from '@shared/foundations';
import { updateCardShown } from '@shared/updateState';
import { UpdateCard } from './UpdateCard';
import { CliUpdateCard } from './CliUpdateNotice';
import { cliUpdateToastVisible } from '@shared/cliUpdate';
import { CaseStudyCard } from './pulse/CaseStudyCard';
import { decisionId } from '@shared/workStyleUpdates';
import type { OfficeDepartment } from '@shared/officeRoles';
import { foundationDepartment, hiddenKeys, departmentsOnBoard, memberDepartment, noteArrivals, pickDepartment, pickRunsDry, showDepartmentRow, type BoardCard, type FilterState } from './askMeFilter';
import { AskMeDepartmentRow } from './AskMeDepartmentRow';
import { attachmentsFromPaste, type PastedFile } from './pasteAttachments';
import { withAttachments } from '@shared/ownerRequests';
import type { FoldControl } from './AskCardFold';

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

/** How many Office humor lines the All clear moment rotates through (D8). */
const ALL_CLEAR_LINES = 5;
/** The last focus request the board acted on, so a board that mounts later
 *  (the launch open, D7) never takes focus for an old one. */
let handledFocusSeq = 0;

/** One open question on the board. A card can hold several, and each is its
 *  own row with its own answer, so a newer question never hides an older one
 *  (askMeRouting.ts, owner 2026-10-04). */
interface AskRow { key: string; task: HiveTask; index: number; ask: HumanQA }

/** All tasks transitively waiting on `id` (dependents chain), cycle-safe. */
function dependentsTree(id: string, all: HiveTask[], seen = new Set<string>()): HiveTask[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const direct = all.filter((t) => Array.isArray(t.dependsOn) && t.dependsOn.includes(id) && t.status !== 'done');
  return direct.flatMap((d) => [d, ...dependentsTree(d.id, all, seen)]);
}

/** An ask without any pick or part answers already on it. */
function withoutDetail<T extends object>(e: T): T {
  const { picked: _p, partAnswers: _pa, ...rest } = e as T & { picked?: unknown; partAnswers?: unknown };
  return rest as T;
}

export function AskMeTab() {
  const { t: translate, i18n } = useTranslation();
  const godName = useResolvedGodName();
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  // One shared read with the pill, the strip and the chips (D3, eng R4).
  const { tasks, requests: scheduleRequests, researchKept, offers, proposals, engineSetup, stop, researchNotice, knowledgeNotice, setupNotice, degraded, silent, foundations, update, updateLater, cliUpdate, cliUpdateLater, caseStudyWaiting, updateRestarting, count: needsCount } = useNeedsYou();
  // Michael's team upgrade card (docs/designs/team-upgrade-card.md) keeps All clear away too.
  const cliShown = cliUpdateToastVisible(cliUpdate, cliUpdateLater);
  // Michael's card for a new version (UpdateCard) keeps All clear away too.
  const updateShown = updateCardShown(update, updateLater) && !updateRestarting;
  // And a case study ready to view (CaseStudyCard).
  const caseScreenOpen = useStore((s) => s.caseStudyOpen);
  const caseShown = caseStudyWaiting && !caseScreenOpen;
  // Members whose engine isn't reporting (issue #326): their cards keep All clear away.
  const silentShown = silentCards(silent).length > 0;
  // A sign in stop already asks the owner to sign in: one card (eng R3).
  const engineCard = setupCardShown({ engineSetup, stop });
  const onBreak = !!useOfficeBreak();
  // The office opening (the team clocking in) or closing (closing time): the
  // asks are read only until it is open (askLock below).
  const officeClosing = useStore((s) => s.officeClosing);
  const officeOpening = useStore((s) => s.opening.kind === 'opening');
  const askLock: 'closing' | 'opening' | null = officeClosing ? 'closing' : officeOpening ? 'opening' : null;
  const refreshScheduleRequests = refreshNeedsYou;
  // Drafts live in the STORE (keyed by row) — switching tabs unmounts this
  // view, and a half-typed answer must survive the round trip.
  const drafts = useStore((s) => s.answerDrafts);
  const setAnswerDraft = useStore((s) => s.setAnswerDraft);
  // The picked option and each question's chip and line, kept like the typed
  // draft (ask-me-options.md, 3A).
  const picks = useStore((s) => s.answerPicks);
  const setAnswerPick = useStore((s) => s.setAnswerPick);
  // Files attached to an answer, kept like the draft until it lands
  // (docs/designs/ask-me-answer-box.md): pasted, dropped or picked.
  const answerFiles = useStore((s) => s.answerFiles);
  const setAnswerFiles = useStore((s) => s.setAnswerFiles);
  const addFiles = (key: string, incoming: PastedFile[]) => {
    const prev = useStore.getState().answerFiles[key] ?? [];
    const seen = new Set(prev.map((f) => f.path));
    const fresh = incoming.filter((f) => f.path && !seen.has(f.path));
    if (fresh.length) setAnswerFiles(key, [...prev, ...fresh]);
  };
  const pickFiles = async (key: string) => { const res = await window.cth.attachFiles(); if (res.ok) addFiles(key, res.files); };
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const [sending, setSending] = useState<string | null>(null);
  // The row whose last Reply did not save, so its card can say so.
  const [failed, setFailed] = useState<string | null>(null);
  // The open row: undefined means the newest, null means none.
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  // Which cards have their "holding up" list open.
  const [openStuck, setOpenStuck] = useState<Record<string, boolean>>({});
  const dark = useAppTheme() === 'dark';
  // Answers given since the board opened: they stay under All clear until the
  // column closes (D4), so the owner sees the reply landed.
  const [answeredHere, setAnsweredHere] = useState<{ id: string; title: string; a: string; files?: string[]; who?: string; whoId?: string }[]>([]);
  const [line] = useState(() => 1 + Math.floor(Math.random() * ALL_CLEAR_LINES));
  const rootRef = useRef<HTMLDivElement>(null);
  // A foundation answer just saved, sent to Michael to add, or not written:
  // one polite line, as the card leaves. `at` restarts the line for each save.
  const [foundationSaved, setFoundationSaved] = useState<{ how: 'saved' | 'michael' | 'failed'; at: number; list?: 'whole' | 'soFar' } | null>(null);
  useEffect(() => {
    if (!foundationSaved) return;
    const timer = setTimeout(() => setFoundationSaved(null), foundationSaved.how === 'failed' ? 10000 : 4000);
    return () => clearTimeout(timer);
  }, [foundationSaved]);

  // Opened from the pill, the strip or a "for you" chip: put focus in the
  // reply field of the asked for card, or the newest one (D10, D11).
  const focusReq = useStore((s) => s.needsYouFocus);
  useEffect(() => {
    if (!focusReq || focusReq.seq <= handledFocusSeq) return;
    handledFocusSeq = focusReq.seq;
    if (focusReq.taskId) {
      const first = rowsRef.current.find((r) => r.task.id === focusReq.taskId);
      if (first) {
        // A card the department filter hides: show every card, then open it (D6).
        if (hiddenRef.current.has(first.key)) setFilter(null);
        setOpenId(first.key);
      }
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root) return;
        // Every row of a card carries its id; the first in the list is the
        // one just opened.
        const wanted = focusReq.taskId ? root.querySelector<HTMLElement>(`[data-askme-id="${CSS.escape(focusReq.taskId)}"]:not([data-askme-hidden])`) : null;
        const cardEl = wanted ?? root.querySelector<HTMLElement>('.cth-askme-card.is-open:not([data-askme-hidden])');
        const field = cardEl?.querySelector<HTMLTextAreaElement>('textarea');
        if (field && cardEl) { cardEl.scrollIntoView({ block: 'nearest' }); field.focus(); return; }
        root.closest('[data-right-column]')?.querySelector<HTMLElement>('[data-needs-you-heading]')?.focus();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusReq]);

  const nameFor = (id?: string): string | undefined =>
    id ? (agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id) : undefined;

  // Every open question, newest at the top, oldest at the bottom. Before this
  // the board had no comparator at all, so a question's position was an
  // accident of where its card sat in tasks.json. Only this OUTER list is
  // sorted; a card's humanQA history stays chronological (see askMeOrder.ts).
  // Reports (michael-replies.md, 14A) follow the questions: something to read,
  // never something blocking.
  const rowsOf = (pick: typeof openAskIndexes): AskRow[] => tasks
    .flatMap((t) => pick(t.humanQA).map((index) => ({ key: `${t.id}#${index}`, task: t, index, ask: t.humanQA![index] })))
    .sort((a, b) => compareByNewestAsk(a.ask, b.ask));
  // Company foundations cards come after the decisions (design D10); one the
  // owner put off with Not now stays out for its week.
  const asks = rowsOf(openAskIndexes);
  const now = Date.now();
  // A question answered another way (a member, a file, Michael) leaves the board too.
  // A list stays while it is only known so far (foundation-answers-stay-open.md).
  const foundationRows = asks.filter((r) => { const id = foundationAsk(r.ask); return !!id && !isSnoozed(foundations?.snoozed, id, now) && !(foundations && isSettled(foundations, id, now)); });
  const waiting: AskRow[] = [...asks.filter((r) => !foundationAsk(r.ask)), ...foundationRows, ...rowsOf(openReportIndexes)];
  const rowsRef = useRef<AskRow[]>(waiting);
  rowsRef.current = waiting;
  // A card with several open questions has a row for each: their labels add
  // the start of the question, so a screen reader can tell them apart.
  const rowsPerCard = new Map<string, number>();
  for (const r of waiting) rowsPerCard.set(r.task.id, (rowsPerCard.get(r.task.id) ?? 0) + 1);
  const rowLabel = (r: AskRow): string => {
    const title = askTitle(r.task.title);
    if ((rowsPerCard.get(r.task.id) ?? 0) < 2) return title;
    const q = askHeadline(r.ask.q);
    return `${title}: ${q.length > 60 ? `${q.slice(0, 59).trimEnd()}…` : q}`;
  };

  // Department colors and the department row (docs/designs/ask-me-department-colors.md):
  // one rule colors a card and files it under a department (askMeFilter.ts).
  const deptOf = (id: unknown): OfficeDepartment | null => memberDepartment(id, agents, restorable);
  const famOf = (d: OfficeDepartment | null) => (d ? family(d, dark) : null);
  const deptName = (d: OfficeDepartment): string => translate(`studio.dept.${d}`);
  const assigneeOf = (t: HiveTask): string | undefined => (typeof t.assignee === 'string' ? t.assignee : undefined);
  const raiserOfRow = (r: AskRow): string | undefined => (r.ask.raisedBy && r.ask.raisedBy !== 'god' ? r.ask.raisedBy : assigneeOf(r.task));
  // A Company foundations card takes the area its question is about (design review D2, D3).
  const rowDept = (r: AskRow): OfficeDepartment | null => {
    const fid = foundationAsk(r.ask);
    return fid ? foundationDepartment(fid, deptOf(raiserOfRow(r))) : deptOf(assigneeOf(r.task));
  };
  // The board top to bottom: schedule changes, Work style updates, mail, then the rows.
  const cards: BoardCard[] = [
    ...scheduleRequests.map((r) => ({ key: `schedule:${r.id}`, dept: deptOf(r.agentId) })),
    ...researchKept.map((k) => ({ key: `kept:${k.id}`, dept: deptOf(k.from) })),
    ...offers.map((o) => ({ key: `offer:${decisionId(o.key, o.agentId)}`, dept: deptOf(o.agentId) })),
    ...proposals.map((p) => ({ key: `mail:${p.id}`, dept: deptOf(p.agentId) })),
    ...waiting.map((r) => ({ key: r.key, dept: rowDept(r), keep: isReport(r.ask) }))
  ];
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const cardsSig = cards.map((c) => `${c.key}=${c.dept ?? ''}`).join('|');
  const [filter, setFilter] = useState<FilterState | null>(null);
  const picked = filter?.picked ?? null;
  const hidden = hiddenKeys(cards, picked);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const hiddenOf = (prefix: string): Set<string> => new Set([...hidden].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
  const shownCount = Math.max(0, needsCount - hidden.size);
  const deptCounts: Partial<Record<OfficeDepartment, number>> = {};
  for (const c of cards) if (c.dept) deptCounts[c.dept] = (deptCounts[c.dept] ?? 0) + 1;
  // A card of another department that arrives while one is picked marks its chip (2A).
  useEffect(() => { setFilter((f) => noteArrivals(f, cardsRef.current)); }, [cardsSig]);
  // The picked department's last card left: every card again, the newest open.
  const rosterLoaded = agents.length > 0;
  useEffect(() => {
    if (pickRunsDry(filter, cardsRef.current, rosterLoaded)) { setFilter(null); setOpenId(undefined); }
  }, [cardsSig, filter, rosterLoaded]);
  // Each return to the board starts from every card (owner E1): minimized, or
  // another view. A member panel replacing the board unmounts it anyway.
  const boardHidden = useStore((s) => s.columnMinimized || (s.floorView !== 'office' && s.floorView !== 'file'));
  useEffect(() => { if (boardHidden) setFilter(null); }, [boardHidden]);
  // Screen readers hear the filter only when the pick changes, never on a poll.
  const [filterStatus, setFilterStatus] = useState('');
  const lastPicked = useRef<OfficeDepartment | null>(null);
  useEffect(() => {
    if (lastPicked.current === picked) return;
    lastPicked.current = picked;
    setFilterStatus(picked ? translate('askMe.showing', { shown: shownCount, total: needsCount }) : translate('askMe.showingEvery'));
    // Only a change of pick speaks; the counts are read for the message.
  }, [picked]);
  const choose = (d: OfficeDepartment) => { setFilter((f) => pickDepartment(f, d, cardsRef.current)); setOpenId(undefined); };
  const [rowHeight, setRowHeight] = useState(0);
  const onRowHeight = useCallback((px: number) => setRowHeight(px), []);
  // The cards stay white (owner, 2026-11-05: the filter row is what helps); a
  // member's department goes into the card's label, never color alone.
  const memberLook = (agentId: string): { dept: string } | undefined => {
    const d = deptOf(agentId);
    return d ? { dept: deptName(d) } : undefined;
  };
  // The person chip in its department colors, as it always was (DESIGN.md 7.8).
  const chipLook = (f: ReturnType<typeof famOf>): CSSProperties => ({ ...personChip, ...(f ? { background: f.l, boxShadow: `inset 0 0 0 1px ${f.m}` } : {}) });
  // One card open at a time across the whole board: questions, mail approvals,
  // schedule changes and Work style updates (owner, 2026-11-05). The first card
  // the filter leaves visible is open until the owner picks another; a card
  // the filter hides is never the open one.
  const pinned = openId !== undefined && (openId === null || cards.some((c) => c.key === openId && !hidden.has(c.key)));
  const openKey = pinned ? openId : cards.find((c) => !hidden.has(c.key))?.key;
  const foldFor = (prefix: string) => (id: string): FoldControl => {
    const key = `${prefix}${id}`;
    return { open: openKey === key, toggle: () => setOpenId(openKey === key ? null : key), pin: () => setOpenId(key) };
  };
  // The whole board, whatever is picked: All clear and the answered list read it.
  const boardEmpty = !engineCard && !updateShown && !caseShown && !silentShown && !cliShown && waiting.length === 0 && scheduleRequests.length === 0 && researchKept.length === 0 && offers.length === 0 && proposals.length === 0;
  // All clear shows, and with it Michael's one tip (owner, 2026-11-10).
  const showAllClear = boardEmpty && !onBreak && !researchNotice && !knowledgeNotice && !setupNotice && degraded.length === 0;

  /** The answer a row would send: the owner's words, labeled with the option
   *  or the questions it answers (ask-me-options.md, 5A). */
  const answerFor = (row: AskRow, shape: AskShape): string => {
    const pk = picks[row.key] ?? {};
    return labeledAnswer(shape, { pick: pk.pick, note: drafts[row.key] ?? '', parts: pk.parts });
  };

  /**
   * Record the owner's answer on one open question, then tell Michael.
   *
   * This view's card is a few seconds old, so main merges it against the card
   * on disk (askMeRouting.ts mergeHumanQA): the answer lands only on the same
   * question, still open there. When it does not land (the question changed,
   * or Michael withdrew it meanwhile), nothing is sent or remembered and the
   * draft is kept.
   */
  const sendAnswer = async (row: AskRow, override?: string): Promise<boolean> => {
    const { task, index, ask: open } = row;
    const shape = readAskShape(open);
    // The words go with any attached files as "Attached files:" lines, so the
    // raiser's memory note and Michael's request both carry the paths. A file
    // alone is a whole answer.
    const files = override === undefined ? (useStore.getState().answerFiles[row.key] ?? []) : [];
    const words = override ?? answerFor(row, shape);
    const text = withAttachments(words, files);
    if (!text || sending) return false;
    // Whether the card itself took the answer (FoundationCard writes the
    // foundations then, even if a message after it failed).
    let onCard = false;
    const pk = picks[row.key] ?? {};
    // Which option and which parts, recorded beside the answer (main keeps them
    // only with it: askMeRouting.ts mergeHumanQA).
    const detail = shape.kind === 'choice' && pk.pick !== undefined
      ? { picked: pk.pick }
      : shape.kind === 'parts'
        ? { partAnswers: shape.parts.map((p, i) => partAnswerText(p, pk.parts?.[i])) }
        : {};
    // Michael and memory notes read the options or questions with the answer.
    const asked = askAsText(open.q, shape);
    setSending(row.key);
    setFailed(null);
    try {
      // 1) Document the answer ON the card, on this question only.
      const answeredAt = new Date().toISOString();
      const next = tasks.map((t) => {
        if (t.id !== task.id) return t;
        const qa = (t.humanQA ?? []).map((e, i) =>
          i === index && e.q === open.q && !isAnswered(e) && !isWithdrawn(e)
            // Only this Reply's own pick and lines go with the answer, never ones
            // an agent left on the open ask.
            ? { ...withoutDetail(e), a: text, answeredAt, ...detail }
            : e
        );
        return { ...t, humanQA: qa };
      });
      const updated = next.find((candidate) => candidate.id === task.id);
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA }, index)
        : { ok: false, landed: false };
      if (!result.ok || result.landed === false) throw new Error('task changed before answer could be saved');
      onCard = true;
      updateNeedsYouTasks(() => next);
      // 2) The answer goes into the memory notes of whoever raised the
      //    question, and reaches Michael as a request about the card, which he
      //    closes with done once he has routed it. The owner only talks to
      //    Michael (askMeRouting.ts). The note comes first: his request says it
      //    is there, and a request that fails to go is sent again later.
      const agents = useStore.getState().agents;
      const raiser = raiserOf(open, task, new Set(agents.map((a) => a.id)));
      await window.cth.hiveRememberOwnerAnswer({ agentId: raiser, task: task.title, taskId: task.id, q: asked, a: text }).catch(() => undefined);
      const raiserName = agents.find((a) => a.id === raiser)?.name ?? raiser;
      for (const m of answerMessages({ raiser, raiserName, taskId: task.id, title: task.title, q: asked, a: text, answeredAt })) {
        await window.cth.hiveSend({
          to: m.to, act: m.act, subject: m.subject, body: m.body,
          ...(m.conversation ? { conversation: m.conversation } : {}),
          ...(m.requires_reply !== undefined ? { requires_reply: m.requires_reply } : {})
        }, 'human');
      }
      setAnswerDraft(row.key, '');
      setAnswerPick(row.key, {});
      setAnswerFiles(row.key, []);
      setAnsweredHere((list) => [{ id: row.key, title: task.title, a: words, files: files.map((f) => f.name), who: nameFor(typeof task.assignee === 'string' ? task.assignee : undefined), whoId: typeof task.assignee === 'string' ? task.assignee : undefined }, ...list.filter((x) => x.id !== row.key)]);
      refreshNeedsYou();
    } catch {
      // Keep the draft so the owner can try again, and reload the board in
      // case the question changed or was withdrawn meanwhile.
      setFailed(row.key);
      refreshNeedsYou();
    }
    setSending(null);
    return onCard;
  };

  return (
    // Design v2 (branding/DESIGN.md 7.8): plain white cards. Michael's question,
    // a one row answer, and what is stuck behind it. Scrolls on its own so the
    // board heading stays put.
    <div ref={rootRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '2px 2px 10px', margin: '-2px -2px 0', scrollPaddingTop: rowHeight ? rowHeight + 12 : undefined }}>
      {showDepartmentRow(cards, picked) && (
        <AskMeDepartmentRow
          departments={departmentsOnBoard(cards)} counts={deptCounts} picked={picked} fresh={filter?.fresh ?? new Set()}
          shown={shownCount} total={needsCount} dark={dark}
          onPick={choose} onShowAll={() => { setFilter(null); setOpenId(undefined); }} onHeight={onRowHeight}
        />
      )}
      <div role="status" className="cth-sr-only">{filterStatus}</div>
      <OfficeBreakCard />
      <SilentEngineCards />
      <EngineSetupCard status={engineCard ? engineSetup : null} />
      <UpdateCard update={update} later={updateLater} />
      <CaseStudyCard waiting={caseStudyWaiting} />
      <CliUpdateCard status={cliUpdate} later={cliUpdateLater} />
      {/* While the office opens or closes, the asks below can be read but not
          answered (owner, 2026-11-19): a reply then reaches a team that is not
          there to act on it. The cards above stay usable, since signing Claude
          in or fixing a stop is how an opening that is stuck gets going. */}
      {askLock && (
        <div role="status" style={{ flexShrink: 0, fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-3)', padding: '0 2px' }}>
          {askLock === 'closing' ? translate('askMe.lockedClosing') : translate('askMe.lockedOpening')}
        </div>
      )}
      <div
        data-askme-locked={askLock || undefined}
        {...(askLock ? ({ inert: '' } as Record<string, string>) : {})}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0, opacity: askLock ? 0.55 : 1, transition: 'opacity 200ms var(--cth-ease)' }}
      >
      <ScheduleRequestCards requests={scheduleRequests} refresh={refreshScheduleRequests} look={memberLook} hiddenIds={hiddenOf('schedule:')} fold={foldFor('schedule:')} />
      {/* What the privacy check kept back from a question to Research (owner, 2026-11-20). */}
      <ResearchKeptCards kept={researchKept} refresh={refreshNeedsYou} look={memberLook} hiddenIds={hiddenOf('kept:')} fold={foldFor('kept:')} />
      <WorkStyleUpdateCards offers={offers} look={memberLook} hiddenIds={hiddenOf('offer:')} fold={foldFor('offer:')} />
      <MailProposalCards proposals={proposals} refresh={refreshNeedsYou} look={memberLook} hiddenIds={hiddenOf('mail:')} fold={foldFor('mail:')} />
      {/* Always mounted, so screen readers announce the line when it fills. */}
      <div key={foundationSaved?.at} role={foundationSaved?.how === 'failed' ? 'alert' : 'status'} className={foundationSaved ? undefined : 'cth-sr-only'}
        style={foundationSaved ? { fontSize: 12, lineHeight: '17px', color: foundationSaved.how === 'failed' ? 'var(--cth-coral-text)' : 'var(--cth-ink-3)', padding: '0 2px' } : undefined}>
        {foundationSaved?.how === 'saved' ? translate(foundationSaved.list === 'whole' ? 'foundations.card.savedWhole' : foundationSaved.list === 'soFar' ? 'foundations.card.savedSoFar' : 'foundations.card.saved')
          : foundationSaved?.how === 'michael' ? translate(foundationSaved.list === 'whole' ? 'foundations.card.sentToMichaelWhole' : 'foundations.card.sentToMichael', { godName })
          : foundationSaved?.how === 'failed' ? translate('foundations.card.failedGone', { godName }) : ''}
      </div>
      {/* Nothing left (D4, D8): All clear, one light line, and what was just
          answered. The column closes on the next click outside it. */}
      {boardEmpty && !onBreak && !researchNotice && !knowledgeNotice && !setupNotice && degraded.length === 0 && (
        <div style={{ padding: '4px 2px 2px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--cth-ink)' }}>{translate('shell.allClear')}</div>
          <div style={{ marginTop: 4, fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-3)' }}>{translate(`shell.allClearLine${line}`, { godName })}</div>
        </div>
      )}
      {/* What was just answered: one quiet line, not a card each (owner,
          2026-11-10: a stack of answered cards under All clear read as work
          still waiting). Then one tip from Michael from this office. */}
      {boardEmpty && <AnswersSent answers={answeredHere} godName={godName} />}
      {showAllClear && <AllClearTipCard godName={godName} />}
      {waiting.map((row) => {
        const { task: t, ask: open } = row;
        const foundationId = foundationAsk(open);
        const isHidden = hidden.has(row.key);
        if (foundationId) {
          // The member whose work hit it (D11) is named; card and chip wear the
          // area the question is about (design review D2, D3, 3A).
          const raiser = raiserOfRow(row);
          const member = raiser ? agents.find((a) => a.id === raiser) : undefined;
          const area = rowDept(row);
          const fam = famOf(area);
          return (
            <FoundationCard
              key={row.key} id={foundationId} rowKey={row.key} taskId={t.id} q={open.q} askedAt={open.askedAt}
              raiserId={raiser} raiserName={nameFor(raiser)} raiserIsMember={!!member}
              chipStyle={chipLook(fam)}
              areaName={area ? deptName(area) : undefined} hidden={isHidden}
              foundations={foundations}
              memberName={(mid) => agents.find((a) => a.id === mid)?.name}
              onAnswer={(text) => sendAnswer(row, text)}
              onSaved={(how, list) => setFoundationSaved({ how, at: Date.now(), ...(list ? { list } : {}) })}
            />
          );
        }
        const stuck = dependentsTree(t.id, tasks);
        // Agents write tasks.json: a card's assignee may not be a string.
        const who = nameFor(typeof t.assignee === 'string' ? t.assignee : undefined);
        const dept = rowDept(row);
        const fam = famOf(dept);
        const answered = t.humanQA?.filter((e) => e.a).length ?? 0;
        // See full context only when it leads somewhere new: the card's background,
        // its result, or other questions and answers (owner, 2026-10-12: it opened
        // to a repeat of the question). Agents write tasks.json, so check types.
        const moreContext = (typeof t.description === 'string' && t.description.trim() !== '')
          || (typeof t.result === 'string' && t.result.trim() !== '')
          || (t.humanQA?.length ?? 0) > 1;
        const draft = drafts[row.key] ?? '';
        const shape = readAskShape(open);
        const pk = picks[row.key] ?? {};
        // An option that needs the owner's words asks for them in the box, and
        // Reply waits until there are some (its "note", ask-me-options.md).
        const pickedNote = shape.kind === 'choice' && pk.pick !== undefined ? shape.options[pk.pick]?.note : undefined;
        const files = answerFiles[row.key] ?? [];
        // A file is an answer too, also for an option that asks for words.
        const toSend = pickedNote && !draft.trim() && !files.length ? '' : answerFor(row, shape);
        const partsAnswered = shape.kind === 'parts' ? shape.parts.filter((p, i) => partAnswerText(p, pk.parts?.[i])).length : 0;
        // Reply says what it will send (D3): the option, or how many questions.
        const replyLabel = shape.kind === 'choice' && pk.pick !== undefined
          ? translate(draft.trim() ? 'askMe.replyOptionNote' : 'askMe.replyOption', { n: pk.pick + 1 })
          : shape.kind === 'parts' && partsAnswered > 0 && partsAnswered < shape.parts.length
            ? translate('askMe.replyPartial', { n: partsAnswered, total: shape.parts.length })
            : translate('askMe.respond');
        const hasDraft = !!draft.trim() || pk.pick !== undefined || partsAnswered > 0 || files.length > 0;
        const showStuck = openStuck[row.key] ?? false;
        // One card open at a time; the newest is open until the owner picks another.
        // The newest is open by default, and after the open card is answered
        // (it leaves the list) the newest opens again.
        // One open card for the whole board (openKey above).
        const expanded = openKey === row.key;
        const toggle = () => setOpenId(expanded ? null : row.key);
        const ago = askedAgo(open.askedAt, Date.now(), i18n.language, translate('askMe.justNow'));
        return (
          // Design v2 (DESIGN.md 7.8; owner, 2026-09-30): folded cards read as a
          // list (title, who, when, the ask in a line or two); one opens to the
          // full question, a one row reply and what it holds up.
          <section key={row.key} data-askme-id={t.id} data-askme-hidden={isHidden || undefined} aria-label={dept ? `${rowLabel(row)}, ${deptName(dept)}` : rowLabel(row)}
            style={{ ...(expanded ? cardOpen : card), ...(isHidden ? { display: 'none' } : {}) }}
            className={expanded ? 'cth-askme-card is-open' : 'cth-askme-card'}
            // Files dropped on the card go with the answer (ask-me-answer-box.md).
            onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
            onDrop={(e) => {
              const dropped = Array.from(e.dataTransfer?.files ?? []).map((f) => ({ path: window.cth.pathForFile(f), name: f.name })).filter((f) => f.path);
              if (!dropped.length) return;
              e.preventDefault();
              addFiles(row.key, dropped);
              setOpenId(row.key);
            }}>
            {/* The header folds and unfolds the card. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={toggle}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                className="cth-askme-head"
                style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
              >
                <div className="cth-askme-title" style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600, lineHeight: '18px', letterSpacing: '-0.01em', color: 'var(--cth-ink)' }}>
                  {askTitle(t.title)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
                  {who && (
                    <span style={chipLook(fam)} title={dept ? translate('askMe.personDept', { name: who, dept: deptName(dept) }) : undefined}>
                      <AgentAvatar id={assigneeOf(t)} name={who} size={16} />
                      {who}
                      {dept && <span className="cth-sr-only">, {deptName(dept)}</span>}
                    </span>
                  )}
                  {ago && <span style={{ fontSize: 11, color: 'var(--cth-ink-3)' }}>{ago}</span>}
                  {isReport(open) && <span style={reportTag}>{translate('askMe.report')}</span>}
                  {!expanded && hasDraft && <span style={draftTag}>{translate('askMe.draft')}</span>}
                </div>
                {/* Folded: the ask itself, in a line or two. */}
                {!expanded && (
                  <div style={{
                    marginTop: 7, fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>{askHeadline(open.q)}</div>
                )}
              </div>
              {/* An ask is cleared by answering it, never dismissed (owner,
                  2026-10-01). The chevron shows the card folds and opens. */}
              <div style={{ flexShrink: 0, marginTop: -3, marginInlineEnd: -5 }}>
                {/* Folded or open, at a glance: a chevron that turns as the card opens. */}
                <span
                  aria-hidden="true"
                  onClick={toggle}
                  className="cth-askme-chevron"
                  style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', color: 'var(--cth-ink-3)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 160ms var(--cth-ease)' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </div>
            </div>
            {expanded && <>
            {/* The question, as markdown: Michael writes lists, emphasis and code. */}
            <div className="cth-askme-q" style={{ margin: '10px 0 12px', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>
              {/* Files the question names are chips that open them (docs/designs/open-file-tab.md). */}
              <FileText source={open.q} who={{ raisedBy: open.raisedBy, assignee: typeof t.assignee === 'string' ? t.assignee : undefined }} />
            </div>
            {/* What the card rests on is under See full context, not here (owner,
                2026-11-10): the card keeps the decision and the file it names. */}
            {shape.kind === 'choice' && (
              <ChoiceRows
                options={shape.options}
                pick={pk.pick}
                onPick={(pick) => setAnswerPick(row.key, { ...pk, pick })}
                onSend={() => void sendAnswer(row)}
                who={{ raisedBy: open.raisedBy, assignee: typeof t.assignee === 'string' ? t.assignee : undefined }}
              />
            )}
            {shape.kind === 'parts' && (
              <PartLines
                parts={shape.parts}
                answers={pk.parts ?? []}
                onChange={(parts) => setAnswerPick(row.key, { ...pk, parts })}
                onSend={() => void sendAnswer(row)}
                who={{ raisedBy: open.raisedBy, assignee: typeof t.assignee === 'string' ? t.assignee : undefined }}
              />
            )}
            {shape.kind !== 'plain' ? <>
            {/* With options or questions (A1): the box full width, then Reply on
                its own row, so picking never reads as sending. A picked option's
                question stays above the box, whole, while the owner types
                (owner D2, ask-me-answer-box.md). */}
            {pickedNote && (
              <div data-askme-note style={{ margin: '0 0 6px', fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{pickedNote}</div>
            )}
            <GrowingTextarea
              className="cth-input"
              value={draft}
              onChange={(e) => setAnswerDraft(row.key, e.target.value)}
              onFocus={() => setOpenId(row.key)}
              onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendAnswer(row); }}
              onPaste={(e) => { void attachmentsFromPaste(e)?.then((f) => addFiles(row.key, f)); }}
              placeholder={shape.kind === 'parts' ? translate('askMe.anythingElse') : pickedNote ? translate('askMe.yourAnswer') : (pk.pick !== undefined ? translate('askMe.addNote') : translate('askMe.ownAnswer'))}
              style={{
                width: '100%', display: 'block', boxSizing: 'border-box', padding: '7px 10px', minHeight: 34,
                background: 'var(--cth-card)', border: 'none',
                fontFamily: 'var(--cth-font-ui)', fontSize: 12, lineHeight: '18px',
                color: 'var(--cth-ink)', outline: 'none'
              }}
            />
            <AttachedFiles files={files} onRemove={(path) => setAnswerFiles(row.key, files.filter((f) => f.path !== path))} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <AddFileButton onPick={() => void pickFiles(row.key)} disabled={sending === row.key} />
              <PixelButton
                variant="primary" size="sm"
                disabled={(!toSend && !files.length) || sending === row.key}
                onClick={() => void sendAnswer(row)}
                ariaLabel={shape.kind === 'choice' && pk.pick !== undefined ? translate('askMe.replyOptionAria', { n: pk.pick + 1, label: shape.options[pk.pick]?.label ?? '' }) : undefined}
                style={{ height: 34, flexShrink: 0 }}
              >
                {sending === row.key ? translate('askMe.sending') : replyLabel}
              </PixelButton>
            </div>
            </> : (
            /* One row: the answer, and Reply. */
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              <GrowingTextarea
                className="cth-input"
                value={draft}
                onChange={(e) => setAnswerDraft(row.key, e.target.value)}
                // Typing pins this card open, so a newer ask arriving never folds it mid answer.
                onFocus={() => setOpenId(row.key)}
                onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendAnswer(row); }}
                onPaste={(e) => { void attachmentsFromPaste(e)?.then((f) => addFiles(row.key, f)); }}
                placeholder={translate('askMe.answerPlaceholder')}
                style={{
                  flex: 1, minWidth: 0, display: 'block', boxSizing: 'border-box', padding: '7px 10px', minHeight: 34,
                  background: 'var(--cth-card)', border: 'none',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 12, lineHeight: '18px',
                  color: 'var(--cth-ink)', outline: 'none'
                }}
              />
              <AddFileButton onPick={() => void pickFiles(row.key)} disabled={sending === row.key} />
              {/* A report is cleared with Got it; nothing goes to Michael (14A). */}
              {isReport(open) && (
                <PixelButton variant="secondary" size="sm" disabled={sending === row.key} style={{ height: 34, flexShrink: 0 }}
                  onClick={() => { void window.cth.ackReport(t.id, row.index).then(() => refreshNeedsYou()); }}>
                  {translate('askMe.gotIt')}
                </PixelButton>
              )}
              <PixelButton
                variant="primary" size="sm"
                disabled={(!draft.trim() && !files.length) || sending === row.key}
                onClick={() => void sendAnswer(row)}
                style={{ height: 34, flexShrink: 0 }}
              >
                {sending === row.key ? translate('askMe.sending') : translate('askMe.respond')}
              </PixelButton>
            </div>
            )}
            {shape.kind === 'plain' && <AttachedFiles files={files} onRemove={(path) => setAnswerFiles(row.key, files.filter((f) => f.path !== path))} />}
            {/* A notice (a report with a kind) can teach its member to stop
                filing that kind (owner-items-reach-ask-me.md D2). */}
            {isReport(open) && !!noticeKindOf(open) && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <button disabled={sending === row.key} style={quietLink}
                  onClick={() => { void window.cth.skipNotice(t.id, row.index).then(() => refreshNeedsYou()); }}>
                  {translate('askMe.skipNotice')}
                </button>
              </div>
            )}
            {failed === row.key && (
              <div role="alert" style={{ marginTop: 6, fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>{translate('askMe.mailFailed')}</div>
            )}
            {/* The cascade: what is stuck behind this answer, folded to one line. */}
            {stuck.length > 0 && (
              <div style={{ marginTop: 9 }}>
                <button
                  onClick={() => setOpenStuck((m) => ({ ...m, [row.key]: !showStuck }))}
                  aria-expanded={showStuck}
                  style={{ ...quietLink, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none', color: 'var(--cth-ink-3)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    style={{ transform: showStuck ? 'rotate(90deg)' : undefined, transition: 'transform 120ms' }}><path d="M9 6l6 6-6 6" /></svg>
                  {stuck.length === 1
                    ? translate('askMe.blockingDownstream', { count: stuck.length })
                    : translate('askMe.blockingDownstreamPlural', { count: stuck.length })}
                </button>
                {showStuck && (
                  <div style={{ marginTop: 5, paddingInlineStart: 15, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {stuck.slice(0, 6).map((d) => (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--cth-ink-2)' }}>
                        <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 2, background: d.status === 'blocked' ? 'var(--cth-coral-base)' : 'var(--cth-blue)' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                        {nameFor(d.assignee) && <span style={{ fontSize: 11, color: 'var(--cth-ink-3)' }}>{nameFor(d.assignee)}</span>}
                      </div>
                    ))}
                    {stuck.length > 6 && (
                      <div style={{ fontSize: 11, color: 'var(--cth-ink-3)' }}>{translate('askMe.more', { count: stuck.length - 6 })}</div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* The full task, and any earlier answers, are one click away. */}
            {moreContext && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--cth-line)' }}>
              <button onClick={() => openTaskDetail(t.id)} title={translate('askMe.openDetail')} style={{ ...quietLink, color: 'var(--cth-indigo-text)', fontWeight: 600 }}>
                {translate('askMe.openTask')}
              </button>
              {answered > 0 && (
                <button onClick={() => openTaskDetail(t.id)} title={translate('askMe.viewAnswersHistory')} style={quietLink}>
                  {answered === 1
                    ? translate('askMe.viewAnswers', { count: answered })
                    : translate('askMe.viewAnswersPlural', { count: answered })}
                </button>
              )}
            </div>
            )}
            </>}
          </section>
        );
      })}
      {/* A report, after the questions like every Report card (DESIGN.md 7.8). */}
      {researchNotice && <ResearchNoticeCard />}
      {knowledgeNotice && <KnowledgeNoticeCard />}
      {setupNotice && <SetupNoticeCard />}
      {degraded.map((n) => (
        <DegradedNoticeCard key={n.agentId} notice={n} name={agents.find((a) => a.id === n.agentId)?.name ?? n.name} />
      ))}
      </div>
    </div>
  );
}

const card: CSSProperties = {
  position: 'relative', flexShrink: 0,
  padding: '13px 14px 13px', borderRadius: 'var(--cth-r-xl)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), 0 1px 2px rgba(30, 27, 46, .04), 0 4px 12px rgba(62, 52, 140, .06)'
};
const cardOpen: CSSProperties = {
  ...card,
  boxShadow: 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-md)'
};
const draftTag: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-amber-soft)', color: 'var(--cth-amber-text)'
};
const personChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px 0 3px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-2)'
};
const quietLink: CSSProperties = {
  padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 11, color: 'var(--cth-ink-3)'
};

/** The one time card after the update that took the internet from the team
 *  (issue #230, design review D9 and D20): a report, so it never turns the
 *  Needs you pill coral; either button clears it for good. */
function ResearchNoticeCard() {
  const { t } = useTranslation();
  const researchName = useResearchName();
  const seen = (): void => { void window.cth.researchNoticeSeen().then(() => refreshNeedsYou()).catch(() => undefined); };
  return (
    <section aria-label={t('research.noticeTitle')} style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cth-ink)' }}>{t('research.noticeTitle')}</span>
        <span style={reportTag}>{t('askMe.report')}</span>
      </div>
      <p style={{ margin: '8px 0 12px', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>{t('research.noticeBody', { name: researchName })}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <PixelButton variant="secondary" size="sm" onClick={seen}>{t('askMe.gotIt')}</PixelButton>
        <PixelButton variant="primary" size="sm" onClick={() => {
          seen();
          window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'Research & privacy' } }));
        }}>{t('research.noticeOpen')}</PixelButton>
      </div>
    </section>
  );
}

/** The one time card for an owner who had company knowledge off (owner,
 *  2026-10-19: no switch now): a report, cleared by either button. */
function KnowledgeNoticeCard() {
  const { t } = useTranslation();
  const seen = (): void => { void window.cth.kgNoticeSeen?.().then(() => refreshNeedsYou()).catch(() => undefined); };
  return (
    <section aria-label={t('knowledgeNotice.title')} style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cth-ink)' }}>{t('knowledgeNotice.title')}</span>
        <span style={reportTag}>{t('askMe.report')}</span>
      </div>
      <p style={{ margin: '8px 0 12px', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>{t('knowledgeNotice.body')}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <PixelButton variant="secondary" size="sm" onClick={seen}>{t('askMe.gotIt')}</PixelButton>
        <PixelButton variant="primary" size="sm" onClick={() => {
          seen();
          window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'Memory & Knowledge' } }));
        }}>{t('knowledgeNotice.open')}</PixelButton>
      </div>
    </section>
  );
}

/** The one time card for a business that kept only its name and team when
 *  settings moved per office (docs/designs/separate-businesses.md, D11): its
 *  mailboxes, schedules and connectors are set up again in Settings. */
function SetupNoticeCard() {
  const { t } = useTranslation();
  const seen = (): void => { void window.cth.officeSetupNoticeSeen?.().then(() => refreshNeedsYou()).catch(() => undefined); };
  return (
    <section aria-label={t('setupNotice.title')} style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cth-ink)' }}>{t('setupNotice.title')}</span>
        <span style={reportTag}>{t('askMe.report')}</span>
      </div>
      <p style={{ margin: '8px 0 12px', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>{t('setupNotice.body')}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <PixelButton variant="secondary" size="sm" onClick={seen}>{t('askMe.gotIt')}</PixelButton>
        <PixelButton variant="primary" size="sm" onClick={() => {
          seen();
          window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'Connections' } }));
        }}>{t('setupNotice.open')}</PixelButton>
      </div>
    </section>
  );
}

/** A member that started with something missing (shared/degradedNotices.ts):
 *  the sentence the desktop notification says, as a report, so it reaches an
 *  owner with notifications off too. Got it clears it until it changes. */
function DegradedNoticeCard({ notice, name }: { notice: DegradedNotice; name: string }) {
  const { t } = useTranslation();
  const seen = (): void => { void window.cth.degradedDismiss?.(notice.agentId).then(() => refreshNeedsYou()).catch(() => undefined); };
  return (
    <section aria-label={t('degradedNotice.title', { name })} style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <AgentAvatar id={notice.agentId} name={name} size={18} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cth-ink)' }}>{t('degradedNotice.title', { name })}</span>
        <span style={reportTag}>{t('askMe.report')}</span>
      </div>
      <p style={{ margin: '8px 0 12px', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)', overflowWrap: 'anywhere' }}>{notice.message}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <PixelButton variant="secondary" size="sm" onClick={seen}>{t('askMe.gotIt')}</PixelButton>
      </div>
    </section>
  );
}

const reportTag: CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', color: 'var(--cth-ink-2)'
};

/** The quiet paperclip beside Reply: pick files to send with the answer
 *  (ask-me-answer-box.md). Pasting into the box and dropping on the card
 *  attach too. */
function AddFileButton({ onPick, disabled }: { onPick: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="cth-askme-attach" onClick={onPick} disabled={disabled} aria-label={t('askMe.addFile')} title={t('askMe.addFile')} style={attachButton}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.5 3.5 0 015 5l-8.6 8.6a2 2 0 01-2.8-2.8l7.9-7.9" />
      </svg>
    </button>
  );
}

/** The files waiting to go with an answer, as Talk to Michael shows them. */
function AttachedFiles({ files, onRemove }: { files: PastedFile[]; onRemove: (path: string) => void }) {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <div style={{ ...fileRow, marginTop: 6 }}>
      {files.map((f) => (
        <span key={f.path} title={f.path} style={{ ...fileChip, padding: '0 3px 0 8px' }}>
          {f.name}
          <button type="button" onClick={() => onRemove(f.path)} aria-label={t('shell.removeAttachment', { name: f.name })}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cth-ink-3)', fontSize: 10 }}>✕</button>
        </span>
      ))}
    </div>
  );
}

const fileRow: CSSProperties = { display: 'flex', gap: 4, flexWrap: 'wrap' };
const fileChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 8px', maxWidth: 220,
  borderRadius: 'var(--cth-r-pill)', background: 'var(--cth-neutral-soft)', fontSize: 11, color: 'var(--cth-ink-2)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
};
const attachButton: CSSProperties = {
  width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', padding: 0,
  border: 'none', borderRadius: 'var(--cth-r-md)', background: 'transparent', color: 'var(--cth-ink-3)', cursor: 'pointer'
};
