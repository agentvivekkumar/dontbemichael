import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatWorkStyleDraft, parseWorkStyleDraft, type WorkStyleDraft } from '@shared/agentProfile';
import { Icon } from './Icon';
import { PixelButton } from './PixelButton';

/**
 * The work style as a list (Edit agent): the job is one note, and each duty
 * or approval is its own line. Saving still hands the plain labels to the
 * rewrite, so the agent receives the same instructions as before.
 */
let lineSeq = 0;
const nextLineId = (): string => `ws-${++lineSeq}`;
const lineIds = (n: number): string[] => Array.from({ length: n }, () => nextLineId());

export function WorkStyleList({ value, onChange, invalid }: {
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
}) {
  const { t } = useTranslation();
  const initial = parseWorkStyleDraft(value);
  const [draft, setDraft] = useState(initial);
  const [lineKeys, setLineKeys] = useState(() => ({ does: lineIds(initial.does.length), asks: lineIds(initial.asksFirst.length) }));
  // The last text this list handed the parent. A rewrite from outside (the
  // quick plain text, then the model's) is the only value that replaces the list.
  const emitted = useRef(formatWorkStyleDraft(initial));

  useEffect(() => {
    if (value === emitted.current) return;
    const next = parseWorkStyleDraft(value);
    emitted.current = formatWorkStyleDraft(next);
    setDraft(next);
    setLineKeys({ does: lineIds(next.does.length), asks: lineIds(next.asksFirst.length) });
  }, [value]);

  const edit = (next: WorkStyleDraft, keys?: Partial<{ does: string[]; asks: string[] }>): void => {
    setDraft(next);
    if (keys) setLineKeys((cur) => ({ ...cur, ...keys }));
    const formatted = formatWorkStyleDraft(next);
    emitted.current = formatted;
    onChange(formatted);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 320, overflowY: 'auto',
      padding: '10px 10px 12px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-paper-100)',
      boxShadow: invalid ? 'inset 0 0 0 1.5px var(--cth-coral)' : 'inset 0 0 0 1px var(--cth-line-2)'
    }}>
      <Part label={t('editAgent.jobLabel')}>
        <textarea
          dir="auto"
          value={draft.job}
          rows={3}
          placeholder={t('editAgent.jobPlaceholder')}
          aria-label={t('editAgent.jobLabel')}
          aria-invalid={invalid ? true : undefined}
          className="cth-input"
          onChange={(e) => edit({ ...draft, job: e.target.value })}
          style={fieldStyle}
        />
      </Part>
      <DutyList
        label={t('editAgent.doesLabel')}
        placeholder={t('editAgent.linePlaceholder')}
        keys={lineKeys.does}
        items={draft.does}
        invalid={invalid}
        onChange={(does, doesKeys) => edit({ ...draft, does }, { does: doesKeys })}
      />
      <DutyList
        label={t('editAgent.asksLabel')}
        placeholder={t('editAgent.askPlaceholder')}
        keys={lineKeys.asks}
        items={draft.asksFirst}
        invalid={invalid}
        onChange={(asksFirst, asksKeys) => edit({ ...draft, asksFirst }, { asks: asksKeys })}
      />
    </div>
  );
}

function DutyList({ label, placeholder, keys, items, invalid, onChange }: {
  label: string;
  placeholder: string;
  keys: string[];
  items: string[];
  invalid?: boolean;
  onChange: (items: string[], keys: string[]) => void;
}) {
  const { t } = useTranslation();
  const setAt = (i: number, text: string) => onChange(items.map((line, j) => (j === i ? text : line)), keys);
  return (
    <Part label={label}>
      {items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((line, i) => (
            <li key={keys[i]} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                dir="auto"
                value={line}
                placeholder={placeholder}
                aria-label={t('editAgent.lineLabel', { label, n: i + 1 })}
                aria-invalid={invalid ? true : undefined}
                className="cth-input"
                onChange={(e) => setAt(i, e.target.value)}
                style={{ ...fieldStyle, flex: 1, minHeight: 34 }}
              />
              <button
                type="button"
                aria-label={t('editAgent.removeLine', { label, n: i + 1 })}
                onClick={() => onChange(items.filter((_, j) => j !== i), keys.filter((_, j) => j !== i))}
                style={removeStyle}
              >
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <PixelButton variant="ghost" size="sm" onClick={() => onChange([...items, ''], [...keys, nextLineId()])} style={{ alignSelf: 'flex-start' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="plus" />{t('editAgent.addLine')}
        </span>
      </PixelButton>
    </Part>
  );
}

function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cth-ink-2)' }}>{label}</span>
      {children}
    </div>
  );
}

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '7px 10px',
  background: 'var(--cth-card)',
  border: 'none',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 13,
  lineHeight: '18px',
  color: 'var(--cth-ink)',
  outline: 'none',
  resize: 'vertical' as const
};

const removeStyle = {
  flexShrink: 0,
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 'var(--cth-r-md)',
  background: 'transparent',
  color: 'var(--cth-ink-500)',
  cursor: 'pointer',
  padding: 0
};
