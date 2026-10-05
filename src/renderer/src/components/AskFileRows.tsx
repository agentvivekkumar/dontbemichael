import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { askFilePaths, fileTitle, kindOf, type AskFileVerdict } from '@shared/askFiles';
import { Icon } from './Icon';
import { PixelButton } from './PixelButton';

type Verdicts = Record<string, AskFileVerdict>;
type Who = { raisedBy?: string; assignee?: string };

/** Main's check caps one call at 20 paths. */
const ASK_FILES_PER_CALL = 20;

/** Asks main what each path can do. If the check fails the buttons fall back
 *  to Show in Finder rather than sitting disabled: the click asks main again
 *  anyway (fs:openAskFile), so it opens, shows or reports the file missing. */
async function checkAskFiles(paths: string[], who: Who): Promise<Verdicts> {
  const out: Verdicts = {};
  for (let i = 0; i < paths.length; i += ASK_FILES_PER_CALL) {
    const chunk = paths.slice(i, i + ASK_FILES_PER_CALL);
    try {
      const v = await window.cth.askFiles(chunk, who);
      chunk.forEach((p, j) => { out[p] = v[j] ?? 'missing'; });
    } catch {
      for (const p of chunk) out[p] = 'reveal';
    }
  }
  return out;
}

/**
 * One check for every question on a card (Task detail), not one per question.
 * Grouped by who raised each question, since that decides which team folder is
 * searched first; a card's questions usually share one raiser, so one call.
 * Returns the verdicts by raiser ('' for none), each keyed by path.
 */
export function useAskFileVerdicts(
  entries: ReadonlyArray<{ q: string; raisedBy?: string }> | undefined,
  assignee?: string
): Record<string, Verdicts> {
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of entries ?? []) {
      const raiser = e.raisedBy ?? '';
      const list = m.get(raiser) ?? [];
      for (const p of askFilePaths(e.q)) if (!list.includes(p)) list.push(p);
      if (list.length) m.set(raiser, list);
    }
    return [...m];
  }, [entries]);
  const key = JSON.stringify(groups);
  const [byRaiser, setByRaiser] = useState<Record<string, Verdicts>>({});

  useEffect(() => {
    setByRaiser({});
    let alive = true;
    for (const [raiser, paths] of groups) {
      void checkAskFiles(paths, { raisedBy: raiser || undefined, assignee })
        .then((v) => { if (alive) setByRaiser((s) => ({ ...s, [raiser]: v })); });
    }
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, assignee]);

  return byRaiser;
}

/**
 * The files an Ask me question names, one plain row each between hairlines,
 * under the question (docs/designs/ask-me-open-file.md, design D2 to D6; owner,
 * 2026-10-04: a question about a saved file should open it, not leave the owner
 * hunting for the path). Main checks every path and decides what the button
 * does: Open in the default app, Show in Finder (Show in folder on Windows), or
 * nothing (Not found). The rows render from the question text at once, so
 * nothing jumps while the check runs; the button waits for it.
 *
 * `verdicts` comes from a parent that checked many questions at once
 * (useAskFileVerdicts); without it the rows check their own paths.
 * `endRule={false}` drops the last hairline when the parent draws its own.
 */
export function AskFileRows({ question, raisedBy, assignee, verdicts: given, endRule = true, style }: {
  question: string;
  raisedBy?: string;
  assignee?: string;
  verdicts?: Verdicts;
  endRule?: boolean;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const paths = useMemo(() => askFilePaths(question), [question]);
  const key = paths.join('\n');
  const [own, setOwn] = useState<Verdicts>({});
  // A click that finds the file gone marks it here, over either source.
  const [gone, setGone] = useState<Record<string, true>>({});
  const win = window.cth.platform === 'win32';

  // One check per set of paths while this card is open: the 5 s Needs you poll
  // re-renders the card without asking main again.
  useEffect(() => {
    if (!paths.length || given) return;
    let alive = true;
    void checkAskFiles(paths, { raisedBy, assignee }).then((v) => { if (alive) setOwn(v); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, raisedBy, assignee, !given]);

  if (!paths.length) return null;
  const verdicts = given ?? own;
  const open = (p: string) => void window.cth.openAskFile(p, { raisedBy, assignee })
    .then((r) => { if (!r.ok) setGone((g) => ({ ...g, [p]: true })); })
    .catch(() => undefined);

  return (
    <div role="list" aria-label={t('askMe.fileFiles')} style={{ borderTop: '1px solid var(--cth-line)', ...style }}>
      {paths.map((p, i) => {
        const verdict: AskFileVerdict | undefined = gone[p] ? 'missing' : verdicts[p];
        const name = fileTitle(p);
        const kind = kindOf(p);
        const missing = verdict === 'missing';
        const reveal = verdict === 'reveal';
        const labels = [t('askMe.fileOpen'), t(win ? 'askMe.fileRevealWindows' : 'askMe.fileReveal')];
        return (
          <div key={p} role="listitem" title={`⁨${p}⁩`} style={{
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '6px 0',
            borderBottom: endRule || i < paths.length - 1 ? '1px solid var(--cth-line)' : undefined
          }}>
            <span style={{ color: 'var(--cth-ink-3)', display: 'grid', placeItems: 'center' }}>
              <Icon name={kind === 'excel' || kind === 'csv' ? 'sheet' : 'file'} />
            </span>
            <span dir="auto" style={{
              flex: 1, minWidth: 0, fontSize: 12, lineHeight: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: missing ? 'var(--cth-ink-3)' : 'var(--cth-ink)', unicodeBidi: 'isolate'
            }}>{name}</span>
            {missing ? (
              <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--cth-ink-3)' }}>{t('askMe.fileNotFound')}</span>
            ) : (
              <>
                <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--cth-ink-3)' }}>{t(`askMe.fileKind.${kind}`)}</span>
                <PixelButton
                  variant="secondary" size="sm"
                  disabled={!verdict}
                  onClick={() => open(p)}
                  ariaLabel={reveal
                    ? t(win ? 'askMe.fileRevealLabelWindows' : 'askMe.fileRevealLabel', { name })
                    : t('askMe.fileOpenLabel', { name })}
                  style={{ flexShrink: 0 }}
                >
                  {/* Both labels share one cell, so the button is as wide as
                      the longer one whichever shows: the name never shrinks
                      when the check lands. */}
                  <span style={{ display: 'inline-grid', justifyItems: 'center' }}>
                    {labels.map((l, j) => (
                      <span key={j} aria-hidden style={{ gridArea: '1 / 1', visibility: (j === 1) === reveal ? 'visible' : 'hidden' }}>{l}</span>
                    ))}
                  </span>
                </PixelButton>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
