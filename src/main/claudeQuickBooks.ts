/**
 * Asks the Claude CLI whether the owner's Claude account has QuickBooks
 * (Settings > Connections > QuickBooks, owner 2026-09-29). `claude mcp list`
 * checks every connector, so it takes a few seconds; it runs only when the
 * owner opens that section with the switch on, or presses Check again.
 */
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { buildPtyEnv } from './ptyEnv';
import { userShellPath } from './shellEnv';
import { parseClaudeQuickBooksStatus, type ClaudeQuickBooksStatus } from '../shared/quickbooks';

/** The Claude CLI to ask: the default command's binary when that is Claude,
 *  else plain `claude`. The connector is on the Claude account whatever
 *  engine the team runs, and another CLI's `mcp list` would say nothing. */
export function claudeBinFor(defaultCommand: string | undefined): string {
  const first = (defaultCommand ?? '').trim().split(/\s+/)[0] ?? '';
  const leaf = (first.split(/[\\/]/).pop() ?? '').replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
  return leaf === 'claude' ? first : 'claude';
}

export function claudeQuickBooksStatus(binPath: string | null): Promise<ClaudeQuickBooksStatus> {
  if (!binPath) return Promise.resolve('unknown');
  return new Promise((resolve) => {
    execFile(binPath, ['mcp', 'list'], { timeout: 30_000, encoding: 'utf8', cwd: homedir(), env: buildPtyEnv(process.env, process.platform === 'win32' ? (process.env.PATH ?? '') : userShellPath()) }, (err, stdout) => {
      // A server failing its health check makes the command exit non-zero while
      // still printing the list, so the output is read whenever there is some.
      // A run that failed or timed out before listing QuickBooks proves
      // nothing, so it is 'unknown', not "not connected".
      const s = parseClaudeQuickBooksStatus(String(stdout ?? ''));
      resolve(err && s === 'not-added' ? 'unknown' : s);
    });
  });
}
