/**
 * Usernames: what one may contain, how typed text becomes one, and how a name is read back out of text. The server
 * (api/src/users/username.ts) and both apps check with this one rule, so all refuse the same names for the same reasons;
 * the database CHECK holds what it can express.
 *
 * A username is 3 to 30 of a–z, ç ê î ş û, digits, `_` and `.` (never first, last or side by side, which would make one
 * name easy to pass off as another), with at least one letter and not a reserved name (RESERVED_NAMES). Typed text is
 * only NFC-normalised, trimmed and lowercased (a Turkish İ to a plain i); anything else outside the set is refused, never
 * dropped, and the refusal names the characters.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** The Kurdish letters a username may have beside a–z, in key-row order. */
export const USERNAME_KURDISH_LETTERS = ['ç', 'ê', 'î', 'ş', 'û'] as const;

/** Why a name cannot be a username; `checkUsername` fixes the order the rules are checked in. */
export type UsernameReason =
  | 'invalid-chars'
  | 'too-long'
  | 'edge-punctuation'
  | 'double-punctuation'
  | 'too-short'
  | 'numbers-only'
  | 'no-letter'
  | 'reserved';

/** A refused name: the rule it broke and, for disallowed characters, which ones (each once, in typed order). */
export type UsernameRefusal =
  | { ok: false; reason: 'invalid-chars'; chars: string[] }
  | { ok: false; reason: Exclude<UsernameReason, 'invalid-chars'> };

export type UsernameCheck = { ok: true; value: string } | UsernameRefusal;

const ALLOWED = /^[a-z0-9_.çêîşû]$/;
const LETTER = /[a-zçêîşû]/;
const ONLY_DIGITS = /^[0-9]+$/;
const PUNCTUATION = /[._]/;
const SIDE_BY_SIDE = /[._]{2}/;
const CAPITAL_DOTTED_I = /İ/g;

/** Lowercase as a username is: Ê to ê as much as A to a, and İ to a plain i. */
function lower(text: string): string {
  return text.normalize('NFC').replace(CAPITAL_DOTTED_I, 'i').toLowerCase().normalize('NFC');
}

/** Typed text as the username it stands for: NFC, trimmed, lowercase, nothing else changed. */
export function normalizeUsername(raw: unknown): string {
  return lower(String(raw ?? '').normalize('NFC').trim());
}

/**
 * A username field's text while typing: lowercased with the caret kept in place. Nothing is trimmed or removed, so a space
 * or a disallowed character stays for the form to explain. Returns where `caret` belongs in the new text, which differs
 * in length only when NFC joins a letter and its mark.
 */
export function lowercaseAsTyped(text: string, caret: number = text.length): { text: string; caret: number } {
  const at = Math.max(0, Math.min(caret, text.length));
  return { text: lower(text), caret: lower(text.slice(0, at)).length };
}

/** Whitespace, or a character nobody can see (a zero-width space, a control character). */
const UNSEEN = /^[\s\p{Z}\p{C}]$/u;
/** A mark NFC found no letter to join, such as a circumflex after an x. */
const LONE_MARK = /^\p{M}$/u;

/**
 * A refusal's characters as a form shows them: the visible ones, each once and at most `limit`, and whether there were
 * spaces or invisible ones too ("“!” can’t be in a username", "a username can’t have spaces"). A lone accent is shown on a
 * dotted circle, as type sets a mark without a letter.
 */
export function refusedChars(chars: readonly string[], limit = 3): { visible: string[]; unseen: boolean } {
  const visible = chars.filter((ch) => !UNSEEN.test(ch)).map((ch) => (LONE_MARK.test(ch) ? `◌${ch}` : ch));
  return { visible: visible.slice(0, limit), unseen: visible.length < chars.length };
}

/**
 * Whether `raw` can be a username: the normalised name, or the first rule it breaks. The order is fixed so a name always
 * gets the same reason, putting first what more typing cannot mend (a disallowed character, too long, a leading or doubled
 * mark), then what it may (too short, a trailing mark, no letter yet), and the reserved names last.
 */
export function checkUsername(raw: unknown): UsernameCheck {
  const value = normalizeUsername(raw);
  const chars = [...new Set([...value].filter((ch) => !ALLOWED.test(ch)))];
  if (chars.length > 0) return { ok: false, reason: 'invalid-chars', chars };
  if (value.length > USERNAME_MAX) return { ok: false, reason: 'too-long' };
  if (PUNCTUATION.test(value.charAt(0))) return { ok: false, reason: 'edge-punctuation' };
  if (SIDE_BY_SIDE.test(value)) return { ok: false, reason: 'double-punctuation' };
  if (value.length < USERNAME_MIN) return { ok: false, reason: 'too-short' };
  if (PUNCTUATION.test(value.charAt(value.length - 1))) return { ok: false, reason: 'edge-punctuation' };
  if (ONLY_DIGITS.test(value)) return { ok: false, reason: 'numbers-only' };
  if (!LETTER.test(value)) return { ok: false, reason: 'no-letter' };
  if (isReservedUsername(value)) return { ok: false, reason: 'reserved' };
  return { ok: true, value };
}

/**
 * What a form says while a name is still being typed: the refusal, or null when only the next keys may fix it ("ha" is not
 * too short yet, "hamo." may become "hamo.k"). Those are said when the person is done; a disallowed character, a name too
 * long, or a leading or doubled mark is said at once.
 */
export function usernameProblemWhileTyping(raw: unknown): UsernameRefusal | null {
  const check = checkUsername(raw);
  if (check.ok) return null;
  switch (check.reason) {
    case 'too-short':
    case 'numbers-only':
    case 'no-letter':
      return null;
    case 'edge-punctuation':
      // The start was checked first, so reaching here with a clean start means only the end is open.
      return PUNCTUATION.test(normalizeUsername(raw).charAt(0)) ? check : null;
    default:
      return check;
  }
}

/** Whether two spellings are the same username, as "@Hamo" and "hamo" are. */
export function sameUsername(a: unknown, b: unknown): boolean {
  const x = normalizeUsername(handleName(String(a ?? '')));
  return x !== '' && x === normalizeUsername(handleName(String(b ?? '')));
}

// ───────────────────────────────────────────────────────────── names in text

/** The marks a sentence may end on, or a list continue after, right behind a handle. */
const SENTENCE_END = /[.,;:!?…]+$/u;

/**
 * The name a typed or pasted handle stands for: without a leading "@" or the punctuation ending the sentence after it
 * ("thanks @hamo." is hamo). A dot inside the name stays ("@hamo.k" is hamo.k); capitals are left to `normalizeUsername`.
 */
export function handleName(text: string): string {
  return String(text ?? '')
    .trim()
    .replace(/^@+/, '')
    .replace(SENTENCE_END, '')
    .trim();
}

// ───────────────────────────────────────────────────────────── names made for people

/** Letters other alphabets mark or join, as the plain letters a username can hold. */
const PLAIN_LETTER: Record<string, string> = { ı: 'i', ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', þ: 'th', ð: 'd' };

/**
 * A username made from someone's name or email prefix, for an account created by a sign-in through another service:
 * "Hamo Ali" is hamo_ali, "Şêrîn Özdemir" şêrîn_ozdemir, "hamo.ali" stays hamo.ali. Lowercased, other alphabets' marked
 * letters made plain, anything else between letters one underscore, cut to length. Null when the result cannot be a
 * username (another script, a reserved name), for the caller to fall back on.
 */
export function suggestUsername(from: string): string | null {
  let out = '';
  for (const ch of lower(String(from ?? '').trim())) {
    if (ALLOWED.test(ch)) out += ch;
    else {
      const plain = PLAIN_LETTER[ch] ?? ch.normalize('NFD').replace(/\p{M}/gu, '');
      out += /^[a-z0-9]+$/.test(plain) ? plain : '_';
    }
  }
  const tidy = (s: string): string => s.replace(/[._]{2,}/g, (run) => (run.includes('.') ? '.' : '_')).replace(/^[._]+|[._]+$/g, '');
  const name = tidy(tidy(out).slice(0, USERNAME_MAX));
  const check = checkUsername(name);
  return check.ok ? check.value : null;
}

/**
 * `base` with a number after it for when the name is taken: hamo_2, hamo_3. The base is cut to fit USERNAME_MAX and loses
 * a trailing mark, so two marks never meet. Migration 1751000540000_lowercase-usernames numbers names the same way.
 */
export function numberedUsername(base: string, n: number): string {
  const suffix = `_${n}`;
  return `${base.slice(0, USERNAME_MAX - suffix.length).replace(/[._]+$/, '')}${suffix}`;
}

// ───────────────────────────────────────────────────────────── reserved names

/** Names nobody may have because they would pass for Hevalo, its staff or roles, or the system; one list, audited in one place. */
const RESERVED_NAMES: readonly string[] = [
  // Product and brand.
  'hevalo', 'hevaloapp', 'heval',
  // The old name, so nobody can pose under a name people still recognise.
  'mykurda', 'kurda', 'mykurdaapp', 'kurdaapp', 'kurdi', 'kurdish',
  // Roles and staff.
  'admin', 'administrator', 'superadmin', 'sysadmin', 'moderator', 'mod', 'staff',
  'support', 'help', 'helpdesk', 'contact', 'team', 'official', 'founder', 'owner',
  'ceo', 'security', 'billing', 'payments', 'payment', 'noreply', 'no-reply',
  // System and generic.
  'system', 'root', 'api', 'bot', 'null', 'undefined', 'anonymous', 'anon', 'guest',
  'everyone', 'nobody', 'me', 'you', 'user', 'users', 'account', 'info', 'webmaster',
  'postmaster', 'abuse', 'legal', 'privacy', 'verify', 'verified',
];

/** Digits and signs read as the letters they look like, for the reserved check. */
const CONFUSABLES: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '|': 'i', '!': 'i',
};
const DIACRITIC: Record<string, string> = { ê: 'e', î: 'i', û: 'u', ç: 'c', ş: 's' };
const SEPARATORS = new Set(['_', '-', '.', ' ']);

/**
 * A name as it reads, for the reserved check only (never stored): lowercase, Kurdish letters as their base letters, digits
 * and signs as lookalike letters, separators removed, so ad.min, a_d_m_i_n and Adm1n all read as admin.
 */
export function foldForReserved(name: string): string {
  let out = '';
  for (const ch of lower(name)) {
    if (SEPARATORS.has(ch)) continue;
    out += CONFUSABLES[ch] ?? DIACRITIC[ch] ?? ch;
  }
  return out;
}

const RESERVED_FOLDED: ReadonlySet<string> = new Set(RESERVED_NAMES.map(foldForReserved));

/** Whether a name, however written, reads as a reserved one. */
export function isReservedUsername(name: string): boolean {
  return RESERVED_FOLDED.has(foldForReserved(name));
}
