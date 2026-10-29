/**
 * The letter a Ctrl or Cmd shortcut was pressed on, lower case.
 *
 * `key` follows the keyboard layout, so on Windows and Linux Ctrl+C on a
 * Russian, Arabic, Greek or Hebrew layout gives 'с', 'ؤ', 'ψ' or 'ב', never
 * 'c'. xterm still reads that press as Ctrl+C from its key code and sends the
 * program an interrupt, so the copy the owner asked for became a stop. When the
 * layout gives no Latin letter, the physical key (`code`) names it instead. A
 * Latin layout keeps its own letter, so Dvorak's C is still 'c'.
 */
export function shortcutLetter(ev: { key: string; code?: string }): string {
  const key = ev.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;
  const physical = /^Key([A-Z])$/.exec(ev.code ?? '');
  return physical ? physical[1].toLowerCase() : key;
}
