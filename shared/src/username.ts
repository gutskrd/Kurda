/**
 * Usernames: what one may be made of, how what somebody typed becomes one,
 * and how a name is read back out of a sentence or a search box.
 *
 * There is one rule, and it is this module. The server checks every name it is
 * given with it (api/src/users/username.ts), and the browser and the phone check
 * with it as a name is typed, so the three refuse the same names for the same
 * reasons and say so in the same words. The database keeps the part of it that
 * can be written as a CHECK (migration 1751000540000_lowercase-usernames).
 *
 * A username is 3 to 30 of these, and nothing else:
 *
 * - the lowercase letters a–z, and the Kurdish ç ê î ş û;
 * - the digits 0–9;
 * - the underscore `_` and the dot `.`, never first or last, and never two of
 *   them side by side (`..`, `__`, `._` and `_.` all read as one mark mistyped,
 *   and make one name easy to pass off as another);
 *
 * with at least one letter in it, and not one of the names kept back because
 * they would pass for Hevalo, its staff or the system (RESERVED_NAMES).
 *
 * What was typed is normalised before it is judged, and only in these ways:
 *
 * - Unicode NFC, so an e followed by a combining circumflex is the one ê;
 * - the spaces around it are let go of (the ones inside it are not);
 * - capitals become lowercase letters, Ê Î Û Ç Ş as much as A–Z, so somebody
 *   who signed up as `hamo` and types `Hamo` is still `hamo`. The capital İ a
 *   Turkish keyboard types is lowercased to a plain i: JavaScript would make
 *   it i followed by a combining dot above, which is no letter of this set.
 *
 * Anything else outside the set is refused, never quietly dropped or swapped:
 * the refusal names the characters, so a form can say which one cannot be in
 * a username rather than only that something cannot.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** The Kurdish letters a username may have beside a–z, in the order a key row offers them. */
export const USERNAME_KURDISH_LETTERS = ['ç', 'ê', 'î', 'ş', 'û'] as const;

/** Why a name cannot be a username. The order the rules are checked in is `checkUsername`'s. */
export type UsernameReason =
  | 'invalid-chars'
  | 'too-long'
  | 'edge-punctuation'
  | 'double-punctuation'
  | 'too-short'
  | 'numbers-only'
  | 'no-letter'
  | 'reserved';

/** A name turned down: the rule it broke, and for a character not allowed, which ones (each once, in the order typed). */
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

/** Lowercase, the way a username is: Ê to ê as much as A to a, and İ to a plain i. */
function lower(text: string): string {
  return text.normalize('NFC').replace(CAPITAL_DOTTED_I, 'i').toLowerCase().normalize('NFC');
}

/** What was typed, as the username it stands for: NFC, trimmed, lowercase. Nothing else is changed. */
export function normalizeUsername(raw: unknown): string {
  return lower(String(raw ?? '').normalize('NFC').trim());
}

/**
 * A username field's text as it is being typed: lowercase as it goes, with
 * the caret kept where it was. Nothing is trimmed or taken out, so a space or a
 * character that is not allowed stays in the field for the form to say why.
 * `caret` is where the caret was in `text`; the answer says where it belongs
 * in the new text (the two lengths differ only when NFC joins a letter and its
 * mark).
 */
export function lowercaseAsTyped(text: string, caret: number = text.length): { text: string; caret: number } {
  const at = Math.max(0, Math.min(caret, text.length));
  return { text: lower(text), caret: lower(text.slice(0, at)).length };
}

/** Whitespace, or a character nobody can see (a zero-width space, a control character). */
const UNSEEN = /^[\s\p{Z}\p{C}]$/u;
/** A mark left over that NFC found no letter to join to, such as a circumflex after an x. */
const LONE_MARK = /^\p{M}$/u;

/**
 * The characters of a refusal as a form shows them: the ones that can be seen,
 * each once and at most `limit` of them, and whether there were spaces or
 * invisible ones too. A form says "“!” can’t be in a username" for the first and
 * "a username can’t have spaces" for the second. A lone accent is shown on a
 * dotted circle, the way type sets a mark with no letter under it.
 */
export function refusedChars(chars: readonly string[], limit = 3): { visible: string[]; unseen: boolean } {
  const visible = chars.filter((ch) => !UNSEEN.test(ch)).map((ch) => (LONE_MARK.test(ch) ? `◌${ch}` : ch));
  return { visible: visible.slice(0, limit), unseen: visible.length < chars.length };
}

/**
 * Whether `raw` can be a username, and if so which: the normalised name, or the
 * first rule it breaks. The order is fixed, so one name always gets the same
 * reason, and it puts first what more typing cannot mend: a character that is
 * not allowed, a name too long, a dot or underscore at the start or two side by
 * side. Then what typing on may still mend (too short, a mark at the end, no
 * letter yet), and last the reserved names.
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
 * What a form says about a name while it is still being typed: the refusal, or
 * null when the only thing wrong is something the next keys may put right.
 * "ha" is not too short yet, and "hamo." is on its way to "hamo.k"; both are
 * said when the person is done (on Continue, on leaving the field), not under
 * every key. A character that is not allowed, a name too long, or a mark at
 * the start or doubled, is said at once.
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
      // checked at the start first: reaching here with a clean start means only the end is open
      return PUNCTUATION.test(normalizeUsername(raw).charAt(0)) ? check : null;
    default:
      return check;
  }
}

/** Whether two ways of writing a name are the same username ("@Hamo" and "hamo" are). */
export function sameUsername(a: unknown, b: unknown): boolean {
  const x = normalizeUsername(handleName(String(a ?? '')));
  return x !== '' && x === normalizeUsername(handleName(String(b ?? '')));
}

// ───────────────────────────────────────────────────────────── names in text

/** The marks a sentence may end on, or a list go on after, right behind a handle. */
const SENTENCE_END = /[.,;:!?…]+$/u;

/**
 * The name a handle typed or pasted somewhere stands for: without the "@"
 * written before a username, and without the full stop, comma or other mark
 * that ends the sentence after it ("thanks @hamo." is about hamo). A dot inside
 * the name stays: "@hamo.k" is hamo.k. Capitals are left for
 * `normalizeUsername`, and anything else for the rules to judge.
 */
export function handleName(text: string): string {
  return String(text ?? '')
    .trim()
    .replace(/^@+/, '')
    .replace(SENTENCE_END, '')
    .trim();
}

/** One username written into a text as @name: who, and where the @name stands. */
export interface Mention {
  username: string;
  /** where the "@" is */
  start: number;
  /** just after the last character of the name */
  end: number;
}

/** An "@" and what may follow it; whether that is a username is `checkUsername`'s to say. */
const HANDLE = /@([\p{L}\p{N}_.]+)/gu;
/** What may not stand right before a mention's "@": part of a word, or of an email address. */
const PART_OF_A_WORD = /[\p{L}\p{N}_.@]/u;

/**
 * The usernames mentioned in a text, in order. A mention is an "@" at the
 * start or after something that is not part of a word, so an email address is
 * none; the name is what follows, less any dots or underscores it ends on,
 * since no username ends on one ("well done @hamo." mentions hamo, and the
 * full stop is the sentence's). Capitals are read as their lowercase letters,
 * and what is not a username by the rule is not a mention.
 */
export function findMentions(text: string): Mention[] {
  const found: Mention[] = [];
  for (const match of String(text ?? '').matchAll(HANDLE)) {
    const start = match.index;
    const before = start > 0 ? text.charAt(start - 1) : '';
    if (before !== '' && PART_OF_A_WORD.test(before)) continue;
    const written = match[1]!.replace(/[._]+$/, '');
    const check = checkUsername(written);
    if (!check.ok) continue;
    found.push({ username: check.value, start, end: start + 1 + written.length });
  }
  return found;
}

// ───────────────────────────────────────────────────────────── names made for people

/** Letters other alphabets put marks on or join, as the plain letters a username can hold. */
const PLAIN_LETTER: Record<string, string> = { ı: 'i', ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', þ: 'th', ð: 'd' };

/**
 * A username made from somebody's name or the start of their email address, for
 * an account a sign-in through another service creates: "Hamo Ali" is
 * hamo_ali, "Şêrîn Özdemir" is şêrîn_ozdemir, "hamo.ali" stays hamo.ali.
 * Lowercase first, the way every username is; a letter of another alphabet
 * with a mark on it gives its plain letter (ö is o); anything else between
 * the letters becomes one underscore; and it is cut to length. Null when what
 * is left cannot be a username (a name in another script, or a reserved one),
 * for the caller to fall back on a name of its own.
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
 * `base` with a number after it, for when the name itself is taken: hamo_2,
 * hamo_3. The base is cut so the whole stays within USERNAME_MAX, and loses a
 * dot or underscore it would then end on, so the result never has two marks
 * side by side. The database's own numbering (migration
 * 1751000540000_lowercase-usernames) writes them the same way.
 */
export function numberedUsername(base: string, n: number): string {
  const suffix = `_${n}`;
  return `${base.slice(0, USERNAME_MAX - suffix.length).replace(/[._]+$/, '')}${suffix}`;
}

// ───────────────────────────────────────────────────────────── reserved names

/**
 * The names nobody may have, because they would pass for Hevalo, its staff or
 * its roles, or for the system itself. One list, here, so it is audited in one
 * place, and the apps can say so as the name is typed.
 */
const RESERVED_NAMES: readonly string[] = [
  // product / brand
  'hevalo', 'hevaloapp', 'heval',
  // kept from the old name: a @mykurda now would be a stranger in a
  // name people still recognise
  'mykurda', 'kurda', 'mykurdaapp', 'kurdaapp', 'kurdi', 'kurdish',
  // roles / staff
  'admin', 'administrator', 'superadmin', 'sysadmin', 'moderator', 'mod', 'staff',
  'support', 'help', 'helpdesk', 'contact', 'team', 'official', 'founder', 'owner',
  'ceo', 'security', 'billing', 'payments', 'payment', 'noreply', 'no-reply',
  // system / generic
  'system', 'root', 'api', 'bot', 'null', 'undefined', 'anonymous', 'anon', 'guest',
  'everyone', 'nobody', 'me', 'you', 'user', 'users', 'account', 'info', 'webmaster',
  'postmaster', 'abuse', 'legal', 'privacy', 'verify', 'verified',
];

/** Digits and signs that are read as the letter they look like, for the fold. */
const CONFUSABLES: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '|': 'i', '!': 'i',
};
const DIACRITIC: Record<string, string> = { ê: 'e', î: 'i', û: 'u', ç: 'c', ş: 's' };
const SEPARATORS = new Set(['_', '-', '.', ' ']);

/**
 * A name as it reads, for the reserved check only (never for storage):
 * lowercase, the Kurdish letters as their base letters, digits and signs as the
 * letters they look like, and no separators at all. So ad.min, a_d_m_i_n, Adm1n
 * and my_kurda read as admin and mykurda: a name that differs from a reserved
 * one only by dots or underscores reads as that name, and is refused with it.
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

/** Whether a name, written any way at all, reads as a reserved one. */
export function isReservedUsername(name: string): boolean {
  return RESERVED_FOLDED.has(foldForReserved(name));
}
