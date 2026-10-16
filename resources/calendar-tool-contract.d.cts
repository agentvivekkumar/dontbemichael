export interface BoundedRange { start: string; end: string; timeZone?: string }
export interface CalendarToolRequest { tool: 'list_calendars' | 'search_events' | 'free_busy'; calendars: string[]; range?: BoundedRange; text?: string; limit?: number }
export const TOOLS: Array<{ name: string; description: string; inputSchema: Record<string, unknown>; annotations: Record<string, boolean> }>;
export function validateCalendarToolRequest(tool: unknown, args: unknown): { ok: true; value: CalendarToolRequest } | { ok: false; reason: string };
export function parseCalendarRange(input: unknown): (BoundedRange & { startMs: number; endMs: number }) | null;
