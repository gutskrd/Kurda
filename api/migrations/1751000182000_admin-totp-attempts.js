/**
 * Admin 2FA: one use per code, and a limit on wrong codes.
 *
 * `last_used_step` is the 30-second time step of the last code accepted, so the
 * same code cannot be entered a second time while it is still current.
 *
 * Wrong codes are counted per admin: enough of them inside the window locks the
 * second factor for a while, longer each time it happens again, and a right
 * code clears the count. Without it a six-digit code could be guessed by
 * whoever had the password.
 */

export const up = (pgm) => {
  pgm.addColumns('admin_totp', {
    last_used_step: { type: 'bigint' },
    failed_attempts: { type: 'integer', notNull: true, default: 0 },
    last_failed_at: { type: 'timestamptz' },
    lock_level: { type: 'integer', notNull: true, default: 0 },
    locked_until: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('admin_totp', ['last_used_step', 'failed_attempts', 'last_failed_at', 'lock_level', 'locked_until']);
};
