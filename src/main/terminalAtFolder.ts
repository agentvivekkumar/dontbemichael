/**
 * How to open a terminal window at a folder, per platform
 * (docs/designs/windows-11-installer.md, item 3). Tried in order: a launcher
 * that is missing (spawn ENOENT) falls through to the next.
 *
 * Windows: Windows Terminal (`wt.exe -d <cwd>`), else a cmd window started in
 * the folder. cmd parses its own command line, so the second form is passed
 * verbatim (`windowsVerbatimArguments`); Node's usual quoting would mangle the
 * empty window title `""` and a quoted folder path with spaces. A path holding a
 * quote or a control character is refused before either runs: Windows forbids
 * those in folder names, and verbatim arguments must never carry them. On
 * Windows a path holding ';', '%', '^' or '!' is refused too (see below).
 */
import type { ProcessLaunch } from './pty';

export function terminalLaunches(platform: NodeJS.Platform, cwd: string, comSpec = 'cmd.exe'): ProcessLaunch[] | { error: string } {
  if (!cwd || /["\u0000-\u001f]/.test(cwd)) return { error: 'invalid cwd' };
  // Windows Terminal splits its command line at ';' into separate commands, cmd
  // expands %VAR% even inside quotes, and ^ and ! are its escape and delayed
  // expansion characters, so a folder name holding one could change what runs.
  if (platform === 'win32' && /[;%^!]/.test(cwd)) return { error: 'invalid cwd' };
  if (platform === 'darwin') return [{ file: 'open', args: ['-a', 'Terminal', cwd] }];
  if (platform === 'win32') {
    return [
      { file: 'wt.exe', args: ['-d', cwd] },
      { file: comSpec, args: [`/c start "" /D "${cwd}" cmd`], windowsVerbatimArguments: true }
    ];
  }
  return { error: 'Opening a terminal at a folder is not supported on this system yet.' };
}
