/**
 * Who records which voice: an account linked to the voices it lends to the
 * course (Hamo, Xezal, Hevalo, a narrator for each variety), so the admin's
 * "Record by person" page opens on that person's own lines, and so an account
 * that holds only the narrow voice actor role can record those lines and no
 * others (api/src/recording).
 *
 * One row per account and voice. A voice is named the way the recording
 * page names it — a character's id, `narrator-kmr` / `narrator-ckb`, or
 * `cast-<name>` for a conversation part no character plays — so the check
 * here is only on its shape; the API checks the name itself. The row goes
 * with the account, and loses the name of whoever made the link when theirs
 * goes, as an admin's other marks do.
 *
 * Roles need no change: `users.roles` is a free list, and the new role
 * (`voice_actor`) is given and taken through the API like the content
 * editor's, into the account's history.
 */

export const up = (pgm) => {
  pgm.createTable('recording_voices', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    voice: { type: 'text', notNull: true },
    linked_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    linked_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('recording_voices', 'recording_voices_pkey', { primaryKey: ['user_id', 'voice'] });
  pgm.addConstraint('recording_voices', 'recording_voices_voice_format', { check: "voice ~ '^[a-z][a-z0-9-]{1,47}$'" });
  // who records a voice: the people page lists each voice's people
  pgm.createIndex('recording_voices', 'voice');
};

export const down = (pgm) => {
  pgm.dropTable('recording_voices');
};
