import type { TranslationKey } from '../i18n/translations';
import {
  USERNAME_MAX,
  USERNAME_MIN,
  checkUsername as checkRule,
  refusedChars,
  usernameProblemWhileTyping,
  type UsernameReason,
  type UsernameRefusal,
} from '@kurda/shared';

/**
 * The username rule on the phone, in the reader's words.
 *
 * The rule itself is shared/src/username.ts, the one the server checks with:
 * lowercase letters with ç ê î ş û, digits, dots and underscores, 3 to 30 of
 * them, and so on. What is here is what the phone says about a name, one
 * sentence per rule, whether its own check found the problem as the name was
 * typed or the server did (`INVALID_USERNAME`, api/errors.ts). The server is
 * still the one that knows which names are taken, and the wait between
 * changes.
 */
export { USERNAME_MAX, USERNAME_MIN };

/** The values the length rules and the hint interpolate, so a caller never invents them. */
export const USERNAME_RULE_VARS = { min: USERNAME_MIN, max: USERNAME_MAX } as const;

/** Why a name was refused, as a catalogue key and what it interpolates. */
export interface UsernameMessage {
  message: TranslationKey;
  vars: Record<string, string | number>;
}

export type UsernameCheck = { ok: true; value: string } | ({ ok: false; issue: UsernameReason } & UsernameMessage);

/**
 * The sentence for a rule a name broke, from its reason and, for a character
 * that is not allowed, which ones. The characters are named ("“!” can’t be in
 * a username") and spaces said as spaces; a reason the phone does not know (a
 * newer server) gets the rule as a whole.
 */
export function usernameMessage(reason: string, chars?: unknown): UsernameMessage {
  const vars = { ...USERNAME_RULE_VARS };
  switch (reason) {
    case 'invalid-chars': {
      const list = Array.isArray(chars) ? chars.filter((c): c is string => typeof c === 'string') : [];
      const { visible, unseen } = refusedChars(list);
      if (visible.length > 0) return { message: 'username.rule.charNotAllowed', vars: { ...vars, chars: visible.join(' ') } };
      return { message: unseen ? 'username.rule.spaces' : 'username.rule.invalidChars', vars };
    }
    case 'too-short':
      return { message: 'username.rule.tooShort', vars };
    case 'too-long':
      return { message: 'username.rule.tooLong', vars };
    case 'edge-punctuation':
      return { message: 'username.rule.edge', vars };
    case 'double-punctuation':
      return { message: 'username.rule.sideBySide', vars };
    case 'numbers-only':
      return { message: 'username.rule.numbersOnly', vars };
    case 'no-letter':
      return { message: 'username.rule.noLetter', vars };
    case 'reserved':
      return { message: 'error.code.usernameUnavailable', vars };
    default:
      return { message: 'username.rule.invalidChars', vars };
  }
}

const refused = (refusal: UsernameRefusal): UsernameCheck => ({
  ok: false,
  issue: refusal.reason,
  ...usernameMessage(refusal.reason, refusal.reason === 'invalid-chars' ? refusal.chars : undefined),
});

/** The whole rule, and the name as it is sent: NFC, trimmed, lowercase. */
export function checkUsername(raw: string): UsernameCheck {
  const check = checkRule(raw);
  return check.ok ? check : refused(check);
}

/**
 * What is said about a name while it is still being typed: only what more
 * typing cannot mend (a character not allowed, a mark at the start or two
 * side by side, a name too long). "ha" and "hamo." are said once the person
 * is done, on Continue or Save.
 */
export function usernameIssueWhileTyping(raw: string): UsernameCheck | null {
  const problem = usernameProblemWhileTyping(raw);
  return problem ? refused(problem) : null;
}
