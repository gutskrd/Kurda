import { USERNAME_MAX, USERNAME_MIN, refusedChars, type UsernameReason } from '@kurda/shared';
import type { Translate } from '../i18n/I18nProvider';

/**
 * A refused username in the reader's words, one sentence per rule of shared/src/username.ts, whether the field or the
 * server (`INVALID_USERNAME`) found it. Disallowed characters are named, spaces as spaces; an unknown reason gets the
 * whole rule.
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

/** What a username may contain, shown under the field. */
export function usernameRuleText(t: Translate): string {
  return t('auth.usernameRule', { min: USERNAME_MIN, max: USERNAME_MAX });
}
