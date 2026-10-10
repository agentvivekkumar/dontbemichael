/**
 * The office log line for a terminal still drawn past its box after a fit
 * (Windows report, 2026-10-09). Only numbers and short words reach the log,
 * which is committed with the office: no terminal text, no paths.
 */
const FIELDS = ['overflowPx', 'rows', 'cols', 'hostHeight', 'dpr', 'fontSize'] as const;

export function terminalOverflowEvent(info: unknown, platform: string): Record<string, number | string> | null {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return null;
  const clean: Record<string, number | string> = { kind: 'terminal-overflow', platform };
  // Only the known size fields, and only as numbers: no other key, so no path,
  // text or timestamp the renderer sends reaches the log.
  for (const k of FIELDS) {
    const v = (info as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = Math.round(v * 100) / 100;
  }
  // Nothing to say without an actual overflow.
  return typeof clean.overflowPx === 'number' && clean.overflowPx > 1 ? clean : null;
}
