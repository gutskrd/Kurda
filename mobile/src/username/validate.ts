import type { TranslationKey } from '../i18n/translations';
import { normalizeKurdish } from '@kurda/shared';

/**
 * Client-side username validation for instant feedback (KUR-004). Mirrors the
 * backend's *structural* rules so the user sees problems as they type — but the
 * server re-validates and is the authority for reserved names, availability, and
 * the change cooldown (those come back as API errors, not checked here).
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

export type UsernameIssue =
  | 'too-short'
  | 'too-long'
  | 'invalid-chars'
  | 'edge-underscore'
  | 'consecutive-underscore'
  | 'numbers-only'
  | 'no-letter';

export type UsernameCheck =
  | { ok: true; value: string }
  /** `message` is a catalogue key; interpolate it with USERNAME_RULE_VARS. */
  | { ok: false; issue: UsernameIssue; message: TranslationKey };

const CHARSET = /^[A-Za-z0-9_êîûçşÊÎÛÇŞ]+$/;
const HAS_LETTER = /[A-Za-zêîûçşÊÎÛÇŞ]/;
const ONLY_DIGITS = /^[0-9]+$/;

/**
 * Why a username was refused, as catalogue keys.
 *
 * The two length rules carry the limits as `{min}`/`{max}` rather than being
 * built with a template: a sentence assembled around a number reads in English
 * and in nothing else, and the limits are this module's to supply.
 */
const MESSAGE: Record<UsernameIssue, TranslationKey> = {
  'too-short': 'username.rule.tooShort',
  'too-long': 'username.rule.tooLong',
  'invalid-chars': 'username.rule.invalidChars',
  'edge-underscore': 'username.rule.edgeUnderscore',
  'consecutive-underscore': 'username.rule.consecutiveUnderscore',
  'numbers-only': 'username.rule.numbersOnly',
  'no-letter': 'username.rule.noLetter',
};

/** The values the length rules interpolate, so a caller never invents them. */
export const USERNAME_RULE_VARS = { min: USERNAME_MIN, max: USERNAME_MAX } as const;

const fail = (issue: UsernameIssue): UsernameCheck => ({ ok: false, issue, message: MESSAGE[issue] });

/** Structural check + NFC-normalised value (same order as the server). */
export function checkUsername(raw: string): UsernameCheck {
  const v = normalizeKurdish(String(raw ?? '')).trim();
  if (v.length < USERNAME_MIN) return fail('too-short');
  if (v.length > USERNAME_MAX) return fail('too-long');
  if (!CHARSET.test(v)) return fail('invalid-chars');
  if (v.startsWith('_') || v.endsWith('_')) return fail('edge-underscore');
  if (v.includes('__')) return fail('consecutive-underscore');
  if (ONLY_DIGITS.test(v)) return fail('numbers-only');
  if (!HAS_LETTER.test(v)) return fail('no-letter');
  return { ok: true, value: v };
}
