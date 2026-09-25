/**
 * HookServer — the bridge between `claude` lifecycle hooks and the harness.
 *
 * Each spawned agent is launched with `--settings` pointing its hooks at a tiny
 * shim (see HOOK_SHIM in hive.ts) that forwards the hook payload to the Unix
 * domain socket this server listens on. We then:
 *   - drive avatar state from PreToolUse/PostToolUse/Notification/etc., and
 *   - report lifecycle boundaries while renderer-side guarded queues deliver
 *     inbox work only after the session reaches a safe idle prompt.
 *
 * Runs in the Electron main process.
 */
import { createServer, type Server } from 'node:net';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Notification, type WebContents } from 'electron';
import type { HiveManager } from './hive';
import type { HarnessConfig } from './config';
import type { ControlRegistry } from './control';
import type { CircuitBreaker } from './breaker';
import { estimateCostUsd } from './pricing';
import { validateHookEvent } from '../shared/hookEvents';
import { resolveGodName } from '../shared/godIdentity';
import { APP_NAME } from '../shared/appName';

/** Desktop notification bodies. The title is the agent's name (displayName). */
export const NOTIFY_FINISHED = 'Finished and ready for the next thing.';
export const NOTIFY_WAITING = 'Waiting for you.';
import { GUARDED_TOOLS, harnessWriteDecision } from './harnessGuard';
import { FOLDER_READ_TOOLS, FOLDER_WRITE_TOOLS, folderDecision, folderToolTarget } from '../shared/folderAccess';
import { folderLayoutFor } from './officeFile';
import { handoffContext } from '../shared/safeClear';

/** Maximum JSON payload bytes in one newline-delimited hook frame. */
const MAX_HOOK_FRAME_BYTES = 256 * 1024;

interface HookPayload {
  hook_event_name?: string;
  agent_id?: string | null;
  session_id?: string;
  transcript_path?: string;
  /** Status-line payloads only: the session's live context accounting. */
  context_window?: { total_input_tokens?: number; context_window_size?: number };
  cwd?: string;
  tool_name?: string;
  tool_input?: unknown;
  stop_hook_active?: boolean;
  prompt?: string;
  source?: string;
  notification_type?: string;
  /** Notification hook text, e.g. "Claude is waiting for your input" (idle) vs a
   *  permission request. Used to tell "needs you" from "just done / lingering". */
  message?: string;
  /** CostSample payloads only (synthesized by the proxy-bridge sidecar for
   *  qwen). Raw token counts for one response, fed to the cost ledger. */
  model?: string;
  input?: number;
  output?: number;
  cache_read?: number;
  cache_creation?: number;
}

export class HookServer {
  private server: Server | null = null;
  /** agentId → the live session's transcript file, learned from hook payloads.
   *  Lets the harness read per-agent telemetry (e.g. current context size)
   *  even when several agents share one cwd. */
  private transcriptPaths = new Map<string, string>();
  /** agentId → the latest context-window accounting from the statusLine shim
   *  (current tokens + the REAL window size — 200k vs 1M, which nothing else
   *  exposes). The renderer already gets this pushed live on `hive:contextUpdate`;
   *  we also retain the last value here so a main-side read (the voice read-layer's
   *  get_agent_detail / list_agents) can report "how full is each agent's context"
   *  without depending on a renderer round-trip. */
  private contextById = new Map<string, { tokens: number; limit: number; ts: number }>();
  /** The goal last delivered to each agent's current session. Goals are durable
   *  roster state, so repeating an unchanged multi-kilobyte briefing on every
   *  prompt only bloats the transcript. One entry per agent is sufficient: an
   *  agent has one live session, and a new session id replaces the old entry. */
  private deliveredGoalByAgent = new Map<string, { sessionId: string | null; goal: string | null }>();
  /** The company profile last delivered to each agent's session: same once per
   *  session, again on change, rule as the goal. */
  private deliveredProfileByAgent = new Map<string, { sessionId: string | null; text: string | null }>();
  /** What roster each agent's session was last given, so it is sent again only on a change. */
  private deliveredRosterByAgent = new Map<string, { sessionId: string | null; layoutKey: string; statusKey: string }>();
  /** The session each agent was last given its memory index in. */
  private deliveredMemoryByAgent = new Map<string, string | null>();

  constructor(
    private hive: HiveManager,
    private getWebContents: () => WebContents | null,
    private getConfig: () => HarnessConfig,
    /** #7C — operator control state. Optional so tests can omit it. */
    private control?: ControlRegistry,
    /** Circuit breaker (Lane A #6.6b) — fed the hook-derived signals (session id,
     *  repeated identical tool calls). Optional so the server still runs without it. */
    private breaker?: CircuitBreaker,
    /** Standing goal text for an agent (from the durable roster). Optional so
     *  tests can omit it; when set, injected at session start and when changed. */
    private getStandingGoal?: (agentId: string) => string | null,
    /** Optional observer of every hook boundary (agentId, event, message). The
     *  worker inbox-wake watchdog (workerWake.ts) feeds on this to learn when an
     *  agent is parked on a permission/HITL prompt so it never types into it. */
    private onEvent?: (agentId: string | undefined, event: string, message: string | undefined) => void,
    /** Company knowledge's live state, so turning it on or off reaches running
     *  agents on their next prompt instead of at their next start. */
    private getKnowledge?: () => { active: boolean; cliPath?: string; root?: string; meaning?: { bin: string; palace: string } },
    /** The company profile as agents read it (companyProfileContext), or null. */
    private getCompanyProfile?: () => string | null
  ) {}

  start(): void {
    const sock = this.hive.sockPath();
    if (!sock || this.server) return;
    // Clear a stale socket file left by a previous run.
    try { if (existsSync(sock)) rmSync(sock); } catch { /* noop */ }

    this.server = createServer((conn) => {
      let pending = Buffer.alloc(0);
      const rejectOversizedFrame = (bytes: number): void => {
        this.hive.appendLog({
          kind: 'hook-frame-rejected',
          reason: 'frame-too-large',
          bytes,
          limit: MAX_HOOK_FRAME_BYTES,
        });
        conn.destroy();
      };
      conn.on('data', (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        const nl = pending.indexOf(0x0a);
        if (nl === -1) {
          if (pending.length > MAX_HOOK_FRAME_BYTES) rejectOversizedFrame(pending.length);
          return; // wait for the full line
        }
        // The byte limit covers the JSON payload and excludes its newline.
        if (nl > MAX_HOOK_FRAME_BYTES) {
          rejectOversizedFrame(nl);
          return;
        }
        // Hook shims send one newline-delimited request per connection and stop writing.
        // conn.end() below closes the connection after that single frame is handled.
        const frame = pending.subarray(0, nl).toString('utf8');
        let payload: HookPayload = {};
        try { payload = JSON.parse(frame); } catch { /* ignore */ }
        let res: unknown = {};
        try { res = this.handle(payload); } catch { res = {}; }
        conn.end(JSON.stringify(res ?? {}));
      });
      conn.on('error', () => { /* shim hung up — ignore */ });
    });
    this.server.on('error', (e) => console.error('[hive] hook server error:', e));
    this.server.listen(sock);
  }

  stop(): void {
    try { this.server?.close(); } catch { /* noop */ }
    this.server = null;
    const sock = this.hive.sockPath();
    try { if (sock && existsSync(sock)) rmSync(sock); } catch { /* noop */ }
  }

  /** The transcript file of an agent's CURRENT session, if any hook has fired. */
  transcriptPath(agentId: string): string | undefined {
    return this.transcriptPaths.get(agentId);
  }

  /** The latest context-window accounting for an agent (current tokens + the real
   *  window size), or undefined if no statusLine tick has fired for it yet. */
  contextFor(agentId: string): { tokens: number; limit: number; ts: number } | undefined {
    return this.contextById.get(agentId);
  }

  private handle(p: HookPayload): unknown {
    const agentId = p.agent_id ?? undefined;
    const event = p.hook_event_name ?? 'Unknown';
    this.onEvent?.(agentId, event, p.message);
    if (agentId && typeof p.transcript_path === 'string' && p.transcript_path) {
      this.transcriptPaths.set(agentId, p.transcript_path);
    }

    // Status-line payloads carry the session's EXACT context accounting —
    // current tokens AND the real window size (200k vs 1M, which nothing else
    // exposes). Forward to the renderer for the agent-card context gauge.
    // Handled FIRST and returned early: this is pure telemetry from the
    // statusLine shim, not a real hook boundary — it must never trip the
    // HALT gate or feed the breaker's loop detector below. The early return
    // also (deliberately) skips recordSession for status ticks: a statusLine
    // payload's session_id adds nothing the real hooks don't already record,
    // and telemetry should never write to the registry. transcript_path IS
    // still captured above, where every payload shape benefits from it.
    if (event === 'Status') {
      const cw = p.context_window;
      if (agentId && cw && typeof cw.total_input_tokens === 'number'
        && typeof cw.context_window_size === 'number' && cw.context_window_size > 0) {
        // Retain for main-side reads (voice get_agent_detail / list_agents) …
        this.contextById.set(agentId, {
          tokens: cw.total_input_tokens,
          limit: cw.context_window_size,
          ts: Date.now()
        });
        // … and forward live to the renderer's agent-card context gauge.
        this.getWebContents()?.send('hive:contextUpdate', {
          agentId,
          tokens: cw.total_input_tokens,
          limit: cw.context_window_size
        });
      }
      return {};
    }

    // 7C.3 — a graceful operator HALT overrides everything (incl. the inbox
    // drain below): stop the agent CLEANLY at this hook boundary rather than
    // killing the PTY. session_id is in the payload for a later --resume.
    if (agentId && this.control?.shouldHalt(agentId)) {
      this.emit(agentId, event, p);
      return { continue: false, stopReason: 'Halted by the operator from the floor.' };
    }

    // Capture the Claude Code session id for idempotent --resume + cost dedup
    // (Lane A #6.6a). Cheap: recordSession writes only when it changes.
    if (agentId && p.session_id) this.hive.recordSession(agentId, p.session_id);

    // CostSample — synthesized by the proxy-bridge sidecar (qwen) on every
    // response with usage. Persist it to the SAME cost ledger as Claude's OTel
    // path, keyed by the synthesized session_id, then return early so cost stays
    // OUT of the Claude-only OTel/breaker/drain paths below. `usd` is the fallback
    // per-model estimate (a local model normally costs ~$0, but the row keeps the
    // accounting schema uniform). Pure telemetry — never feeds the loop detector.
    if (event === 'CostSample') {
      if (agentId && p.session_id) {
        const input = p.input ?? 0;
        const output = p.output ?? 0;
        const cacheRead = p.cache_read ?? 0;
        const cacheCreation = p.cache_creation ?? 0;
        this.hive.appendCostLedger({
          agentId,
          sessionId: p.session_id,
          ts: Date.now(),
          input,
          output,
          cacheRead,
          cacheCreation,
          model: p.model ?? '',
          usd: estimateCostUsd(p.model, {
            inputTokens: input,
            outputTokens: output,
            cacheReadTokens: cacheRead,
            cacheWriteTokens: cacheCreation
          })
        });
      }
      return {};
    }

    // Feed the breaker its hook-derived loop signal: a tool that actually ran.
    // A repeated identical (name+input) PostToolUse is the runaway-loop tell.
    if (event === 'PostToolUse' && agentId) {
      this.breaker?.recordToolUse(agentId, p.tool_name, p.tool_input);
    }

    // A human just spoke to this agent (issue #376): stamp the third progress
    // clock the no-progress arm reads. A conversation is prose in, prose out —
    // no hive file changes, no tool spans — which the arm otherwise reads as
    // "generating tokens without coordinating". A runaway loop is ONE prompt
    // followed by many tool calls, so this clock goes stale exactly when it
    // should and blinds nothing.
    if (event === 'UserPromptSubmit' && agentId) {
      this.breaker?.recordUserPrompt(agentId);
    }

    // Compaction exemption (issue #109): PreCompact opens it so the compaction
    // token burst can't trip the Δoutput arms; PostCompact — or any SessionStart,
    // since a fresh session makes in-flight compaction state moot — closes it
    // down to the trailing grace (a no-op when nothing was compacting).
    if (event === 'PreCompact' && agentId) this.breaker?.recordCompactStart(agentId);
    // Logged so compaction can be measured (tools/agent-metrics.cjs).
    if (event === 'PreCompact' && agentId) {
      const trigger = (p as { trigger?: unknown }).trigger;
      try { this.hive.appendLog({ kind: 'compact', agentId, trigger: typeof trigger === 'string' ? trigger : 'unknown' }); } catch { /* best-effort */ }
    }
    if ((event === 'PostCompact' || event === 'SessionStart') && agentId) {
      this.breaker?.recordCompactEnd(agentId);
    }

    if ((event === 'Stop' || event === 'SubagentStop') && agentId) {
      // Respect any upstream Stop hook that already re-entered this boundary.
      if (p.stop_hook_active) { this.emit(agentId, event, p); return {}; }
      // Never turn unread hive mail into a forced continuation at Stop. That old
      // path bypassed terminal-draft/HITL safety and could spend credits while a
      // user was answering a question. Inbox files remain durable; the renderer
      // wakes the agent later through its guarded idle-only delivery path.
      this.notify(agentId, NOTIFY_FINISHED);
      this.emit(agentId, event, p);
      return {};
    }

    // 7C.1 — HITL gate: deny a tool call at the PreToolUse boundary when the
    // agent is paused or this tool is gated. Race-free (immediate return, no
    // renderer round-trip → can't hit the shim timeout). Slow human APPROVAL is
    // deliberately left to Claude's native permission prompt.
    if (event === 'PreToolUse' && agentId && this.control) {
      const d = this.control.toolDecision(agentId, p.tool_name ?? '');
      if (d.deny) {
        this.emitControl(agentId, p.tool_name, d.reason);
        this.emit(agentId, event, p);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: d.reason ?? 'Denied by operator.'
          }
        };
      }
    }

    // Decision 48 — the harness folder is plumbing only. On a business install
    // (one with a business folder), a file write into it is refused unless it's a
    // protocol file; the reason tells the agent where the work belongs instead.
    // The tool check comes first so ordinary tool calls never read config.
    if (event === 'PreToolUse' && agentId && GUARDED_TOOLS.has(p.tool_name ?? '')) {
      const cfg = this.getConfig();
      const hiveRoot = this.hive.root();
      if ((cfg.businessFolder || cfg.officeFolder) && cfg.harnessHome && hiveRoot) {
        const d = harnessWriteDecision({
          tool: p.tool_name ?? '',
          toolInput: p.tool_input,
          cwd: p.cwd,
          agentId,
          isGod: agentId === 'god',
          harnessHome: cfg.harnessHome,
          hiveRoot,
          caseInsensitive: process.platform !== 'linux'
        });
        if (d.deny) {
          this.emitControl(agentId, p.tool_name, d.reason);
          this.emit(agentId, event, p);
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: d.reason
            }
          };
        }
      }
    }

    // Folder privacy (src/shared/folderAccess.ts). The spawn's settings already
    // deny the folders known then; this catches everything else: folders made
    // after the agent started, and Michael's own files, which a settings rule
    // can't hide without hiding the folders inside his.
    const toolName = p.tool_name ?? '';
    if (event === 'PreToolUse' && agentId && (FOLDER_READ_TOOLS.has(toolName) || FOLDER_WRITE_TOOLS.has(toolName))) {
      const d = this.folderCheck(agentId, toolName, p.tool_input, p.cwd);
      if (d.deny) {
        this.emitControl(agentId, toolName, d.reason);
        this.emit(agentId, event, p);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: d.reason
          }
        };
      }
    }

    // Memory pays off only if it's used (owner, 2026-09-25): record each time an
    // agent opens one of its procedure files, next to the tidy-up's own counts.
    if (event === 'PostToolUse' && agentId && toolName === 'Read') {
      const file = folderToolTarget('Read', p.tool_input, p.cwd);
      const root = this.hive.root();
      if (file && root && /[\\/]memory[\\/]procedures[\\/][^\\/]+\.md$/.test(file) && file.startsWith(root)) {
        try { this.hive.appendLog({ kind: 'memory-read', agentId, file: file.slice(root.length + 1) }); } catch { /* best-effort */ }
      }
    }

    // 7C.2 — mid-run steering: inject queued operator guidance as context on the
    // next eligible hook (no fragile typing into the TUI). Delivered once.
    // Merged with the roster line below so the two injections never displace each
    // other (only ONE additionalContext can be returned per hook).
    let steer: string | null = null;
    if ((event === 'UserPromptSubmit' || event === 'PostToolUse') && agentId && this.control) {
      steer = this.control.takeSteer(agentId) ?? null;
    }

    // Keep god's roster CURRENT. fleet.json is always fresh on disk, but god's
    // context is not: after a restart it resumes a transcript describing the old
    // floor and messages agents that are long gone. Push the live roster in as
    // additionalContext at the start of each session and on every prompt, so god
    // knows the floor all the time instead of only when it remembers to Read.
    // God-only and one line — every other agent is unaffected.
    const wantsRoster = (event === 'SessionStart' || event === 'UserPromptSubmit')
      && !!agentId && this.hive.isGod(agentId);
    // Hand the roster the LIVE context-window occupancy (contextById) so each
    // agent line can carry a `ctx NN%` — god then sees whose context is nearly
    // full when it routes work, instead of guessing from cumulative token spend.
    // A business office (owner, 2026-09-25) sends the full roster at the start
    // of a session and when the team changes, a one line status when only who
    // is busy or on hold changed, and nothing otherwise. Older installs keep
    // the live roster on every prompt.
    let roster: string | null = null;
    if (wantsRoster && this.getConfig().businessFolder && typeof this.hive.teamRoster === 'function') {
      const r = this.hive.teamRoster();
      const sessionId = p.session_id ?? null;
      const last = this.deliveredRosterByAgent.get(agentId!);
      if (r) {
        if (event === 'SessionStart' || !last || last.sessionId !== sessionId || last.layoutKey !== r.layoutKey) {
          roster = r.full;
        } else if (last.statusKey !== r.statusKey) {
          roster = r.status;
        }
        this.deliveredRosterByAgent.set(agentId!, { sessionId, layoutKey: r.layoutKey, statusKey: r.statusKey });
      }
    } else if (wantsRoster) {
      roster = this.hive.rosterContext((id) => this.contextFor(id));
    }

    // Standing goal (hire Briefing) — durable roster field, re-read every cycle so
    // an Edit Agent save is picked up on the next UserPromptSubmit without
    // restarting the worker. Deliver it once at SessionStart, then only when its
    // value changes; repeating an unchanged briefing on every prompt can make it
    // one of the largest elements in a long transcript. Kept out of
    // --append-system-prompt (volatile-free cache invariant); lives on the live
    // hook channel instead.
    const wantsGoal = (event === 'SessionStart' || event === 'UserPromptSubmit') && !!agentId;
    const goalRaw = wantsGoal ? (this.getStandingGoal?.(agentId) ?? null) : null;
    let goal: string | null = null;
    if (wantsGoal) {
      const sessionId = p.session_id ?? null;
      const delivered = this.deliveredGoalByAgent.get(agentId);
      const newSession = !delivered || delivered.sessionId !== sessionId;
      const changed = !!delivered && delivered.sessionId === sessionId && delivered.goal !== goalRaw;
      if (event === 'SessionStart' || newSession || changed) {
        this.deliveredGoalByAgent.set(agentId, { sessionId, goal: goalRaw });
        if (goalRaw) {
          goal = `<goal>\n${goalRaw}\n</goal>`;
        } else if (changed && delivered?.goal) {
          // Silence would leave the old briefing alive in the model's context.
          // Explicitly revoke it when the operator clears the durable field.
          goal = '<goal>\n[Cleared by the operator. Stop following the previous standing goal.]\n</goal>';
        }
      }
    }

    // The company profile (owner, 2026-09-25): key facts every agent, Michael
    // included, works from. Delivered at the start of each session and again
    // when the owner changes it, never repeated unchanged.
    let profile: string | null = null;
    if ((event === 'SessionStart' || event === 'UserPromptSubmit') && agentId && this.getCompanyProfile) {
      const text = this.getCompanyProfile();
      const sessionId = p.session_id ?? null;
      const delivered = this.deliveredProfileByAgent.get(agentId);
      const fresh = event === 'SessionStart' || !delivered || delivered.sessionId !== sessionId;
      if (fresh || delivered.text !== text) {
        this.deliveredProfileByAgent.set(agentId, { sessionId, text });
        if (text) profile = text;
        else if (!fresh && delivered?.text) profile = 'COMPANY PROFILE. The owner cleared the company profile; the facts given earlier no longer apply.';
      }
    }

    // The agent's memory index (owner, 2026-09-25): once at the start of each
    // session, and never again within it, so it stays in the prompt cache. The
    // tidy-up's changes arrive with the next session.
    let memoryIndex: string | null = null;
    if ((event === 'SessionStart' || event === 'UserPromptSubmit') && agentId) {
      const sessionId = p.session_id ?? null;
      if (event === 'SessionStart' || this.deliveredMemoryByAgent.get(agentId) !== sessionId) {
        this.deliveredMemoryByAgent.set(agentId, sessionId);
        memoryIndex = this.hive.memoryIndexFor?.(agentId) ?? null;
      }
    }

    // A handoff the agent wrote just before its conversation was cleared
    // (safeClearer.ts): given once, at the start of the new conversation.
    // Only a conversation that was really cleared takes it: a restart or a
    // compaction mid-handoff leaves it for the clearer (review, 2026-09-25).
    const handoffText = event === 'SessionStart' && p.source === 'clear' && agentId ? (this.hive.takeHandoff?.(agentId) ?? null) : null;
    const handoff = handoffText ? handoffContext(handoffText) : null;

    // Company knowledge turned on or off since this agent was last told.
    const knowledgeNote = (event === 'SessionStart' || event === 'UserPromptSubmit') && agentId && this.getKnowledge
      ? this.hive.knowledgeUpdate(agentId, this.getKnowledge())
      : null;

    if (steer || roster || goal || knowledgeNote || profile || memoryIndex || handoff) {
      this.emit(agentId, event, p);
      return {
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: [roster, profile, memoryIndex, handoff, goal, knowledgeNote, steer].filter(Boolean).join('\n\n')
        }
      };
    }

    // A Notification hook that means "the agent is blocked waiting for the user"
    // (idle prompt) deserves a desktop toast too — distinct from a permission
    // request, which surfaces natively in the agent's own Claude Code session
    // (approvable remotely via /remote-control).
    if (
      event === 'Notification' &&
      (p.notification_type === 'idle' ||
        (p.message ?? '').toLowerCase().includes('waiting for your input'))
    ) {
      // Our own words, not Claude Code's ("Claude is waiting for your input"):
      // the title already names the person, and owners don't know the engine.
      this.notify(agentId, NOTIFY_WAITING);
    }

    // Forward everything else to the renderer so avatars reflect real activity.
    this.emit(agentId, event, p);
    return {};
  }

  /** Fire a native desktop notification — gated on the user's `notifications`
   *  setting. Only the OS toast is gated; the hive:hookEvent emit is always sent
   *  so avatars/UI stay live regardless. Best-effort: never throw into the hook.
   *
   *  Only Michael notifies (owner, 2026-09-25): team members talk to Michael and
   *  at most wait on him, so their stops and idles never reach the desktop.
   *  Michael raises anything the owner must decide on ASK ME
   *  (docs/designs/michael-only-notifications.md). */
  private notify(agentId: string | undefined, body: string): void {
    if (!this.getConfig().notifications) return;
    if (!agentId || !this.isGod(agentId)) return;
    try {
      if (!Notification.isSupported()) return;
      new Notification({ title: this.displayName(agentId), body }).show();
    } catch { /* notifications unsupported on this platform — ignore */ }
  }

  private isGod(agentId: string): boolean {
    try {
      const reg = this.hive.registry();
      return agentId === (reg.godId ?? 'god') || !!reg.agents?.[agentId]?.isGod;
    } catch {
      return false;
    }
  }

  /** The name the owner knows an agent by, for a notification title. Never the
   *  internal id: Michael's id is `god` and nobody in the office is called that
   *  (2026-09-24). Michael's name follows a rename; an agent the registry does
   *  not know is announced as the app. */
  /** One file tool call judged against the office's folder rules. Offices
   *  without a business folder (older installs) have no rules to apply. */
  private folderCheck(agentId: string, tool: string, input: unknown, cwd: string | undefined): { deny: boolean; reason?: string } {
    const cfg = this.getConfig();
    if (!cfg.businessFolder) return { deny: false };
    const target = folderToolTarget(tool, input, cwd);
    if (!target) return { deny: false };
    const reg = this.hive.registry();
    const me = reg.agents[agentId];
    if (!me?.cwd || me.isAssistant) return { deny: false };
    const folders = (cfg.businessTeam ?? []).map((m) => m.folder);
    for (const a of Object.values(reg.agents)) {
      if (!a.isGod && !a.isAssistant && a.cwd) folders.push(a.cwd);
    }
    const layout = folderLayoutFor(cfg.businessFolder, folders, cfg.harnessHome ?? undefined);
    const godName = resolveGodName(reg.agents[reg.godId ?? 'god']?.name);
    const agent = { isGod: !!me.isGod, cwd: me.cwd };
    const ci = process.platform !== 'linux';
    // Judge the path as asked and the file it really is: a link inside the
    // agent's own folder can point anywhere (review, 2026-09-25).
    const asked = folderDecision(agent, layout, tool, target, ci, godName);
    if (asked.deny) return asked;
    const real = realPathOf(target);
    if (!real || real === target) return asked;
    // The folders in the layout are real paths, so the agent's own is too here.
    return folderDecision({ ...agent, cwd: realPathOf(me.cwd) ?? me.cwd }, layout, tool, real, ci, godName);
  }

  private displayName(agentId: string | undefined): string {
    if (!agentId) return APP_NAME;
    try {
      const reg = this.hive.registry();
      const name = reg.agents?.[agentId]?.name;
      if (agentId === (reg.godId ?? 'god')) return resolveGodName(name);
      return name?.trim() || APP_NAME;
    } catch {
      return APP_NAME;
    }
  }

  /** Tell the renderer a tool call was gated/denied (#7C.1) so it can surface it
   *  (toast / control strip) — distinct from the avatar hook stream. */
  private emitControl(agentId: string, tool: string | undefined, reason: string | undefined): void {
    this.getWebContents()?.send('control:approvalRequest', { agentId, tool, reason });
  }

  private emit(agentId: string | undefined, event: string, p: HookPayload, blocked = false): void {
    const payload = {
      agentId,
      event,
      tool: p.tool_name,
      notificationType: p.notification_type,
      source: p.source,
      message: p.message,
      blocked
    };
    if (!validateHookEvent(payload)) {
      console.warn('[hive] rejected invalid hook event:', event);
      return;
    }
    this.getWebContents()?.send('hive:hookEvent', payload);
  }
}

/** The real path of `p`, following links and taking the letter case on disk.
 *  A file that doesn't exist yet takes the real path of its nearest existing
 *  folder. Null when nothing along the way can be read. */
export function realPathOf(p: string): string | null {
  let dir = p;
  const rest: string[] = [];
  for (;;) {
    try { return join(realpathSync.native(dir), ...rest); } catch { /* not there yet */ }
    const up = dirname(dir);
    if (up === dir) return null;
    rest.unshift(basename(dir));
    dir = up;
  }
}
