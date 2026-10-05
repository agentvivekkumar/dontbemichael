import { REPO_URL } from './updateState';

/**
 * The "Report a problem" link: a new bug report on GitHub with the app version
 * and the OS filled in (docs/designs/windows-11-installer.md, E4). The keys are
 * the bug report form's field ids (.github/ISSUE_TEMPLATE/bug_report.yml), and
 * `os` must be one of that form's dropdown options, which the OS labeler reads.
 * Nothing else goes in the URL: no paths, names or logs.
 */
export function reportProblemUrl(p: { appVersion: string; platform: string; arch: string; osVersion?: string }): string {
  const os = p.platform === 'darwin' ? (p.arch === 'arm64' ? 'macOS (Apple Silicon)' : 'macOS (Intel)')
    : p.platform === 'win32' ? 'Windows'
    : p.platform === 'linux' ? 'Linux'
    : '';
  const q = new URLSearchParams({ template: 'bug_report.yml', 'app-version': p.appVersion });
  if (os) q.set('os', os);
  if (p.osVersion) q.set('os-version', p.osVersion.slice(0, 40));
  return `${REPO_URL}/issues/new?${q.toString()}`;
}
