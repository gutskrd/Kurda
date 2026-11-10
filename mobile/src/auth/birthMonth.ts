/**
 * The birth month question's words on the phone: the twelve month names, and
 * why an answer stopped at age. How old somebody is and the year that comes
 * to are the ruler's arithmetic (auth/guide/age.ts); the rules are the
 * server's (@kurda/shared `age`).
 */
import type { TranslationKey } from '../i18n/translations';

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
 * Why an answer stopped at age, remembered for as long as the app is open:
 * 'refused' when sign-up made no account, 'closed' when the one-time question
 * closed an existing one. The explanation stays rather than handing back a
 * form that invites a different year.
 */
export type AgeStopKind = 'refused' | 'closed';
