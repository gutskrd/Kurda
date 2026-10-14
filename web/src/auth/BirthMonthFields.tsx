import { useId, useMemo } from 'react';
import { birthYearChoices } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** What the two selects hold: '' until something is chosen. */
export interface BirthMonthValue {
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
 * Birth month and year, asked the neutral way.
 *
 * Both start empty, with no default to accept and no year pre-chosen, and every
 * year back to 1900 is listed — the young ones too — so nothing on the form
 * hints at which answer gets you in or gets you more. The month names are in
 * the catalogue rather than from `Intl`, because browsers that ship without
 * Kurdish locale data would otherwise show English months in a Kurdish form.
 */
export function BirthMonthFields({
  value,
  onChange,
  disabled,
}: {
  value: BirthMonthValue;
  onChange: (next: BirthMonthValue) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const t = useT();
  const id = useId();
  const years = useMemo(() => birthYearChoices(), []);

  return (
    <fieldset className="field birth-month" disabled={disabled}>
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
    </fieldset>
  );
}
