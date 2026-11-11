/**
 * A sign-up whose address was never confirmed is kept for a week, not for good.
 *
 * Until now such an account stayed for ever: it held the address and the
 * username it was made with, so the person the address really belongs to was
 * told it was in use, and somebody who mistyped their own address and started
 * again found their name taken by the account they had just abandoned. It
 * could also ask for a new code four times an hour, every hour, each one an
 * email to an address nobody had shown to be theirs.
 *
 * Two things are kept for the rules in `api/src/auth/pending-signups.ts`:
 *
 * - `users.claimed_from_guest_at`: when a guest gave the account an address
 *   (POST /auth/claim). Everything learned as a guest is on that row, so when
 *   such a claim is never confirmed the row goes back to being a guest rather
 *   than being closed; a sign-up made from nothing has nothing on it, and is
 *   closed.
 *
 * - `verification_sends`: one row for each confirmation email, by account and
 *   by a hash of the address, so the mail one address or one account can be
 *   sent in a day has a ceiling. A hash, so this is not a second place the
 *   address is written down; rows are removed after two days.
 */

export const up = (pgm) => {
  pgm.addColumn('users', { claimed_from_guest_at: { type: 'timestamptz' } });

  pgm.createTable('verification_sends', {
    id: { type: 'bigserial', primaryKey: true },
    // no reference: the count for an address has to outlast the account that caused it
    user_id: { type: 'uuid' },
    address_hash: { type: 'text', notNull: true },
    sent_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('verification_sends', ['address_hash', 'sent_at']);
  pgm.createIndex('verification_sends', ['user_id', 'sent_at']);

  // the purge reads the unconfirmed sign-ups by age
  pgm.createIndex('users', 'created_at', {
    name: 'users_unconfirmed_signups',
    where: 'email_verified_at IS NULL AND NOT guest AND deleted_at IS NULL',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('users', 'created_at', { name: 'users_unconfirmed_signups' });
  pgm.dropTable('verification_sends');
  pgm.dropColumn('users', 'claimed_from_guest_at');
};
