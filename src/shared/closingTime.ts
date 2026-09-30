/**
 * Closing-time values shared by main (src/main/closingTime.ts) and the quit
 * dialog, so the two cannot drift apart.
 */

/** One Remind per agent per this long; the dialog shows "reminded" as long. */
export const CLOSING_TIME_REMIND_MS = 30_000;
