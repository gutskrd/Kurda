/**
 * The birth month question's words on the phone: the twelve month names, and why an answer stopped at age. The age
 * arithmetic is auth/guide/age.ts; the rules are the server's (@kurda/shared `age`).
 */
import type { TranslationKey } from '../i18n/translations';

/**
 * Month names come from the catalogue rather than `Intl`: phones without Kurdish locale data would show English months.
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

/** A birth month as it is read ("March 2008"), the month named from the catalogue. */
export function birthMonthLabel(t: (key: TranslationKey) => string, year: number, month: number): string {
  return `${t(MONTH_KEYS[month - 1]!)} ${year}`;
}

/**
 * Why an answer stopped at age, kept while the app is open: 'refused' when sign-up made no account, 'closed' when the
 * one-time question closed an existing one.
 */
export type AgeStopKind = 'refused' | 'closed';
