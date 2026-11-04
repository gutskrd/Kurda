/**
 * Guest accounts: trying Hevalo on the phone without signing up.
 *
 * A guest is an ordinary user row — the same XP, streaks, lessons and badges
 * as everyone, so claiming the account later keeps all of it — with no email,
 * no password and no birth month, marked by `guest`. Claiming (POST
 * /auth/claim, or Google and Apple sign-in while a guest) fills those in on
 * the same row and clears the flag.
 *
 * - `users.guest`: true until claimed. Every public listing (search, boards,
 *   profiles, suggestions) leaves guests out, and the social, public and
 *   purchasable routes refuse them (plugins/auth.ts `requireAccount`).
 * - `users.email` becomes nullable: a guest has no address, and a placeholder
 *   would be an address something could one day send mail to. Only a guest
 *   may lack one (`users_email_unless_guest`), so every claimed or registered
 *   account still has an address, as the code has always assumed.
 * - `users.guest_device_hash`: a keyed hash of the app's device id that made
 *   the guest, so an app that crashes and reopens is handed the same guest
 *   back rather than minting a new row each time. Cleared when claimed.
 * - The partial index serves both that lookup and the purge of guests nobody
 *   has touched in sixty days (gdpr/service.ts `purgeIdleGuests`); live guests
 *   are few next to the table, so it stays small.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    guest: { type: 'boolean', notNull: true, default: false },
    guest_device_hash: { type: 'text' },
  });
  pgm.alterColumn('users', 'email', { notNull: false });
  pgm.addConstraint('users', 'users_email_unless_guest', { check: 'email IS NOT NULL OR guest' });
  pgm.createIndex('users', ['guest_device_hash', 'created_at'], {
    name: 'users_live_guests',
    where: 'guest AND deleted_at IS NULL',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('users', ['guest_device_hash', 'created_at'], { name: 'users_live_guests' });
  pgm.dropConstraint('users', 'users_email_unless_guest');
  // a guest row has no address: give each the placeholder a deleted account
  // carries, so the column can be made required again
  pgm.sql(`UPDATE users SET email = 'guest_' || id || '@deleted.kurda.app' WHERE email IS NULL`);
  pgm.alterColumn('users', 'email', { notNull: true });
  pgm.dropColumns('users', ['guest', 'guest_device_hash']);
};
