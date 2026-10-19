/**
 * Ephemeral sandbox manager for Employee Trial Shifts.
 * Creates an isolated scratch workspace containing only fictional business documents.
 * Verifies strict directory containment using pathInside.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TrialScenario } from '../../shared/trialShift/types';
import { isSameOrInside } from '../pathInside';

export interface TrialSandbox {
  dir: string;
  isInside: (targetPath: string) => boolean;
  readFile: (relPath: string) => string | null;
  cleanup: () => void;
}

export function createTrialSandbox(scenario: TrialScenario): TrialSandbox {
  const dir = mkdtempSync(join(tmpdir(), 'cth-trial-shift-'));

  // Seed with fictional business documents
  for (const doc of scenario.documents) {
    const fullPath = join(dir, doc.filename);
    if (!isSameOrInside(dir, fullPath)) {
      throw new Error(`Invalid document path outside sandbox: ${doc.filename}`);
    }
    writeFileSync(fullPath, doc.content, 'utf8');
  }

  const isInside = (targetPath: string): boolean => {
    return isSameOrInside(dir, resolve(targetPath));
  };

  const readFile = (relPath: string): string | null => {
    const fullPath = resolve(dir, relPath);
    if (!isInside(fullPath)) return null;
    try {
      return readFileSync(fullPath, 'utf8');
    } catch {
      return null;
    }
  };

  const cleanup = (): void => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error if already removed
    }
  };

  return {
    dir,
    isInside,
    readFile,
    cleanup
  };
}
