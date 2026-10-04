// Who talks to whom shows the messages of a time range, not a fixed count
// (owner, 2026-10-03: "instead of last 200 messages, make a filter by time").

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const TIME_RANGES = [
  { key: '1h', ms: HOUR },
  { key: '4h', ms: 4 * HOUR },
  { key: '8h', ms: 8 * HOUR },
  { key: '1d', ms: DAY },
  { key: '3d', ms: 3 * DAY },
  { key: '1w', ms: 7 * DAY },
  { key: '2w', ms: 14 * DAY },
  { key: '1m', ms: 30 * DAY }
] as const;

export type TimeRangeKey = (typeof TIME_RANGES)[number]['key'];

export const DEFAULT_RANGE: TimeRangeKey = '1d';

/** Most messages the chart reads for one range; a month of a busy office fits. */
export const MAX_RANGE_MESSAGES = 5000;

export function isRangeKey(v: unknown): v is TimeRangeKey {
  return TIME_RANGES.some((r) => r.key === v);
}

/** The earliest message time (ms) a range shows, counted back from `now`. */
export function rangeStart(key: TimeRangeKey, now: number): number {
  const range = TIME_RANGES.find((r) => r.key === key) ?? TIME_RANGES.find((r) => r.key === DEFAULT_RANGE)!;
  return now - range.ms;
}
