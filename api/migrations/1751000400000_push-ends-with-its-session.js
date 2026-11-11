/**
 * A phone stops receiving an account's notifications when its session ends.
 *
 * A push token was tied to the account and to nothing else, so signing out,
 * "sign out that device", a password reset and a ban all ended the session
 * and left the phone on the account's list: a shared, sold or stolen phone
 * went on receiving who wrote and what they said.
 *
 * Each token now remembers the session it was registered under (the refresh
 * token family), and a trigger removes it when the last live token of that
 * family is revoked or deleted. A trigger rather than a line beside each
 * revocation because there are ten of those and the next one written would
 * be the one that forgot. Rotating a refresh token revokes the old one after
 * the new one of the same family exists, so a session carrying on keeps its
 * phone.
 *
 * Tokens registered before this have no session to follow. They are removed
 * here: every phone registers again the next time the app is opened, this
 * time with its session.
 */

export const up = (pgm) => {
  pgm.addColumn('device_tokens', { family_id: { type: 'uuid' } });
  pgm.createIndex('device_tokens', 'family_id');
  pgm.sql(`DELETE FROM device_tokens WHERE family_id IS NULL`);

  pgm.sql(`
    CREATE FUNCTION device_tokens_end_with_session() RETURNS trigger AS $$
    BEGIN
      DELETE FROM device_tokens d
       WHERE d.family_id = OLD.family_id
         AND NOT EXISTS (
           SELECT 1 FROM refresh_tokens rt
            WHERE rt.family_id = OLD.family_id AND rt.revoked_at IS NULL AND rt.id <> OLD.id
         );
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);
  pgm.sql(`
    CREATE TRIGGER refresh_tokens_revoked_drops_push
      AFTER UPDATE OF revoked_at ON refresh_tokens
      FOR EACH ROW WHEN (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
      EXECUTE FUNCTION device_tokens_end_with_session();
  `);
  pgm.sql(`
    CREATE TRIGGER refresh_tokens_deleted_drops_push
      AFTER DELETE ON refresh_tokens
      FOR EACH ROW WHEN (OLD.revoked_at IS NULL)
      EXECUTE FUNCTION device_tokens_end_with_session();
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TRIGGER refresh_tokens_deleted_drops_push ON refresh_tokens`);
  pgm.sql(`DROP TRIGGER refresh_tokens_revoked_drops_push ON refresh_tokens`);
  pgm.sql(`DROP FUNCTION device_tokens_end_with_session()`);
  pgm.dropColumn('device_tokens', 'family_id');
};
