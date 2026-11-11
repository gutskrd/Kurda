/**
 * The usernames an account used to have, and how long each is kept for it.
 *
 * A person may change their username (POST /me/username). Until now the only
 * trace of a change was `users.username_changed_at`, and the name given up was
 * free the same second: anybody could take the name a person's friends knew
 * them by and write to those friends under it. So the old name is written down
 * here and held for its last owner until `held_until`. Nobody else can take it
 * before then, whichever way a username is set: signing up, claiming a guest
 * account, a name made for a sign-in through another service, or a change of
 * name. The owner can take their own old name back.
 *
 * The rule is kept by the database rather than by each of those code paths. A
 * trigger on `users` refuses a username somebody else holds, with the code of
 * a unique violation and a constraint name of its own
 * (`users_username_held`), which the server answers exactly as it answers a
 * name that is taken: whether a name is in use or only held is nobody else's
 * business. It runs after the row is written, so a sign-up that had to wait
 * for a rename to commit sees the hold that rename made.
 *
 * A hold lapses when the account that has it is deleted, as that account's
 * own username is freed (`users_username_active_uniq`). The rows themselves
 * stay as the account's history, for a moderator looking into impersonation,
 * and go with the account when it is erased.
 */
export const up = (pgm) => {
  pgm.createTable('username_history', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    username: { type: 'citext', notNull: true },
    changed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    held_until: { type: 'timestamptz', notNull: true },
  });
  pgm.createIndex('username_history', 'username');
  pgm.createIndex('username_history', ['user_id', 'changed_at']);
  pgm.sql(`
    CREATE FUNCTION users_username_not_held() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM username_history h JOIN users u ON u.id = h.user_id
         WHERE h.username = NEW.username AND h.held_until > now() AND h.user_id <> NEW.id AND u.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'username is held for the account that had it'
          USING ERRCODE = 'unique_violation', CONSTRAINT = 'users_username_held';
      END IF;
      RETURN NULL;
    END $$;
    CREATE TRIGGER users_username_not_held AFTER INSERT OR UPDATE OF username ON users
      FOR EACH ROW EXECUTE FUNCTION users_username_not_held();
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS users_username_not_held ON users;
    DROP FUNCTION IF EXISTS users_username_not_held();
  `);
  pgm.dropTable('username_history');
};
