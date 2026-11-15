/**
 * Usernames are lowercase, and may have dots in them.
 *
 * The rule is shared/src/username.ts: 3 to 30 of a–z, the Kurdish ç ê î ş û,
 * the digits, `_` and `.`, with the dots and underscores never first or last
 * and never two side by side. Capitals are not refused but written as their
 * lowercase letters, so a name is the same name however it is typed. This is
 * the database's side of it.
 *
 * Every username already made is written in lowercase, in `users` and in
 * `username_history`. Each capital is named here, A–Z and Ç Ê Î Ş Û, rather
 * than left to lower(): lower() follows the database's collation, and under
 * the C collation it lowercases A–Z only and leaves the Kurdish capitals as
 * they are. Nothing else needs lowering: the old format check allowed no
 * other letters.
 *
 * Two live accounts may have had names that only differed in capitals: citext
 * compares through lower() as well, so under the C collation Şêr and şêr were
 * two names. Once lowercased they would be one. The older account (by when it
 * was made, then by id) keeps the name, and each newer one is given it with a
 * number: şêr_2, şêr_3, the first that no live account has and nobody holds
 * (shared/src/username.ts `numberedUsername` makes them the same way). That
 * change is written in `username_history`, as every change of name is, so the
 * account's history and its data export show what it was called before. It
 * holds nothing (held_until is now): the name is the older account's.
 * `username_changed_at` is not touched, so nobody's change allowance is spent,
 * whether their name was only lowercased or numbered.
 *
 * A name held for one account that another live account's name becomes once
 * lowercased (only possible where the two were told apart by their capitals)
 * stays with the account that is using it, and the hold ends: a hold keeps a
 * name from being taken, and this one already was.
 *
 * The hold trigger (migration username-history) is set aside while the names
 * are rewritten, and the holds are kept by hand above instead: it refuses a
 * name held for somebody else on any row, a closed account's included, and a
 * closed account's name lowercased takes nothing from anybody. Setting it
 * aside locks `users` against other writes until this commits, so no name
 * gets past it meanwhile.
 *
 * The format check then allows the new character set only. It reads the name
 * as text: citext's own `~` ignores case, and the old check, written against
 * citext, took ŞÊR as readily as şêr. The dots are checked in full here too
 * (never first or last, never beside another dot or an underscore), since no
 * name had a dot before this. The same rules for underscores stay with the
 * server alone: names made before the server kept them may still break them,
 * and they belong to people.
 *
 * Re-runnable: run again, it finds every name already lowercase and nothing
 * the same, and puts the same check in place. Down puts the old check back.
 * The old check allows no dot, so a live name with dots in it has underscores
 * in their place (numbered the same way when that makes two names one, and
 * written in the history); lowercase names fit the old check as they are.
 */

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇÊÎŞÛ';
const LOWER = 'abcdefghijklmnopqrstuvwxyzçêîşû';

/** A username as it is now written: lowercase, named letter by letter (see above). */
const lowercased = (column) => `translate(${column}::text, '${UPPER}', '${LOWER}')`;
/** A username as the old check allows it: no dots. */
const undotted = (column) => `replace(${column}::text, '.', '_')`;

const NEW_CHECK = "username::text ~ '^[a-z0-9_.çêîşû]{3,30}$' AND username::text !~ '^[.]|[.]$|[.][._]|_[.]'";
const OLD_CHECK = "username ~ '^[A-Za-z0-9_êîûçşÊÎÛÇŞ]{3,30}$'";

/**
 * Every live account's name rewritten by `target`, with two that would come
 * out the same told apart: the older keeps it, each newer is numbered and the
 * change written in its history. Then the holds a rewritten name would break
 * are ended, and every name, closed accounts' too, is rewritten.
 */
const rewrite = (target) => `
  DO $rewrite$
  DECLARE
    r record;
    n int;
    candidate text;
  BEGIN
    FOR r IN
      SELECT id, username::text AS was, goal FROM (
        SELECT id, username, ${target('username')} AS goal,
               row_number() OVER (PARTITION BY ${target('username')} ORDER BY created_at, id) AS place
          FROM users WHERE deleted_at IS NULL
      ) ranked
       WHERE place > 1
       ORDER BY goal, place
    LOOP
      n := 2;
      LOOP
        candidate := coalesce(nullif(rtrim(left(r.goal, 30 - length('_' || n)), '._'), ''), 'heval') || '_' || n;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.deleted_at IS NULL AND u.id <> r.id AND ${target('u.username')} = candidate)
              AND NOT EXISTS (SELECT 1 FROM username_history h JOIN users o ON o.id = h.user_id
                               WHERE ${target('h.username')} = candidate AND h.held_until > now() AND h.user_id <> r.id AND o.deleted_at IS NULL);
        n := n + 1;
      END LOOP;
      UPDATE users SET username = candidate WHERE id = r.id;
      INSERT INTO username_history (user_id, username, changed_at, held_until) VALUES (r.id, r.was, now(), now());
    END LOOP;
  END $rewrite$;

  UPDATE username_history h SET held_until = now()
   WHERE h.held_until > now()
     AND EXISTS (SELECT 1 FROM users u WHERE u.deleted_at IS NULL AND u.id <> h.user_id AND ${target('u.username')} = ${target('h.username')});

  UPDATE users SET username = ${target('username')} WHERE username::text <> ${target('username')};
`;

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_format;
    ALTER TABLE users DISABLE TRIGGER users_username_not_held;
    ${rewrite(lowercased)}
    UPDATE username_history SET username = ${lowercased('username')} WHERE username::text <> ${lowercased('username')};
    ALTER TABLE users ENABLE TRIGGER users_username_not_held;
    ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (${NEW_CHECK});
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_format;
    ALTER TABLE users DISABLE TRIGGER users_username_not_held;
    ${rewrite(undotted)}
    ALTER TABLE users ENABLE TRIGGER users_username_not_held;
    ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (${OLD_CHECK});
  `);
};
