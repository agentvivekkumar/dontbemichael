import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useStore } from '@/store/store';
import { PixelBadge } from './PixelBadge';
import { InfoTip } from './InfoTip';
import { Select } from './triggers/ui';
import { DEFAULT_RANGE, MAX_RANGE_MESSAGES, TIME_RANGES, isRangeKey, rangeStart, type TimeRangeKey } from './memoryGraph/timeRanges';
import { useAppTheme } from '@/design/theme';
import { departmentOf } from '@/scene/studio/layout';
import { family } from '@/scene/studio/theme';
import { INK_FIXED, PROP_ART, hasProp } from '@/scene/office/props';
import {
  buildGraph,
  type GraphData,
  type GraphNode,
  type GraphEdge,
  type MessageLogEntry
} from './memoryGraph/buildGraph';
import { forceLayout, type Positions } from './memoryGraph/forceLayout';

/** The chosen time range, remembered on this computer. */
const RANGE_KEY = 'cth.graphRange';
function loadRange(): TimeRangeKey {
  try {
    const v = window.localStorage.getItem(RANGE_KEY);
    return isRangeKey(v) ? v : DEFAULT_RANGE;
  } catch { return DEFAULT_RANGE; }
}

/** Who talks to whom: hive agents as nodes, messages as edges (the Topics
 *  layer was removed, owner 2026-10-03). SVG-rendered as avatars in
 *  department colors on a dot grid (branding/DESIGN.md 7.22).
 *
 *  All data comes from the existing preload bridge: store.agents + hiveLog +
 *  hiveMemory. No new IPC. Click an agent to jump to its memory; hover to peek. */
export function MemoryGraphPanel({
  godId,
  onJumpToMemory
}: {
  godId: string;
  onJumpToMemory: (agentId: string) => void;
}) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);

  const [log, setLog] = useState<MessageLogEntry[]>([]);
  const [range, setRange] = useState<TimeRangeKey>(loadRange);
  const [memories, setMemories] = useState<Record<string, string>>({});

  // ── poll the message log (same cadence as the Activity tab) ──────────────────
  const refresh = useCallback(async () => {
    try {
      const next = (await window.cth.hiveLog(MAX_RANGE_MESSAGES, 'message', rangeStart(range, Date.now()))) as MessageLogEntry[];
      // The same messages as last poll: keep the array, so the graph and its
      // layout are not rebuilt every 5 s for nothing.
      setLog((prev) => (prev.length === next.length && prev[0]?.id === next[0]?.id && prev[prev.length - 1]?.id === next[next.length - 1]?.id ? prev : next));
    } catch { /* noop */ }
  }, [range]);
  const pickRange = (v: string) => {
    if (!isRangeKey(v)) return;
    setRange(v);
    try { window.localStorage.setItem(RANGE_KEY, v); } catch { /* the choice just isn't remembered */ }
  };
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // ── lazy memory loads: one on hover ──────────────────────────────────────────
  const fetchMemory = useCallback(async (id: string) => {
    try {
      const text = await window.cth.hiveMemory(id);
      setMemories((m) => ({ ...m, [id]: text ?? '' }));
    } catch { setMemories((m) => ({ ...m, [id]: '' })); }
  }, []);


  // ── graph model ──────────────────────────────────────────────────────────────
  const graph: GraphData = useMemo(
    () => buildGraph(agents, log),
    [agents, log]
  );

  // ── canvas sizing ─────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 640, h: 440 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) setDims({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── pinned (dragged) node positions ──────────────────────────────────────────
  const [pinned, setPinned] = useState<Record<string, { x: number; y: number }>>({});

  // recompute layout only when structure / size / pins change (not on every poll)
  const structKey = useMemo(
    () => graph.nodes.map((n) => n.id).join(',') + '|' + graph.edges.map((e) => e.id).join(','),
    [graph]
  );
  const pinnedKey = useMemo(() => JSON.stringify(pinned), [pinned]);
  const layout: Positions = useMemo(() => {
    const lnodes = graph.nodes.map((n) => ({
      id: n.id,
      gravityBias: n.kind === 'pseudo' ? 1.4 : n.id === godId ? 2.4 : 1
    }));
    const ledges = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      strength: 0.7 + Math.min(e.weight, 5) * 0.06
    }));
    return forceLayout(lnodes, ledges, {
      width: dims.w, height: dims.h, pinned,
      // Clear of the header card on top and the legend below, with room for
      // a node's ring and its name (DESIGN.md 7.22).
      padding: 44, insetTop: GRAPH_HEADER_H, insetBottom: GRAPH_LEGEND_H
    });
    // structKey/pinnedKey capture the relevant graph identity; intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structKey, pinnedKey, dims.w, dims.h, godId]);

  // ── drag ──────────────────────────────────────────────────────────────────────
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);

  const posOf = useCallback(
    (id: string) => (live && live.id === id ? { x: live.x, y: live.y } : layout.get(id)),
    [live, layout]
  );

  const startDrag = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const p = posOf(id);
    if (!p) return;
    const s = toSvg(e.clientX, e.clientY);
    dragOffset.current = { x: s.x - p.x, y: s.y - p.y };
    moved.current = false;
    setLive({ id, x: p.x, y: p.y });
  }, [posOf, toSvg]);

  useEffect(() => {
    if (!live) return;
    const onMove = (ev: MouseEvent) => {
      const s = toSvg(ev.clientX, ev.clientY);
      const x = Math.max(8, Math.min(dims.w - 8, s.x - dragOffset.current.x));
      const y = Math.max(8, Math.min(dims.h - 8, s.y - dragOffset.current.y));
      moved.current = true;
      setLive((l) => (l ? { ...l, x, y } : l));
    };
    const onUp = () => {
      setLive((l) => {
        if (l && moved.current) setPinned((p) => ({ ...p, [l.id]: { x: l.x, y: l.y } }));
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [live, toSvg, dims.w, dims.h]);

  // ── hover / tooltip ─────────────────────────────────────────────────────────
  const [hover, setHover] = useState<
    | { kind: 'node'; node: GraphNode }
    | { kind: 'edge'; edge: GraphEdge }
    | null
  >(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  const onCanvasMove = useCallback((e: React.MouseEvent) => {
    const s = toSvg(e.clientX, e.clientY);
    setCursor(s);
  }, [toSvg]);

  const hoverNode = useCallback((node: GraphNode) => {
    setHover({ kind: 'node', node });
    if (node.kind === 'agent' && !(node.id in memories)) fetchMemory(node.id);
  }, [memories, fetchMemory]);

  const hoverNodeId = hover?.kind === 'node' ? hover.node.id : null;
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  const messageEdgeCount = graph.edges.filter((e) => e.kind === 'message').length;
  const hoverEdge = hover?.kind === 'edge' ? hover.edge : null;
  const dark = useAppTheme() === 'dark';
  const famOf = (n: GraphNode) => {
    const a = agents.find((x) => x.id === n.id);
    return a ? family(departmentOf(a), dark) : null;
  };
  /** Dim everything that is not part of what the pointer is on (DESIGN.md 7.22). */
  const isDim = (id: string): boolean => {
    if (hoverEdge) return id !== hoverEdge.source && id !== hoverEdge.target;
    return !!hoverNodeId && hoverNodeId !== id && !isNeighbor(graph, hoverNodeId, id);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '18px 24px 8px' }}>
      {/* canvas (DESIGN.md 7.22): a tinted card with a dot grid */}
      <div ref={wrapRef} style={{
        position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 'var(--cth-r-2xl)',
        background: 'color-mix(in srgb, var(--cth-floor) 45%, var(--cth-bg))', boxShadow: 'inset 0 0 0 1px var(--cth-line)'
      }}>
        <svg
          width={dims.w}
          height={dims.h}
          onMouseMove={onCanvasMove}
          style={{ display: 'block', userSelect: 'none' }}
        >
          <defs>
            <pattern id="mg-grid" width={24} height={18} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} fill="var(--cth-line-2)" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={dims.w} height={dims.h} fill="url(#mg-grid)" opacity={0.55} />

          {/* edges, behind the nodes */}
          <g>
            {graph.edges.map((e) => {
              const sp = posOf(e.source);
              const tp = posOf(e.target);
              const sn = nodeById.get(e.source);
              const tn = nodeById.get(e.target);
              if (!sp || !tp || !sn || !tn) return null;
              const hot = hoverEdge?.id === e.id;
              const touches = hoverEdge ? hot : (!hoverNodeId || e.source === hoverNodeId || e.target === hoverNodeId);
              const dx = tp.x - sp.x;
              const dy = tp.y - sp.y;
              const dist = Math.hypot(dx, dy) || 1;
              const ux = dx / dist;
              const uy = dy / dist;
              const sr = nodeRadius(sn) + 3;
              const tr = nodeRadius(tn) + 3;
              const w = 1 + Math.min(e.weight, 10) * 0.5;
              return (
                <g key={e.id}>
                  {/* a wide invisible stroke makes thin edges easy to hover */}
                  <line x1={sp.x + ux * sr} y1={sp.y + uy * sr} x2={tp.x - ux * tr} y2={tp.y - uy * tr}
                    stroke="transparent" strokeWidth={12}
                    onMouseEnter={() => setHover({ kind: 'edge', edge: e })}
                    onMouseLeave={() => setHover(null)} />
                  <line
                    x1={sp.x + ux * sr} y1={sp.y + uy * sr} x2={tp.x - ux * tr} y2={tp.y - uy * tr}
                    stroke={hot ? 'var(--cth-violet)' : 'var(--cth-ink-4)'}
                    strokeWidth={hot ? 3 : w}
                    strokeLinecap="round"
                    opacity={touches ? (hot ? 1 : 0.4 + Math.min(e.weight, 10) * 0.03) : 0.12}
                    pointerEvents="none"
                  />
                  {hot && (
                    <circle cx={(sp.x + tp.x) / 2} cy={(sp.y + tp.y) / 2} r={4} fill="var(--cth-card)" stroke="var(--cth-violet)" strokeWidth={2} pointerEvents="none" />
                  )}
                </g>
              );
            })}
          </g>

          {/* nodes */}
          <g>
            {graph.nodes.map((n) => {
              const p = posOf(n.id);
              if (!p) return null;
              const r = nodeRadius(n);
              const dim = isDim(n.id);
              const navigable = n.kind === 'agent';
              const fam = n.kind === 'agent' && !n.isGod ? famOf(n) : null;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={dim ? 0.3 : 1}
                  onMouseEnter={() => hoverNode(n)}
                  onMouseLeave={() => setHover(null)}
                  onMouseDown={(e) => startDrag(e, n.id)}
                  onClick={() => { if (navigable && !moved.current) onJumpToMemory(n.id); }}
                  style={{ cursor: navigable ? 'pointer' : 'grab' }}
                >
                  {n.kind === 'agent' ? (
                    // The person's prop on their department's light pastel,
                    // ringed in its accent; Michael's mug on ink (DESIGN.md
                    // 3.4, 7.22). No known character keeps the initial.
                    <>
                      <circle r={r + 3} fill={n.isGod ? 'var(--cth-indigo)' : fam?.acc ?? 'var(--cth-ink-4)'} opacity={n.isGod ? 0.35 : 1} />
                      <circle r={r} fill={n.isGod ? INK_FIXED : (hasProp(n.character) ? fam?.lit : fam?.l) ?? 'var(--cth-neutral-soft)'} stroke="var(--cth-card)" strokeWidth={2} />
                      {hasProp(n.character) || n.isGod ? (
                        <svg x={-r * 0.72} y={-r * 0.72} width={r * 1.44} height={r * 1.44} viewBox="0 0 24 24" overflow="visible" pointerEvents="none">
                          {PROP_ART[hasProp(n.character) ? n.character : 'michael']}
                        </svg>
                      ) : (
                        <text y={r * 0.32} textAnchor="middle" style={{ fontFamily: 'var(--cth-font-ui)', fontSize: r * 0.9, fontWeight: 700, fill: fam?.acc ?? 'var(--cth-ink-2)' }}>
                          {n.label.slice(0, 1).toUpperCase()}
                        </text>
                      )}
                      {pinned[n.id] && (
                        <g transform={`translate(${r * 0.72},${-r * 0.72})`}>
                          <circle r={8} fill="var(--cth-card)" stroke="var(--cth-line-2)" />
                          <path d="M-2.5,-3 L2.5,-3 L1.5,0 L3,1.5 L-3,1.5 L-1.5,0 Z M0,1.5 L0,4.5" fill="var(--cth-ink-2)" stroke="var(--cth-ink-2)" strokeWidth={0.8} strokeLinejoin="round" />
                        </g>
                      )}
                    </>
                  ) : (
                    <circle r={r} fill={n.id === 'human' ? 'var(--cth-coral-soft)' : 'var(--cth-neutral-soft)'} stroke={n.id === 'human' ? 'var(--cth-coral-base)' : 'var(--cth-line-2)'} strokeWidth={1.5} />
                  )}
                </g>
              );
            })}
          </g>

          {/* labels */}
          <g pointerEvents="none">
            {graph.nodes.map((n) => {
              const p = posOf(n.id);
              if (!p) return null;
              return (
                <text
                  key={n.id}
                  x={p.x} y={p.y + nodeRadius(n) + 17}
                  textAnchor="middle"
                  opacity={isDim(n.id) ? 0.25 : 1}
                  style={{
                    fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600,
                    fill: 'var(--cth-ink)'
                  }}
                >{truncate(n.label, 16)}</text>
              );
            })}
          </g>
        </svg>

        {/* toolbar, floating top left */}
        <div style={{
          position: 'absolute', top: 16, insetInlineStart: 16, display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 10px 8px 14px', borderRadius: 'var(--cth-r-lg)', background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-md)'
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--cth-ink)' }}>{t('floorView.graph')}</span>
          <Select value={range} onChange={pickRange} label={t('memoryGraph.rangeLabel')} style={{ width: 'auto', height: 28, fontSize: 12 }}>
            {TIME_RANGES.map((r) => <option key={r.key} value={r.key}>{t(`memoryGraph.range.${r.key}`)}</option>)}
          </Select>
          <button onClick={refresh} title={t('memoryGraph.refresh')} aria-label={t('memoryGraph.refresh')} style={iconBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg>
          </button>
        </div>

        {/* empty hint */}
        {messageEdgeCount === 0 && (
          <div style={{
            position: 'absolute', top: '45%', left: 0, right: 0, textAlign: 'center',
            fontSize: 13, color: 'var(--cth-ink-3)', pointerEvents: 'none'
          }}>{t('memoryGraph.noMessagesInRange')}</div>
        )}

        {/* tooltip */}
        {hover && (
          <Tooltip x={cursor.x} y={cursor.y} wrap={dims}>
            {hover.kind === 'node'
              ? <NodeTip node={hover.node} memories={memories} />
              : <EdgeTip edge={hover.edge} nodeById={nodeById} />}
          </Tooltip>
        )}

        <Legend />
      </div>
    </div>
  );
}

// ─── tooltip bodies ──────────────────────────────────────────────────────────

function NodeTip({ node, memories }: { node: GraphNode; memories: Record<string, string> }) {
  const { t } = useTranslation();
  if (node.kind === 'agent') {
    const mem = memories[node.id];
    const snippet = mem === undefined ? t('memoryGraph.loadingMemory') : memorySnippet(mem, t);
    return (
      <>
        <div style={tipTitle}>{node.label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 4px' }}>
          <PixelBadge status={node.status} />
          <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('memoryGraph.messageLinks', { count: node.degree })}</span>
        </div>
        <div style={tipBody}>{snippet}</div>
      </>
    );
  }
  return (
    <>
      <div style={tipTitle}>{node.label}</div>
      <div style={tipBody}>{node.id === 'human' ? 'escalations to the human' : 'broadcast to everyone'}</div>
    </>
  );
}

function EdgeTip({ edge, nodeById }: { edge: GraphEdge; nodeById: Map<string, GraphNode> }) {
  const { t } = useTranslation();
  const a = nodeById.get(edge.source)?.label ?? edge.source;
  const b = nodeById.get(edge.target)?.label ?? edge.target;
  return (
    <>
      <div style={tipTitle}>{t('memoryGraph.pair', { a, b })}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--cth-violet-text)', margin: '3px 0' }}>
        {t('memoryGraph.messagesCount', { count: edge.weight })}
      </div>
      {edge.lastSubject && <div style={tipBody}>{t('memoryGraph.last', { subject: truncate(edge.lastSubject, 80) })}</div>}
    </>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <div style={{
      position: 'absolute', bottom: 16, insetInlineStart: 16, padding: '7px 12px', borderRadius: 'var(--cth-r-lg)',
      background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)',
      display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--cth-ink-2)'
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--cth-blue-soft)', boxShadow: 'inset 0 0 0 2px var(--cth-blue)' }} />{t('memoryGraph.legendPerson')}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 18, height: 2, borderRadius: 1, background: 'var(--cth-ink-4)' }} />{t('memoryGraph.legendMessages')}
      </span>
      <InfoTip text={t('floorView.graphIntroShort')} />
    </div>
  );
}

function Tooltip({ x, y, wrap, children }: { x: number; y: number; wrap: { w: number; h: number }; children: React.ReactNode }) {
  const W = 250;
  const left = Math.min(x + 14, wrap.w - W - 6);
  const flipUp = y > wrap.h - 120;
  return (
    <div style={{
      position: 'absolute', left: Math.max(6, left), top: flipUp ? undefined : y + 14,
      bottom: flipUp ? wrap.h - y + 14 : undefined,
      width: W, padding: '10px 12px', pointerEvents: 'none', zIndex: 5, borderRadius: 'var(--cth-r-lg)',
      background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)'
    }}>{children}</div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Room the floating header card (top) and legend (bottom) take from the
 *  canvas, beyond the layout's own padding. */
const GRAPH_HEADER_H = 52;
const GRAPH_LEGEND_H = 56;

// Avatars: Michael 72px, everyone else 48px (DESIGN.md 7.22).
function nodeSize(n: GraphNode): number {
  if (n.kind === 'agent') return n.isGod ? 72 : 48;
  return 30; // pseudo
}
function nodeRadius(n: GraphNode): number { return nodeSize(n) / 2; }

function isNeighbor(graph: GraphData, a: string, b: string): boolean {
  for (const e of graph.edges) {
    if ((e.source === a && e.target === b) || (e.source === b && e.target === a)) return true;
  }
  return false;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** First meaningful line(s) of a memory file, for the hover preview. */
function memorySnippet(text: string, t: TFunction): string {
  if (!text.trim()) return t('memoryGraph.noMemory');
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[#>\-*\s]+/, '').trim())
    .filter((l) => l && !/^_.*_$/.test(l) && !/^memory \u2014/i.test(l));
  return truncate(lines.slice(0, 3).join(' '), 200) || t('memoryGraph.noMemory');
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer', borderRadius: 'var(--cth-r-md)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', color: 'var(--cth-ink-2)'
};

const tipTitle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--cth-ink)', lineHeight: '17px'
};
const tipBody: React.CSSProperties = {
  fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)'
};
