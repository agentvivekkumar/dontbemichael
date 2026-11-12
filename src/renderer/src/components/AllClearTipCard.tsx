/**
 * Needs you after the last answer (owner, 2026-11-10; shared/allClearTip.ts):
 * the answers given this time as one quiet line, and one tip from Michael
 * drawn from this office (a Pulse saving, or a connector nobody uses), else
 * what the team did today, from Pulse's own counts. It
 * lives in the column, so it goes when the column closes, another tab opens
 * or the office restarts, and it is never counted in Needs you.
 *
 * A saving applies through Pulse's own apply, exactly as the Pulse card does;
 * a connector opens Settings, Connections: which member may use it stays the
 * owner's choice (access starts off, owner 2026-10-14). Not now hides a tip
 * for a week, in this window's storage.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Advice } from '@shared/teamAdvice';
import { pickAllClearTip, snoozeTip, answerShort, todayRecap, type AllClearTip } from '@shared/allClearTip';
import type { Outcome } from '@shared/teamPerformance';
import { connectorGranted, connectorOn, isEmailCalendarKey, isMailConnectorKey, isQuickBooksKey } from '@shared/claudeConnectors';
import { MICHAEL_ID } from '@shared/askMeRouting';
import { useStore } from '@/store/store';
import { useHarnessConfig } from '@/hooks/useHarnessConfig';
import { useMissions, whenText } from './triggers/ScheduleList';
import { AgentAvatar } from './AgentAvatar';
import { PixelButton } from './PixelButton';

const SNOOZE_KEY = 'cth.allClearTipSnoozed';

function readSnoozed(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, number> : {};
  } catch { return {}; }
}
function writeSnoozed(v: Record<string, number>): void {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(v)); } catch { /* a convenience only */ }
}

const money = (v: number): string => `$${(Math.round(v * 100) / 100).toFixed(2)}`;
function every(ms: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  return ms % 3_600_000 === 0 ? t('pulse.hoursShort', { h: ms / 3_600_000 }) : t('pulse.minutesShort', { m: Math.round(ms / 60_000) });
}

/** The answers given this time, as one line; Show lists each title and choice. */
export function AnswersSent({ answers, godName }: { answers: ReadonlyArray<{ id: string; title: string; a: string }>; godName: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!answers.length) return null;
  return (
    <div style={{ padding: '0 2px', fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--cth-green-soft)', color: 'var(--cth-green-text)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>✓</span>
        <span>{answers.length === 1 ? t('askMe.answerSent', { godName }) : t('askMe.answersSent', { count: answers.length, godName })}</span>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={linkButton}>{t(open ? 'askMe.hideAnswers' : 'askMe.showAnswers')}</button>
      </div>
      {open && (
        <ul style={{ margin: '6px 0 0', paddingInlineStart: 20, listStyle: 'none' }}>
          {answers.map((x) => (
            <li key={x.id}><span style={{ fontWeight: 500, color: 'var(--cth-ink-2)' }}>{x.title}</span>: {answerShort(x.a)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AllClearTipCard({ godName }: { godName: string }) {
  const { t } = useTranslation();
  const config = useHarnessConfig();
  const agents = useStore((s) => s.agents);
  const updateAgent = useStore((s) => s.updateAgent);
  const { missions } = useMissions();
  const [advice, setAdvice] = useState<Advice[] | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, number>>(readSnoozed);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Today's snapshot: its suggestions span 14 days whatever the period, and
    // its outcomes are today's work for the recap.
    void window.cth.pulseSnapshot('today', false)
      .then((v) => {
        if (!alive) return;
        setAdvice(v?.available ? v.advice ?? [] : []);
        setOutcomes(v?.available ? v.snapshot?.outcomes ?? [] : []);
      })
      .catch(() => { if (alive) { setAdvice([]); setOutcomes([]); } });
    return () => { alive = false; };
  }, []);

  const tip: AllClearTip | null = useMemo(() => {
    if (advice === null || !config) return null;
    // Connectors the owner switched on, mail, calendar and QuickBooks left
    // out (they are granted by other switches), and whether any member on
    // the team may use each.
    const connectorsOn = (config.claudeConnectors?.list ?? [])
      .filter((c) => connectorOn(config, c.key) && !isMailConnectorKey(c.key) && !isEmailCalendarKey(c.key) && !isQuickBooksKey(c.key))
      .map((c) => ({ key: c.key, label: c.key }));
    const grantedKeys = new Set(connectorsOn.filter((c) => agents.some((a) => connectorGranted(config, a.id, c.key, false))).map((c) => c.key));
    return pickAllClearTip({ advice, connectorsOn, grantedKeys, snoozed, now: Date.now() });
  }, [advice, config, agents, snoozed]);

  if (done) return <div role="status" style={{ padding: '0 2px', fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-3)' }}>{done}</div>;
  if (!tip) {
    // Nothing worth doing: what the team did today, so the space is rarely
    // empty (owner, 2026-11-11). Nothing done yet either: no card.
    const lines = todayRecap(outcomes);
    if (!lines.length) return null;
    return (
      <section aria-label={t('allClearTip.recapTitle')} style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={chip}><AgentAvatar id={MICHAEL_ID} name={godName} size={16} />{godName}</span>
          <span style={{ ...tag, ...todayTag }}>{t('allClearTip.today')}</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600, lineHeight: '19px', letterSpacing: '-0.01em', color: 'var(--cth-ink)' }}>{t('allClearTip.recapTitle')}</div>
        <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', fontSize: 12.5, lineHeight: '20px', color: 'var(--cth-ink-2)' }}>
          {lines.map((o) => (
            <li key={o.kind}><span style={{ fontWeight: 600, color: 'var(--cth-ink)' }}>{o.total}</span> {t(`pulse.outcome.${o.kind}`, { sub: o.sub ?? 0 })}</li>
          ))}
        </ul>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <PixelButton variant="secondary" size="sm" onClick={() => useStore.getState().setFloorView('pulse')}>{t('allClearTip.openPulse')}</PixelButton>
        </div>
      </section>
    );
  }

  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.name ?? id;
  const notNow = (): void => { const next = snoozeTip(snoozed, tip.id, Date.now()); writeSnoozed(next); setSnoozed(next); };

  let title: string, body: string, action: string, act: () => void | Promise<void>, member: string | null = null;
  if (tip.kind === 'save') {
    const a = tip.advice;
    const name = nameOf(a.agentId);
    const job = missions.find((m) => m.id === a.missionId)?.label ?? '';
    member = a.agentId;
    title = t('allClearTip.saveTitle', { usd: money(tip.usdPerWeek) });
    if (a.change.kind === 'interval') {
      body = `${t('pulse.advice.runLess', { name, job })}. ${t('pulse.advice.runLessWhy', { nothing: a.evidence.nothing, runs: a.evidence.runs })} ${t('pulse.advice.everyChange', { from: every(a.change.fromMs, t), to: every(a.change.toMs, t) })}`;
      action = t('allClearTip.every', { to: every(a.change.toMs, t) });
    } else if (a.change.kind === 'when') {
      body = `${t('pulse.advice.runLess', { name, job })}. ${t('pulse.advice.runLessWhy', { nothing: a.evidence.nothing, runs: a.evidence.runs })} ${t('pulse.advice.whenChange', { from: whenText(a.change.from, t), to: whenText(a.change.to, t) })}`;
      action = t('pulse.apply');
    } else {
      const label = a.change.kind === 'model' ? a.change.toLabel : '';
      body = `${t('pulse.advice.tryModel', { name, model: label })}. ${t('pulse.advice.cheaperWhy', { kept: a.evidence.kept, decisions: a.evidence.decisions })}`;
      action = t('allClearTip.useModel', { model: label });
    }
    act = async () => {
      if (busy) return;
      setBusy(true);
      try {
        // Pulse's own apply, as its card does it.
        const r = await window.cth.pulseApply(a.id, a.change);
        if (!r.ok) { setDone(t(r.error === 'stale' ? 'pulse.staleApply' : 'pulse.applyFailed')); return; }
        if (r.kind === 'schedule' && a.change.kind === 'interval') setDone(t('pulse.appliedSchedule', { name, job, to: every(a.change.toMs, t) }));
        if (r.kind === 'schedule' && a.change.kind === 'when') setDone(t('pulse.appliedWhen', { name, job, to: whenText(a.change.to, t) }));
        if (r.kind === 'model') {
          updateAgent(r.agentId, { model: r.to });
          await window.cth.pulseModelApplied(a.id, r.agentId, r.from, r.to);
          setDone(t('pulse.appliedModel', { name, model: a.change.kind === 'model' ? a.change.toLabel : r.to }));
        }
      } catch {
        setDone(t('pulse.applyFailed'));
      } finally { setBusy(false); }
    };
  } else {
    title = t('allClearTip.connectorTitle', { name: tip.label });
    body = t('allClearTip.connectorBody');
    action = t('allClearTip.openConnections');
    act = () => { window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'Connections' } })); };
  }

  return (
    <section aria-label={title} style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={chip}><AgentAvatar id={MICHAEL_ID} name={godName} size={16} />{godName}</span>
        <span style={{ ...tag, ...(tip.kind === 'save' ? saveTag : ideaTag) }}>{t(tip.kind === 'save' ? 'allClearTip.save' : 'allClearTip.idea')}</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600, lineHeight: '19px', letterSpacing: '-0.01em', color: 'var(--cth-ink)' }}>{title}</div>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)' }}>{body}</p>
      {member && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--cth-ink-3)' }}>
          <AgentAvatar id={member} name={nameOf(member)} size={14} />{nameOf(member)}
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <PixelButton variant="secondary" size="sm" onClick={notNow} disabled={busy}>{t('pulse.notNow')}</PixelButton>
        <PixelButton variant="primary" size="sm" onClick={() => void act()} disabled={busy}>{action}</PixelButton>
      </div>
    </section>
  );
}

const card: CSSProperties = {
  position: 'relative', flexShrink: 0, padding: '13px 14px', borderRadius: 'var(--cth-r-xl)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line), 0 1px 2px rgba(30, 27, 46, .04), 0 4px 12px rgba(62, 52, 140, .06)'
};
const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px 0 3px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-2)'
};
const tag: CSSProperties = { fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 'var(--cth-r-pill)' };
const saveTag: CSSProperties = { background: 'var(--cth-green-soft)', color: 'var(--cth-green-text)' };
const ideaTag: CSSProperties = { background: 'var(--cth-indigo-soft)', color: 'var(--cth-indigo-text)' };
const todayTag: CSSProperties = { background: 'var(--cth-neutral-soft)', color: 'var(--cth-ink-2)' };
const linkButton: CSSProperties = {
  padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--cth-indigo-text)'
};
