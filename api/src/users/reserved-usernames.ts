/**
 * Reserved usernames (KUR-004 hardening). A single configurable list of names that
 * may not be claimed because they impersonate MyKurda, its staff/roles, or system
 * accounts. Centralised here (not scattered through the code) so it's easy to audit
 * and extend in one place.
 *
 * The check folds common visual-impersonation tricks — case, Kurdish diacritics,
 * underscores, and leet-speak confusables (adm1n → admin, my_kurda → mykurda) — so
 * a name that *reads* as a reserved one is also rejected.
 */

/** Base reserved set (lowercase, already fold-normalized where relevant). */
const BASE_RESERVED: readonly string[] = [
  // product / brand
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

/** Leet-speak / look-alike confusables → their base letter, for the fold. */
const CONFUSABLES: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '|': 'i', '!': 'i',
};

/**
 * Fold a name to its comparison form: lowercase, Kurdish diacritics → base letters,
 * confusables → base letters, and strip separators (`_`, `-`, `.`, spaces). Used for
 * the reserved check only — NOT for storage.
 */
export function foldForReserved(name: string): string {
  let out = '';
  for (const ch of name.toLowerCase().normalize('NFC')) {
    if (ch === '_' || ch === '-' || ch === '.' || ch === ' ') continue;
    const diacritic: Record<string, string> = { ê: 'e', î: 'i', û: 'u', ç: 'c', ş: 's' };
    out += CONFUSABLES[ch] ?? diacritic[ch] ?? ch;
  }
  return out;
}

/** The reserved set, stored in folded form (computed once). */
const RESERVED_FOLDED: ReadonlySet<string> = new Set(BASE_RESERVED.map(foldForReserved));

/** True if `username` (any form) folds to a reserved name. */
export function isReservedUsername(username: string): boolean {
  return RESERVED_FOLDED.has(foldForReserved(username));
}
