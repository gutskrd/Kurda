# Username policy (KUR-004)

The rules and guarantees for usernames — registration and change. The source of
truth is `shared/src/username.ts`: the one rule the server checks every name
with (`api/src/users/username.ts` says no in its words) and the browser and the
phone check with as a name is typed, so all three refuse the same names for the
same reasons. This documents the decisions.

## The character set
- **3–30** of: the lowercase letters `a–z`, the Kurdish `ç ê î ş û`, the digits
  `0–9`, the underscore `_` and the dot `.`. Nothing else: spaces, hyphens, other
  punctuation, emoji, control and zero-width characters, letters of other
  alphabets (`ö`, `ı`, Cyrillic `о`) are refused (`invalid-chars`), and the
  refusal names the characters so a form can say which one cannot be used.
- A `.` or `_` is **never first or last** (`edge-punctuation`) and **never beside
  another** — `..`, `__`, `._`, `_.` (`double-punctuation`).
- At least **one letter**, and **not only digits** (`no-letter`, `numbers-only`).
- **Reserved names** (and their look-alikes) are refused (`reserved`) — see below.
- The reasons are checked in a fixed order, so one name always gets one reason,
  and what more typing cannot mend comes first; the forms say those as the name
  is typed, and the rest (too short, a mark at the end) once the field is left
  or the form sent.

## Normalisation
What was typed is normalised before it is judged, and only in these ways:
- Unicode **NFC**, so `e`+◌̂ and `ê` are one letter.
- The spaces **around** the name are let go of; spaces inside are refused.
- **Capitals become lowercase letters**, `Ê Î Û Ç Ş` as much as `A–Z`, so somebody
  who is `hamo` and types `Hamo` is still `hamo`. The Turkish capital `İ` becomes a
  plain `i` (JavaScript's own lowercase would leave a combining dot after it).

Anything else outside the set is refused, never silently dropped or swapped. The
forms lowercase as they go, with the caret kept where it was, and leave every
other character in the field for the line under it to explain.

## Storage
- **Stored lowercase** in `users.username` (`citext`), with a **partial unique
  index** `users_username_active_uniq (WHERE deleted_at IS NULL)`, so a deleted
  account frees its name.
- The DB CHECK `users_username_format` holds the character set, the length and the
  dot rules, reading the name **as text** (`citext`'s own `~` ignores case). The
  underscore rules stay with the server: names made before it kept them still
  belong to people.
- Migration `1751000540000_lowercase-usernames` wrote every existing name in
  lowercase (in `users` and `username_history`), naming each capital rather than
  trusting `lower()`, which under the C collation leaves `Ê Î Û Ç Ş` alone. Where two
  live accounts' names became one, the older account kept it and the newer was
  numbered (`şêr_2`), the change written in its history; nobody's change allowance
  was spent.

## Reserved names
`shared/src/username.ts` holds one list of names that would pass for Hevalo, its
staff or roles, or system accounts (`admin`, `moderator`, `support`, `official`,
`mykurda`, `system`, …). The check **folds** case, Kurdish diacritics, separators
(`_ - . space`) and leet confusables (`0→o 1→i 3→e …`) before comparing, so
`adm1n`, `my_kurda`, `ad.min`, `0fficial` are refused with them. A name that merely
*contains* a reserved one (`adminakurdi`) is fine — only the whole folded name
matches.

## Names read from text
- A handle typed into a search box or a moderator's confirmation is read without
  its `@` and without the full stop or comma that ends the sentence after it
  (`handleName`): `@Hamo.` is `hamo`; a dot inside stays (`@hamo.k` is `hamo.k`).
- `findMentions` finds the usernames written into a text as `@name`, never inside a
  word or an email address, and never counting the dot that ends the sentence.
- Profiles are addressed by account id, never by username, so a change of name
  breaks no link.

## Change rules (anti-abuse)
- One change per **30 days** (`USERNAME_CHANGE_COOLDOWN_DAYS`), tracked by
  `username_changed_at`. The `USERNAME_CHANGE_COOLDOWN` error returns `details.availableAt`
  (ISO date) so the client can say when it's allowed again.
- Asking for one's own name in capitals is asking for the name one has: no change,
  and nothing spent.
- The name given up is held for its last owner for 60 days (`username_history`,
  enforced by a trigger for every way a name is set).
- **Race safety:** two simultaneous claims of the same name resolve to exactly one
  winner — the **DB partial-unique index is the authority**; the loser gets
  `USERNAME_TAKEN` (409). Frontend validation is only for fast feedback.

## Security properties
- **No SQL injection:** all queries are parameterized (`$1`).
- **No HTML/XSS:** the allowed charset excludes `< > & " '`, so a username can't carry
  markup; the mobile app renders usernames in `<Text>` (no HTML interpretation) too.
- **No layout breakage:** length-capped, no whitespace/control chars, single-line.
- **No path tricks:** a dot is never first, last or doubled, so no name is `.` or
  `..`, or a dot at the edge of something else.
- **No impersonation:** one case, reserved + confusable folding, and no two marks side
  by side keep look-alikes of system/role names and of each other out.
- **No user enumeration beyond the necessary:** the only signal is the standard
  "username unavailable" needed for signup/change.
