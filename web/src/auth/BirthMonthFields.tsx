import { useId, useMemo } from 'react';
import { birthYearChoices } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** What the two selects hold: '' until something is chosen. */
interface BirthMonthValue {
  month: string;
  year: string;
}

export const EMPTY_BIRTH_MONTH: BirthMonthValue = { month: '', year: '' };

/** The chosen month and year as numbers, or null while either is unchosen. */
export function birthMonthOf(value: BirthMonthValue): { birthYear: number; birthMonth: number } | null {
  const birthYear = Number(value.year);
  const birthMonth = Number(value.month);
  if (!value.year || !value.month || !Number.isInteger(birthYear) || !Number.isInteger(birthMonth)) return null;
  return { birthYear, birthMonth };
}

const MONTH_KEY: readonly MessageKey[] = [
  'age.month.1',
  'age.month.2',
  'age.month.3',
  'age.month.4',
  'age.month.5',
  'age.month.6',
  'age.month.7',
  'age.month.8',
  'age.month.9',
  'age.month.10',
  'age.month.11',
  'age.month.12',
];

/**
 * Birth month and year, asked neutrally: both start empty and every year back to 1900 is listed, so nothing hints at
 * which answer gets in. Month names come from the catalogue rather than `Intl`, which lacks Kurdish in some browsers.
 */
export function BirthMonthFields({
  value,
  onChange,
  disabled,
  problem = null,
  className = 'field birth-month',
}: {
  value: BirthMonthValue;
  onChange: (next: BirthMonthValue) => void;
  disabled?: boolean;
  /** What is wrong with the answer, shown under both selects. */
  problem?: string | null;
  /** The wrapper's classes, when a form marks it (auth/fieldProblem.ts). */
  className?: string;
}): React.JSX.Element {
  const t = useT();
  const id = useId();
  const years = useMemo(() => birthYearChoices(), []);

  return (
    <fieldset className={className} disabled={disabled} aria-describedby={problem ? `${id}-error` : undefined}>
      <legend className="field-label">{t('age.label')}</legend>
      <div className="birth-month-row">
        <label className="sr-only" htmlFor={`${id}-month`}>
          {t('age.month')}
        </label>
        <select
          id={`${id}-month`}
          className="input"
          value={value.month}
          required
          onChange={(e) => onChange({ ...value, month: e.target.value })}
        >
          <option value="" disabled>
            {t('age.month')}
          </option>
          {MONTH_KEY.map((key, i) => (
            <option key={key} value={String(i + 1)}>
              {t(key)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${id}-year`}>
          {t('age.year')}
        </label>
        <select
          id={`${id}-year`}
          className="input"
          value={value.year}
          required
          onChange={(e) => onChange({ ...value, year: e.target.value })}
        >
          <option value="" disabled>
            {t('age.year')}
          </option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <span className="field-hint">{t('age.help')}</span>
      {problem && (
        <span className="field-problem" id={`${id}-error`} role="alert">
          {problem}
        </span>
      )}
    </fieldset>
  );
}
