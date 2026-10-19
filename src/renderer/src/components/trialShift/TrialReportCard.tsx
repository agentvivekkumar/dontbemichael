import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrialReport } from '@shared/trialShift/types';
import { PixelBadge } from '../PixelBadge';
import { PixelButton } from '../PixelButton';

export interface TrialReportCardProps {
  report: TrialReport;
  onRetest?: () => void;
  onClose?: () => void;
}

export function TrialReportCard({ report, onRetest, onClose }: TrialReportCardProps) {
  const { t } = useTranslation();
  const [showTools, setShowTools] = useState(false);

  const badgeStatus =
    report.status === 'passed'
      ? 'success'
      : report.status === 'needs_attention'
        ? 'looping'
        : 'blocked';

  const statusLabel =
    report.status === 'passed'
      ? t('trialShift.passedAll', 'Passed all checks')
      : report.status === 'needs_attention'
        ? t('trialShift.needsAttention', 'Needs attention')
        : t('trialShift.failedChecks', 'Failed critical checks');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header status bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--cth-neutral-soft)',
          borderRadius: 8
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cth-ink)' }}>
            {report.scenarioName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cth-ink-3)', marginTop: 2 }}>
            {report.agentName} &bull; {(report.durationMs / 1000).toFixed(1)}s
          </div>
        </div>
        <PixelBadge status={badgeStatus} label={statusLabel} />
      </div>

      {/* Summary message */}
      <div
        style={{
          padding: '12px 14px',
          background: 'var(--cth-card-bg)',
          border: '1px solid var(--cth-hairline)',
          borderRadius: 6,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--cth-ink-2)'
        }}
      >
        {report.summary}
      </div>

      {/* Evaluation results checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cth-ink)' }}>
          {t('trialShift.evidenceBreakdown', 'Evidence checklist')}
        </div>
        {report.results.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 6,
              background: item.passed ? 'var(--cth-card-bg)' : 'var(--cth-neutral-soft)',
              border: item.passed ? '1px solid var(--cth-hairline)' : '1px solid var(--cth-amber)',
              fontSize: 12
            }}
          >
            <div style={{ marginTop: 2 }}>
              {item.passed ? (
                <span style={{ color: 'var(--cth-green-text)', fontWeight: 700 }}>&#10003;</span>
              ) : item.severity === 'critical' ? (
                <span style={{ color: 'var(--cth-coral-text)', fontWeight: 700 }}>&#10007;</span>
              ) : (
                <span style={{ color: 'var(--cth-amber-text)', fontWeight: 700 }}>!</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--cth-ink)' }}>{item.title}</span>
                <span
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: 'var(--cth-neutral-soft)',
                    color: 'var(--cth-ink-3)'
                  }}
                >
                  {item.category}
                </span>
              </div>
              <div style={{ color: 'var(--cth-ink-3)', marginTop: 4 }}>
                {item.evidence}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Simulated tool activity */}
      <div>
        <button
          type="button"
          onClick={() => setShowTools(!showTools)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--cth-ink-2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span style={{ fontSize: 10 }}>{showTools ? '▼' : '▶'}</span>
          <span>
            {t('trialShift.toolActivity', 'Simulated tool calls')} ({report.toolCalls.length})
          </span>
        </button>

        {showTools && (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              background: 'var(--cth-neutral-soft)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'monospace',
              maxHeight: 180,
              overflowY: 'auto'
            }}
          >
            {report.toolCalls.length === 0 ? (
              <div style={{ color: 'var(--cth-ink-3)' }}>
                {t('trialShift.noToolsCalled', 'No simulated tools were called.')}
              </div>
            ) : (
              report.toolCalls.map((tc, idx) => (
                <div key={idx} style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px dashed var(--cth-hairline)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--cth-blue-text)' }}>
                    &rarr; {tc.toolName}
                  </div>
                  <div style={{ color: 'var(--cth-ink-3)', margin: '2px 0' }}>
                    args: {JSON.stringify(tc.arguments)}
                  </div>
                  <div style={{ color: 'var(--cth-ink-2)' }}>
                    result: {JSON.stringify(tc.output)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--cth-card-bg)',
            border: '1px solid var(--cth-hairline)',
            borderRadius: 6
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cth-ink)', marginBottom: 6 }}>
            {t('trialShift.recommendations', 'Tips for the owner')}
          </div>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12, color: 'var(--cth-ink-3)' }}>
            {report.recommendations.map((rec, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        {onRetest && (
          <PixelButton variant="secondary" onClick={onRetest}>
            {t('trialShift.testAnother', 'Test another scenario')}
          </PixelButton>
        )}
        {onClose && (
          <PixelButton variant="primary" onClick={onClose}>
            {t('trialShift.done', 'Done')}
          </PixelButton>
        )}
      </div>
    </div>
  );
}
