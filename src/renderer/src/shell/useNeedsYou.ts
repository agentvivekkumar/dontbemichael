import type { ResearchKept } from '@shared/researchKept';
import { useSyncExternalStore } from 'react';
import type { ScheduleRequest } from '@shared/missions';
import type { MailProposal } from '@shared/mailProposals';
import type { OwnerRequest } from '@shared/ownerRequests';
import type { WorkStyleOffer } from '@shared/workStyleUpdates';
import type { EngineSetupStatus } from '@shared/engineSetup';
import { stopNeedsOwner, type OfficeBreakView } from '@shared/officeBreak';
import { openQuestions, parseTasks, type HiveTask } from '../components/hiveTasks';
import { openReportIndexes } from '@shared/askMeRouting';
import { silentCards, type SilentEpisode } from '@shared/silentEngine';
import { foundationAsk, isSettled, isSnoozed, type FoundationsView } from '@shared/foundations';
import { updateCardShown, updateNeed, type UpdateNeed } from '@shared/updateState';
import { cliUpdateToastVisible, type CliUpdateStatus } from '@shared/cliUpdate';
import type { DegradedNotice } from '@shared/degradedNotices';

const POLL_MS = 5000;

/**
 * The one read of what waits on the owner (docs/designs/needs-you-empty-state.md,
 * D3 and eng R4): the task ledger, polled every 5 s while the window is visible,
 * and the schedule requests Michael passed on. The top bar pill, the coral strip,
 * the Needs you board, the pods' "for you" chips and the Tasks view all read
 * this, so they always agree. It used to be seven separate timers.
 */
export interface NeedsYouFeed {
  /** 'unknown' until the first task read returns: the pill shows nothing rather
   *  than a false "Nothing needs you". A failed read keeps the last value. */
  status: 'unknown' | 'ready';
  tasks: HiveTask[];
  /** Schedule requests Michael passed on to the owner. */
  requests: ScheduleRequest[];
  /** Questions to Research the privacy check kept words back from: one card
   *  each, offering each piece to always allow (shared/researchKept.ts). */
  researchKept: ResearchKept[];
  /** Owner answers Michael has not closed yet (card-lifecycle.md): the Tasks
   *  view shows those cards as with Michael. They wait on him, not the owner,
   *  so they are not in `count`. */
  ownerRequests: OwnerRequest[];
  /** New default job descriptions offered to the owner (shared/workStyleUpdates.ts). */
  offers: WorkStyleOffer[];
  /** Emails waiting for the owner's approval (send-on-approval.md). */
  proposals: MailProposal[];
  /** Where Michael's engine stands (get-michael-ready.md); null until read. */
  engineSetup: EngineSetupStatus | null;
  /** The office stop or break, if any (office-stopped-account.md). */
  stop: OfficeBreakView | null;
  /** Members whose engine isn't reporting to the app (issue #326); each card
   *  (one per engine version, and Michael's) is one in `count`. */
  silent: SilentEpisode[];
  /** A new version of the app waiting for a restart or a download: Michael's
   *  update card (UpdateCard). Kept until a newer actionable status replaces
   *  it, so a re-check never takes it away; null until one arrives. */
  update: UpdateNeed | null;
  /** The version the owner put off with Later, until the app starts again. */
  updateLater: string | null;
  /** Claude Code updated underneath the team: live agents still run the older
   *  version (src/shared/cliUpdate.ts). Michael's team upgrade card on Ask me
   *  (docs/designs/team-upgrade-card.md); null when nobody is behind. */
  cliUpdate: CliUpdateStatus | null;
  /** The installed Claude Code version the owner put off with Later: the card
   *  stays off until a newer one is installed (owner D2, 2026-11-05). */
  cliUpdateLater: string | null;
  /** A case study prepared in the background waits for the owner to open it:
   *  Michael's card on Ask me (CaseStudyCard), until opened or put off. */
  caseStudyWaiting: boolean;
  /** The case study screen is open, so its card steps aside and does not count
   *  (setCaseStudyScreenOpen, from App.tsx). */
  caseStudyOpen: boolean;
  /** A restart from the update card is under way, so the card steps aside and
   *  does not count until the restart is called off (setUpdateRestarting). */
  updateRestarting: boolean;
  /** Open asks, passed-on schedule requests, job description offers, emails to
   *  approve, one for an engine Michael cannot start on, one for a stop only
   *  the owner can fix (out of credit, sign in), one for an update, and one for a
   *  case study ready to view. */
  count: number;
  /** Reports Michael put on Ask me (michael-replies.md, 14A): never coral, never in `count`. */
  reports: number;
  /** The one time Research card after the update (issue #230, design D9): a report. */
  researchNotice: boolean;
  /** The one time card for an owner who had company knowledge off (a report). */
  knowledgeNotice: boolean;
  /** The one time card for a business whose mail, schedules and connectors
   *  were not carried over when settings moved per office (a report). */
  setupNotice: boolean;
  /** Members that started with something missing (shared/degradedNotices.ts):
   *  one report card each, never coral, never in `count`. */
  degraded: DegradedNotice[];
  /** Company foundations as the foundation cards read them (answers, drafts,
   *  Not now); null until read or from an older main. */
  foundations: FoundationsView | null;
}

/** The installed Claude Code version the owner said Later to, kept in the
 *  `cth.` renderer memory so it outlives a restart: Claude Code ships several
 *  times a week, and a card that returns every morning gets ignored. */
const CLI_LATER_KEY = 'cth.cliUpdateLaterFor';
function readCliLater(): string | null {
  try { return window.localStorage.getItem(CLI_LATER_KEY); } catch { return null; }
}
let feed: NeedsYouFeed = { status: 'unknown', tasks: [], requests: [], researchKept: [], ownerRequests: [], offers: [], proposals: [], engineSetup: null, stop: null, silent: [], update: null, updateLater: null, cliUpdate: null, cliUpdateLater: readCliLater(), caseStudyWaiting: false, caseStudyOpen: false, updateRestarting: false, count: 0, reports: 0, researchNotice: false, knowledgeNotice: false, setupNotice: false, degraded: [], foundations: null };
// The offers need the team and the packs, which this module does not import;
// the app hands it the reader at start (App.tsx).
let offersSource: (() => Promise<WorkStyleOffer[]>) | null = null;
let offerReads = 0;

/** Set how job description offers are read (App.tsx, once). */
export function setWorkStyleOffersSource(source: () => Promise<WorkStyleOffer[]>): void {
  offersSource = source;
  readOffers();
}

// Offers change only with the team, the packs or a decision, so the 5 s poll
// reads them at most once a minute; refreshNeedsYou reads them at once.
const OFFERS_EVERY_MS = 60_000;
let offersReadAt = 0;

function readOffers(force = true): void {
  if (!offersSource) return;
  if (!force && Date.now() - offersReadAt < OFFERS_EVERY_MS) return;
  offersReadAt = Date.now();
  const mine = ++offerReads;
  void offersSource()
    .then((offers) => { if (mine === offerReads) publish({ offers }); })
    .catch(() => { /* keep the last value */ });
}
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let offRequests: (() => void) | null = null;
let offProposals: (() => void) | null = null;
let offEngine: (() => void) | null = null;
let engineReads = 0;
// `claude auth status` starts a process, so the 5 s poll reads the engine at
// most once a minute while Michael cannot start, and every 10 minutes once he
// can; a setup terminal ending, or refreshNeedsYou, reads it at once.
const ENGINE_EVERY_MS = 60_000;
const ENGINE_SETTLED_EVERY_MS = 10 * 60_000;
/** Fired on window when Claude turns ready after Michael could not start: the
 *  team restarts however that happened (useHive), not only from the card. */
export const ENGINE_READY_EVENT = 'cth:engine-ready';
let engineReadAt = 0;
let proposalReads = 0;
// A read that started before a newer read or a local change must not land.
let taskReads = 0;
let requestReads = 0;
let ownerReads = 0;

function publish(next: Partial<Pick<NeedsYouFeed, 'status' | 'tasks' | 'requests' | 'researchKept' | 'ownerRequests' | 'offers' | 'proposals' | 'engineSetup' | 'stop' | 'silent' | 'researchNotice' | 'knowledgeNotice' | 'setupNotice' | 'degraded' | 'foundations' | 'update' | 'updateLater' | 'cliUpdate' | 'cliUpdateLater' | 'caseStudyWaiting' | 'caseStudyOpen' | 'updateRestarting'>>): void {
  // A poll that brings nothing new changes nothing, so nobody re-renders.
  const changed = (Object.keys(next) as Array<keyof typeof next>).some((k) => JSON.stringify(next[k]) !== JSON.stringify(feed[k]));
  if (!changed) return;
  const wasNeeded = !!(feed.engineSetup?.applies && feed.engineSetup.needed);
  const merged = { ...feed, ...next };
  feed = {
    ...merged,
    count: merged.tasks.reduce((n, t) => n + shownQuestions(t, merged.foundations).length, 0) + merged.requests.length + merged.researchKept.length + merged.offers.length + merged.proposals.length,
    reports: merged.tasks.reduce((n, t) => n + openReportIndexes(t.humanQA).length, 0) + (merged.researchNotice ? 1 : 0) + (merged.knowledgeNotice ? 1 : 0) + (merged.setupNotice ? 1 : 0) + merged.degraded.length
  };
  // One more while Michael cannot start for want of his engine (get-michael-ready.md),
  // unless a sign in stop already says so: one problem, one card (eng R3).
  if (setupCardShown(merged)) feed = { ...feed, count: feed.count + 1 };
  // One more for a stop only the owner can fix (office-stopped-account.md, design D2).
  if (stopNeedsOwner(merged.stop)) feed = { ...feed, count: feed.count + 1 };
  // One per not reporting card (DESIGN.md §7.6b, SD1).
  const silent = silentCards(merged.silent).length;
  if (silent) feed = { ...feed, count: feed.count + silent };
  // The update and case study cards count only while Ask me shows them.
  if (updateCardShown(merged.update, merged.updateLater) && !merged.updateRestarting) feed = { ...feed, count: feed.count + 1 };
  if (cliUpdateToastVisible(merged.cliUpdate, merged.cliUpdateLater)) feed = { ...feed, count: feed.count + 1 };
  if (merged.caseStudyWaiting && !merged.caseStudyOpen) feed = { ...feed, count: feed.count + 1 };
  for (const l of [...listeners]) l();
  // Ready after Michael could not start: hand the terminals that could not
  // start to useHive, which restarts exactly those (agents at work keep going).
  const restart = merged.engineSetup?.restart ?? [];
  if (wasNeeded && merged.engineSetup?.applies && !merged.engineSetup.needed && restart.length
    && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(ENGINE_READY_EVENT, { detail: { restart } }));
  }
}

/** A card's open questions the board shows: a foundation card the owner put
 *  off with Not now stays out for its week (office-foundations.md, D2). */
export function shownQuestions(t: HiveTask, f: FoundationsView | null, now = Date.now()): ReturnType<typeof openQuestions> {
  return openQuestions(t).filter((e) => { const id = foundationAsk(e); return !id || (!isSnoozed(f?.snoozed, id, now) && !(f && isSettled(f, id, now))); });
}

let foundationReads = 0;
let foundationsReadAt = 0;
/** Main pushes every change (onFoundationsChanged), so the poll reads the
 *  record at most once a minute, a safety net; other callers read at once. */
function readFoundations(force = true): void {
  if (!force && Date.now() - foundationsReadAt < 60_000) return;
  foundationsReadAt = Date.now();
  const mine = ++foundationReads;
  void window.cth.foundationsGet?.()
    .then((v) => { if (mine === foundationReads) publish({ foundations: v ?? null }); })
    .catch(() => { /* keep the last value */ });
}

function readTasks(): void {
  if (typeof document !== 'undefined' && document.hidden) return;
  const mine = ++taskReads;
  void window.cth.hiveTasks()
    .then((raw) => { if (mine === taskReads) publish({ status: 'ready', tasks: parseTasks(raw) }); })
    .catch(() => { /* keep the last value */ });
  // Main keeps these cached on its fleet tick, so this read touches no folders.
  const ownerMine = ++ownerReads;
  void window.cth.hiveOwnerRequests?.()
    .then((open) => { if (ownerMine === ownerReads) publish({ ownerRequests: Array.isArray(open) ? open : [] }); })
    .catch(() => { /* keep the last value */ });
  readOffers(false);
  readEngine(false);
  readNotices(false);
  readFoundations(false);
  readKept();
}

// A small file in the app's private folder, read with every poll.
let keptReads = 0;
function readKept(): void {
  const mine = ++keptReads;
  void window.cth.researchKept?.()
    .then((all) => { if (mine === keptReads) publish({ researchKept: Array.isArray(all) ? all : [] }); })
    .catch(() => { /* keep the last value */ });
}

// The one time cards (Research's, and company knowledge's for an owner who
// had it off) change only on the update and when the owner reads them, so the
// poll reads them at most once a minute; refreshNeedsYou reads them at once.
let researchReadAt = 0;
function readNotices(force = true): void {
  if (!force && Date.now() - researchReadAt < 60_000) return;
  researchReadAt = Date.now();
  void window.cth.researchStatus?.()
    .then((s) => publish({ researchNotice: !!s?.notice }))
    .catch(() => { /* keep the last value */ });
  void window.cth.kgNotice?.()
    .then((s) => publish({ knowledgeNotice: !!s?.notice }))
    .catch(() => { /* keep the last value */ });
  void window.cth.officeSetupNotice?.()
    .then((s) => publish({ setupNotice: !!s?.notice }))
    .catch(() => { /* keep the last value */ });
}

function readRequests(): void {
  const mine = ++requestReads;
  void window.cth.listScheduleRequests()
    .then((all) => { if (mine === requestReads) publish({ requests: all.filter((r) => r.escalated) }); })
    .catch(() => { /* keep the last value */ });
}

function readEngine(force = true): void {
  const every = feed.engineSetup && !(feed.engineSetup.applies && feed.engineSetup.needed) ? ENGINE_SETTLED_EVERY_MS : ENGINE_EVERY_MS;
  if (!force && Date.now() - engineReadAt < every) return;
  engineReadAt = Date.now();
  const mine = ++engineReads;
  void window.cth.engineSetupStatus?.()
    .then((s) => { if (mine === engineReads) publish({ engineSetup: s ?? null }); })
    .catch(() => { /* keep the last value */ });
}

function readProposals(): void {
  const mine = ++proposalReads;
  void window.cth.listMailProposals?.()
    .then((all) => { if (mine === proposalReads) publish({ proposals: Array.isArray(all) ? all : [] }); })
    .catch(() => { /* keep the last value */ });
}

/** Whether the Get Michael ready card shows: Michael cannot start, and no sign
 *  in stop is already asking the owner the same thing (eng R3). */
export function setupCardShown(f: Pick<NeedsYouFeed, 'engineSetup' | 'stop'>): boolean {
  return !!(f.engineSetup?.applies && f.engineSetup.needed) && f.stop?.reason !== 'signin';
}

let offStop: (() => void) | null = null;
let offSilent: (() => void) | null = null;
let offDegraded: (() => void) | null = null;
let offFoundations: (() => void) | null = null;
let offUpdate: (() => void) | null = null;
let offCaseStudy: (() => void) | null = null;
let offCli: (() => void) | null = null;
let caseStudyReads = 0;
/** Whether main holds a prepared case study the owner has not opened yet. */
function readCaseStudy(): void {
  const mine = ++caseStudyReads;
  void window.cth.caseStudyStatus?.()
    .then((p) => { if (mine === caseStudyReads) publish({ caseStudyWaiting: p?.state === 'ready' && p.waiting === true }); })
    .catch(() => { /* keep the last value */ });
}
/** Only a status the owner acts on replaces the card's: a re-check or a
 *  download error pushed after it must not take it off Ask me. */
function takeUpdate(s: unknown): void {
  const need = updateNeed(s as Parameters<typeof updateNeed>[0]);
  if (need) publish({ update: need });
}

/** Later on Michael's update card: off Ask me for this version until the app
 *  starts again. The title bar badge and Settings still offer it. */
export function putOffUpdate(version: string): void {
  publish({ updateLater: version });
}

/** The case study screen opened or closed: the card steps aside while it is open. */
export function setCaseStudyScreenOpen(open: boolean): void {
  publish({ caseStudyOpen: open });
}

/** A restart from the update card started, or was called off. */
export function setUpdateRestarting(restarting: boolean): void {
  publish({ updateRestarting: restarting });
}

/** Later on Michael's team upgrade card: off Ask me until a newer Claude Code
 *  is installed (owner D2, 2026-11-05). Nothing else offers it meanwhile. */
export function putOffCliUpdate(version: string): void {
  try { window.localStorage.setItem(CLI_LATER_KEY, version); } catch { /* this session only */ }
  publish({ cliUpdateLater: version });
}
/** Whether a status push has landed: the start up read fills the status only
 *  before one, so a late read never puts back an older status. */
let cliPushed = false;
function takeCliUpdate(s: CliUpdateStatus | null): void {
  cliPushed = true;
  // A null push (everyone caught up) replaces the status: the card leaves.
  publish({ cliUpdate: s ?? null });
}
function readStop(): void {
  void window.cth.officeBreakView?.()
    .then((v) => publish({ stop: v ?? null }))
    .catch(() => { /* keep the last value */ });
}

/** Listen for changes; the first listener starts the poll, the last stops it. */
export function subscribeNeedsYou(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    readTasks();
    readRequests();
    readProposals();
    timer = setInterval(readTasks, POLL_MS);
    offRequests = window.cth.onScheduleRequestsUpdated(readRequests);
    offProposals = window.cth.onMailProposalsUpdated?.(readProposals) ?? null;
    offEngine = window.cth.onEngineSetupChanged?.(() => readEngine()) ?? null;
    readStop();
    offStop = window.cth.onOfficeBreak?.((v) => publish({ stop: v ?? null })) ?? null;
    void window.cth.silentList?.().then((list) => publish({ silent: Array.isArray(list) ? list : [] })).catch(() => { /* keep the last value */ });
    offSilent = window.cth.onSilentChanged?.((list) => publish({ silent: list })) ?? null;
    void window.cth.degradedNotices?.().then((list) => publish({ degraded: Array.isArray(list) ? list : [] })).catch(() => { /* keep the last value */ });
    offDegraded = window.cth.onDegradedChanged?.((list) => publish({ degraded: list })) ?? null;
    offFoundations = window.cth.onFoundationsChanged?.(() => readFoundations()) ?? null;
    // Main may have found the update before this window listened: read the
    // last status once, then follow each push. A push that lands first wins
    // over the read, which may be older.
    offUpdate = window.cth.onUpdateStatus?.(takeUpdate) ?? null;
    void window.cth.updateCurrent?.().then((cur) => { if (!feed.update) takeUpdate(cur); }).catch(() => { /* nothing to show */ });
    readCaseStudy();
    offCaseStudy = window.cth.onCaseStudyWaiting?.(readCaseStudy) ?? null;
    // The team upgrade: follow each push; read the last status once in case
    // main found it before this window listened.
    offCli = window.cth.onCliUpdateStatus?.(takeCliUpdate) ?? null;
    void window.cth.cliUpdateCurrent?.().then((cur) => { if (!cliPushed) publish({ cliUpdate: cur ?? null }); }).catch(() => { /* the push still works */ });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      offRequests?.();
      offRequests = null;
      offProposals?.();
      offProposals = null;
      offEngine?.();
      offEngine = null;
      offStop?.();
      offStop = null;
      offSilent?.();
      offSilent = null;
      offDegraded?.();
      offDegraded = null;
      offFoundations?.();
      offFoundations = null;
      offUpdate?.();
      offUpdate = null;
      offCaseStudy?.();
      offCaseStudy = null;
      offCli?.();
      offCli = null;
    }
  };
}

const snapshot = (): NeedsYouFeed => feed;

/** Everything waiting on the owner, live. */
export function useNeedsYou(): NeedsYouFeed {
  return useSyncExternalStore(subscribeNeedsYou, snapshot, snapshot);
}

/** How many things wait on the owner (0 until the first read returns). */
export function useNeedsYouCount(): number {
  return useNeedsYou().count;
}

/** The latest feed, for event handlers that should not re-render on it. */
export function getNeedsYouFeed(): NeedsYouFeed {
  return feed;
}

/** Read again now: after the owner answers, approves or edits something. */
export function refreshNeedsYou(): void {
  // The engine first: readTasks' throttled read then sees it fresh and skips,
  // so one refresh starts one `claude auth status`, not two.
  readEngine();
  readTasks();
  readRequests();
  readKept();
  readProposals();
  readOffers();
  readNotices();
  readFoundations();
}

/** Show a local change at once (an answer just saved, a card dismissed); the
 *  next read from disk replaces it. */
export function updateNeedsYouTasks(change: (tasks: HiveTask[]) => HiveTask[]): void {
  taskReads++;
  publish({ tasks: change(feed.tasks) });
}

/** What the top bar pill shows (D2, D3): nothing while unknown, a quiet label
 *  at zero, the coral button above zero. */
export function pillState(status: NeedsYouFeed['status'], count: number): 'blank' | 'quiet' | 'hot' {
  if (status === 'unknown') return 'blank';
  return count > 0 ? 'hot' : 'quiet';
}

/** The newest open ask among these people, for a pod's "for you" chip (D11):
 *  only asks Needs you shows (shownQuestions), so the chip never opens it empty. */
export function newestAskFor(memberIds: string[], tasks: HiveTask[], foundations: FoundationsView | null = null): string | undefined {
  const ids = new Set(memberIds);
  let best: { id: string; at: string } | undefined;
  for (const t of tasks) {
    if (!t.assignee || !ids.has(t.assignee)) continue;
    const shown = shownQuestions(t, foundations);
    if (!shown.length) continue;
    const at = shown[0].askedAt ?? t.createdAt;
    if (!best || at > best.at) best = { id: t.id, at };
  }
  return best?.id;
}
