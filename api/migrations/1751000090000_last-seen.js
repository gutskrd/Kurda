/**
 * Online presence: `users.last_seen_at` records the last time the user was
 * active (updated by a lightweight client heartbeat). "Online" is derived at
 * read time as last_seen_at within a short window, so there is no background job
 * and no per-request write amplification. Additive + reversible; nullable so
 * existing users simply read as offline until their next heartbeat.
 */
export const up = (pgm) => {
  pgm.addColumns('users', {
    last_seen_at: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['last_seen_at']);
};
