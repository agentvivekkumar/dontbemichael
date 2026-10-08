import type { SendingMode } from '@shared/mailboxes';

/** The locale key naming each Sending choice, everywhere it is shown. */
export const SENDING_LABEL_KEY: Record<SendingMode, string> = {
  send: 'capabilities.canSend',
  approval: 'capabilities.sendOnApproval',
  draft: 'capabilities.draftOnly'
};
