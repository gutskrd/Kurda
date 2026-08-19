# Username policy (KUR-004)

The rules and guarantees for usernames — registration and change. The source of
truth is `api/src/users/username.ts` (rules) + `reserved-usernames.ts` (reserved
list); this documents the decisions.

## Storage & normalization
- **Stored as `citext`** (case-insensitive text) in `users.username`, NFC-normalized
  on input (`normalizeKurdish`). The **display form is preserved** (the user's own
  casing / Kurdish letters); **uniqueness is case-insensitive** via the column type
  plus a **partial unique index** `users_username_active_uniq (WHERE deleted_at IS NULL)`.
  So `Mohamad`, `mohamad`, `MOHAMAD` can never be separate accounts, and a deleted
  account frees its name.
- We normalize for *uniqueness* but keep the original for *display* — a decomposed
  `e`+◌̂ and a composed `ê` are the same name.

## Character & structural rules
- Length **3–30** (matches the DB `users_username_format` CHECK; kept at the existing
  cap so no current account or fixture breaks — `USERNAME_MAX` + the CHECK move
  together if ever tightened).
- Allowed: ASCII letters, digits, `_`, and Kurdish Latin letters `ê î û ç ş`. Anything
  else — spaces, punctuation, emoji, control characters, zero-width/other Unicode
  scripts (confusables) — is rejected (`invalid-chars`).
- No leading/trailing `_`; no consecutive `__`; must contain **≥1 letter**; **not
  only digits**.
- **Reserved names** (and their look-alikes) are rejected — see below.

## Reserved names
`reserved-usernames.ts` holds one editable list of names that impersonate MyKurda,
staff/roles, or system accounts (`admin`, `moderator`, `support`, `official`,
`mykurda`, `system`, …). The check **folds** case, Kurdish diacritics, separators
(`_ - . space`), and leet confusables (`0→o 1→i 3→e …`) before comparing, so
`adm1n`, `My_Kurda`, `0fficial` are also rejected. A name that merely *contains* a
reserved substring (e.g. `adminakurdi`) is fine — only the whole folded name matches.

## Change rules (anti-abuse)
- One change per **30 days** (`USERNAME_CHANGE_COOLDOWN_DAYS`), tracked by
  `username_changed_at`. The `USERNAME_CHANGE_COOLDOWN` error returns `details.availableAt`
  (ISO date) so the client can say when it's allowed again.
- A **re-cased no-op** (`Mohamad`→`mohamad`) is not a "change" and does not spend the
  cooldown.
- **Race safety:** two simultaneous claims of the same name resolve to exactly one
  winner — the **DB partial-unique index is the authority**; the loser gets
  `USERNAME_TAKEN` (409). Frontend validation is only for fast feedback.

## Security properties
- **No SQL injection:** all queries are parameterized (`$1`).
- **No HTML/XSS:** the allowed charset excludes `< > & " '`, so a username can't carry
  markup; the mobile app renders usernames in `<Text>` (no HTML interpretation) too.
- **No layout breakage:** length-capped, no whitespace/control chars, single-line.
- **No impersonation:** reserved + confusable folding blocks system/role look-alikes.
- **No user enumeration beyond the necessary:** the only signal is the standard
  "username unavailable" needed for signup/change.
