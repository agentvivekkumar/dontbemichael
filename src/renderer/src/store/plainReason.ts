/**
 * Raw system error codes (ENOENT, EACCES) mean nothing to a business owner.
 * This names the plain-language i18n key for the common ones; anything else
 * (the document reader's own reasons are already plain words) is shown as is.
 */
export function plainReasonKey(err?: string): string | null {
  if (!err) return 'settings.memory.errUnknown';
  if (/ENOENT/.test(err)) return 'settings.memory.errNotFound';
  if (/EACCES|EPERM/.test(err)) return 'settings.memory.errNoPermission';
  if (/EISDIR/.test(err)) return 'settings.memory.errIsFolder';
  return null;
}
