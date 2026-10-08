/**
 * The birth month question, as the phone asks it — the same question the
 * browser asks, with the same rules (@kurda/shared `age`).
 *
 * Pure, so the parts that decide what is sent can be tested without a screen.
 */
import { birthYearChoices } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

/** What the two pickers hold: null until something is chosen. */
export interface BirthMonthValue {
  month: number | null;
  year: number | null;
}

/** Nothing chosen. There is no default, so nothing hints at an answer. */
export const EMPTY_BIRTH_MONTH: BirthMonthValue = { month: null, year: null };

/** What the API takes, or null while either half is unchosen. */
export function birthMonthOf(value: BirthMonthValue): { birthYear: number; birthMonth: number } | null {
  const { month, year } = value;
  if (month === null || year === null) return null;
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) return null;
  return { birthYear: year, birthMonth: month };
}

/**
 * Month names come from the catalogue rather than `Intl`: phones without
 * Kurdish locale data would otherwise show English months in a Kurdish form.
 */
export const MONTH_KEYS: readonly TranslationKey[] = [
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
 * Every year from this one back to 1900, newest first — the ones too young
 * for an account as well, because leaving them out would say which to pick.
 */
export function yearChoices(now: Date = new Date()): number[] {
  return birthYearChoices(now);
}

/**
 * Why an answer stopped at age, remembered for as long as the app is open:
 * 'refused' when sign-up made no account, 'closed' when the one-time question
 * closed an existing one. The explanation stays rather than handing back a
 * form that invites a different year.
 */
export type AgeStopKind = 'refused' | 'closed';
