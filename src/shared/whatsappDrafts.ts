/**
 * WhatsApp Drafts Model (Draft only mode).
 *
 * For agents assigned to WhatsApp with 'Draft only' mode:
 * the agent prepares messages which are stored as drafts for the owner
 * to review, edit, or dispatch directly from the UI.
 *
 * Pure: no Electron, no Node fs dependencies.
 */

export interface WhatsAppDraft {
  id: string; // wd_<timestamp>_<random>
  agentId: string;
  accountId: string;
  to: string;
  text: string;
  createdAt: number;
}
