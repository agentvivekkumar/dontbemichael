// Build the memory-graph model from existing hive data — no new IPC needed.
// Inputs come straight from the preload bridge / store:
//   - agents:   useStore(s => s.agents)
//   - log:      window.cth.hiveLog(max, 'message', since)   (the messages of the chosen time range)
// See MEMORY_GRAPH_SPEC.md §3 and §4 (its topic layer, §5, was removed 2026-10-03).

import type { AccentColorName } from '@/design/tokens';
import type { StatusKind } from '@/components/PixelBadge';
import type { OfficeCharacterName } from '@/scene/office/cast';

/** A hive message's speech act. */
export type MessageAct = 'request' | 'inform' | 'propose' | 'query' | 'agree' | 'refuse' | 'done';

export interface AgentNode {
  kind: 'agent';
  id: string;
  label: string;
  accent: AccentColorName;
  status: StatusKind;
  isGod: boolean;
  /** Office cast member drawn for this agent (owner, 2026-09-27: characters,
   *  not boxes). */
  character: OfficeCharacterName;
  /** number of message edges touching this agent (drives node size) */
  degree: number;
}
export interface PseudoNode {
  kind: 'pseudo';
  id: 'broadcast' | 'human';
  label: string;
}
export type GraphNode = AgentNode | PseudoNode;

export interface GraphEdge {
  id: string;
  kind: 'message';
  source: string;
  target: string;
  /** messages on the pair */
  weight: number;
  /** direction of traffic between the pair */
  dir?: 'fwd' | 'bwd' | 'both';
  lastAct?: MessageAct;
  lastSubject?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Minimal shapes we depend on (kept loose — hiveLog is loosely typed). */
export interface MinimalAgent {
  id: string;
  name: string;
  accent: AccentColorName;
  status: StatusKind;
  isGod?: boolean;
  character: OfficeCharacterName;
}
export interface MessageLogEntry {
  ts?: number;
  kind?: string;
  from?: string;
  to?: string;
  /** Who the hive actually delivered it to (agent ids). */
  delivered?: unknown;
  act?: MessageAct;
  subject?: string;
  [k: string]: unknown;
}

function sortedPairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Assemble the people and the message lines between them. */
export function buildGraph(
  agents: MinimalAgent[],
  log: MessageLogEntry[]
): GraphData {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const degree = new Map<string, number>();

  // ── message edges: aggregate per unordered pair, remember direction + latest ─
  interface PairAcc {
    a: string; b: string;            // a < b
    fwd: number; bwd: number;        // a->b, b->a counts
    lastTs: number; lastAct?: MessageAct; lastSubject?: string;
  }
  const pairs = new Map<string, PairAcc>();
  const pseudoUsed = new Set<'broadcast' | 'human'>();

  // Agents often address a teammate by name ("michael") rather than by id
  // ("god"); the hive delivers it anyway, so the name counts as the id.
  const byName = new Map(agents.map((a) => [a.name.trim().toLowerCase(), a.id]));
  const godId = agents.find((a) => a.isGod)?.id;
  const known = (ep?: string): string | null => {
    if (!ep) return null;
    if (byId.has(ep)) return ep;
    return byName.get(ep.trim().toLowerCase()) ?? null;
  };
  const resolve = (ep?: string, delivered?: unknown): string | null => {
    if (!ep) return null;
    const id = known(ep);
    if (id) return id;
    if (ep === 'broadcast') { pseudoUsed.add('broadcast'); return 'broadcast'; }
    if (ep === 'human') { pseudoUsed.add('human'); return 'human'; }
    // Otherwise whoever the hive delivered it to, when that is one teammate.
    const to = Array.isArray(delivered) && delivered.length === 1 && typeof delivered[0] === 'string' ? known(delivered[0]) : null;
    return to; // unknown endpoint (scheduler, breaker): skip
  };

  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.kind !== 'message') continue;
    // The owner talks only to Michael. The app also sends its own notices in
    // the owner's name (Office open, closing reminders, the copy of an Ask me
    // answer for whoever raised it); those are not conversation, so a message
    // from "human" counts only when it goes to Michael (owner, 2026-10-03).
    if (e.from === 'human' && (!godId || known(e.to) !== godId)) continue;
    const to = resolve(e.to, e.delivered);
    const from = to ? resolve(e.from) : null;
    if (!from || !to || from === to) continue;

    const key = sortedPairKey(from, to);
    const ts = typeof e.ts === 'number' ? e.ts : i; // fall back to log order
    let p = pairs.get(key);
    if (!p) {
      const [a, b] = from < to ? [from, to] : [to, from];
      p = { a, b, fwd: 0, bwd: 0, lastTs: -1 };
      pairs.set(key, p);
    }
    if (from === p.a) p.fwd++; else p.bwd++;
    if (ts >= p.lastTs) { p.lastTs = ts; p.lastAct = e.act; p.lastSubject = e.subject; }

    // degree counts agents only (pseudo nodes don't get sized)
    if (byId.has(from)) degree.set(from, (degree.get(from) ?? 0) + 1);
    if (byId.has(to)) degree.set(to, (degree.get(to) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // agent nodes — only those that actually appear, plus god, to avoid lone dots.
  // We include every roster agent so the floor is fully represented.
  for (const a of agents) {
    nodes.push({
      kind: 'agent',
      id: a.id,
      label: a.name,
      accent: a.accent,
      status: a.status,
      isGod: !!a.isGod,
      character: a.character,
      degree: degree.get(a.id) ?? 0
    });
  }
  if (pseudoUsed.has('broadcast')) nodes.push({ kind: 'pseudo', id: 'broadcast', label: 'broadcast' });
  if (pseudoUsed.has('human')) nodes.push({ kind: 'pseudo', id: 'human', label: 'human' });

  for (const p of pairs.values()) {
    const dir: GraphEdge['dir'] = p.fwd && p.bwd ? 'both' : p.fwd ? 'fwd' : 'bwd';
    edges.push({
      id: `message:${p.a}\u0000${p.b}`,
      kind: 'message',
      source: p.a,
      target: p.b,
      weight: p.fwd + p.bwd,
      dir,
      lastAct: p.lastAct,
      lastSubject: p.lastSubject
    });
  }

  return { nodes, edges };
}
