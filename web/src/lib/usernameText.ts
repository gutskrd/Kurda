import { USERNAME_MAX, USERNAME_MIN, refusedChars, type UsernameReason } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * A username turned down, in the reader's words: one sentence per rule of
 * shared/src/username.ts, the same whether the field's own check found it or
 * the server did (`INVALID_USERNAME`, whose details carry the reason and, for
 * a character that is not allowed, the characters).
 *
 * A character that is not allowed is named ("“!” can’t be in a username"),
 * and spaces said as spaces, rather than only being told something cannot be
 * in it. A reason this page does not know (a newer server) gets the rule as a
 * whole.
 */
export function usernameRefusalText(reason: UsernameReason | string, chars: unknown, t: Translate): string {
  switch (reason) {
    case 'invalid-chars': {
      const list = Array.isArray(chars) ? chars.filter((c): c is string => typeof c === 'string') : [];
      const { visible, unseen } = refusedChars(list);
      if (visible.length > 0) return t('error.code.usernameCharNotAllowed', { chars: visible.join(' ') });
      return t(unseen ? 'error.code.usernameSpaces' : 'error.code.usernameChars');
    }
    case 'too-short':
      return t('error.code.usernameTooShort', { count: USERNAME_MIN });
    case 'too-long':
      return t('error.code.usernameTooLong', { count: USERNAME_MAX });
    case 'edge-punctuation':
      return t('error.code.usernameEdge');
    case 'double-punctuation':
      return t('error.code.usernameSideBySide');
    case 'numbers-only':
    case 'no-letter':
      return t('error.code.usernameLetter');
    case 'reserved':
      return t('error.code.usernameUnavailable');
    default:
      return t('error.code.usernameChars');
  }
}

/** What a username may be made of, said under the field before anything is typed. */
export function usernameRuleText(t: Translate): string {
  return t('auth.usernameRule', { min: USERNAME_MIN, max: USERNAME_MAX });
}
