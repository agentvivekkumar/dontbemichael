import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrialReport, TrialScenario } from '@shared/trialShift/types';
import { Dialog } from '@/shell/Dialog';
import { PixelButton } from '../PixelButton';
import { Icon } from '../Icon';
import { TrialReportCard } from './TrialReportCard';
import type { Agent } from '@/store/store';
import { splitAgentRole } from '@shared/agentRole';

export interface TrialShiftModalProps {
  agent: Agent;
  onClose: () => void;
  initialScenarioId?: string;
}

export function TrialShiftModal({ agent, onClose, initialScenarioId }: TrialShiftModalProps) {
  const { t } = useTranslation();
  const [scenarios, setScenarios] = useState<TrialScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(initialScenarioId ?? '');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TrialReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.cth
      .trialShiftListScenarios()
      .then((list) => {
        if (!alive) return;
        setScenarios(list);
        if (!selectedScenarioId && list.length > 0) {
          setSelectedScenarioId(list[0].id);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setError(String(err));
      });
    return () => {
      alive = false;
    };
  }, [selectedScenarioId]);

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0];

  const onStartTrial = async () => {
    if (!selectedScenario) return;
    setRunning(true);
    setError(null);
    try {
      const parsedRole = splitAgentRole(agent.description);
      const rep = await window.cth.trialShiftRun(selectedScenario.id, {
        id: agent.id,
        name: agent.name,
        role: parsedRole.role || agent.name,
        summary: parsedRole.roleDescription,
        does: [],
        wontDo: [],
        workStyle: agent.goal,
        command: agent.command,
        provider: agent.provider,
        model: agent.model
      });
      setReport(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const dialogTitle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name="gear" />
      <span>
        {t('trialShift.dialogTitle', 'Employee Trial Shift')}: {agent.name}
      </span>
    </div>
  );

  return (
    <Dialog title={dialogTitle} onClose={onClose} width={620} busy={running}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--cth-coral-soft)',
              color: 'var(--cth-coral-text)',
              fontSize: 12,
              borderRadius: 6
            }}
          >
            {error}
          </div>
        )}

        {report ? (
          <TrialReportCard
            report={report}
            onRetest={() => setReport(null)}
            onClose={onClose}
          />
        ) : running ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16
            }}
          >
            <div style={{ fontSize: 28, animation: 'spin 2s linear infinite' }}>&#9696;</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--cth-ink)' }}>
              {t('trialShift.evaluating', 'Running trial shift in safe sandbox...')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--cth-ink-3)', maxWidth: 420 }}>
              {t(
                'trialShift.evaluatingDetail',
                'Simulating customer interactions and testing employee responses against company policy.'
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--cth-ink-2)', lineHeight: 1.5 }}>
              {t(
                'trialShift.intro',
                'Test this employee against a simulated business situation before letting them work with real customers and systems.'
              )}
            </div>

            {/* Scenario picker grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cth-ink)' }}>
                {t('trialShift.chooseScenario', 'Choose a test scenario')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {scenarios.map((s) => {
                  const isSelected = s.id === selectedScenario?.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedScenarioId(s.id)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: isSelected ? '2px solid var(--cth-ink)' : '1px solid var(--cth-hairline)',
                        background: isSelected ? 'var(--cth-neutral-soft)' : 'var(--cth-card-bg)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--cth-ink)' }}>
                          {s.name}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            textTransform: 'uppercase',
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: 'var(--cth-card-bg)',
                            color: 'var(--cth-ink-3)',
                            border: '1px solid var(--cth-hairline)'
                          }}
                        >
                          {s.industry}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--cth-ink-3)', lineHeight: 1.4 }}>
                        {s.summary}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected scenario preview */}
            {selectedScenario && (
              <div
                style={{
                  padding: 14,
                  background: 'var(--cth-neutral-soft)',
                  borderRadius: 8,
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--cth-ink)' }}>
                    {t('trialShift.customerPrompt', 'Incoming request')}:{' '}
                  </span>
                  <span style={{ fontStyle: 'italic', color: 'var(--cth-ink-2)' }}>
                    "{selectedScenario.prompt}"
                  </span>
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--cth-ink)' }}>
                    {t('trialShift.toolsAllowed', 'Simulated tools available')}:{' '}
                  </span>
                  <span style={{ color: 'var(--cth-ink-3)' }}>
                    {selectedScenario.simulatedTools.map((t) => t.name).join(', ')}
                  </span>
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--cth-ink)' }}>
                    {t('trialShift.fictionalDocs', 'Sandbox documents')}:{' '}
                  </span>
                  <span style={{ color: 'var(--cth-ink-3)' }}>
                    {selectedScenario.documents.map((d) => d.title).join(', ')}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <PixelButton variant="secondary" onClick={onClose}>
                {t('common.cancel', 'Cancel')}
              </PixelButton>
              <PixelButton variant="primary" onClick={onStartTrial} disabled={!selectedScenario}>
                {t('trialShift.runButton', 'Start Trial Shift')}
              </PixelButton>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
