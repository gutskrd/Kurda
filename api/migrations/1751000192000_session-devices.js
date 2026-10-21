/**
 * Signed-in devices, each listed once.
 *
 * - `refresh_tokens.device_hash`: the device a session was opened on — the
 *   app's `X-Device-Id`, kept as the same per-account keyed hash
 *   `known_devices` uses (never the id itself). Settings lists a device once
 *   however many times it has signed in, and signing a device out ends every
 *   session it holds. Null for a session opened by an app that sends no id;
 *   such a session gets its device when it next refreshes from one that does.
 * - `refresh_tokens.short_lived`: the sign-in asked not to be remembered, so
 *   its session ends a day after it was last used rather than thirty: a
 *   browser that forgot the session when its window closed leaves nothing
 *   behind for a month. Existing sessions keep the thirty days.
 */

export const up = (pgm) => {
  pgm.addColumns('refresh_tokens', {
    device_hash: { type: 'text' },
    short_lived: { type: 'boolean', notNull: true, default: false },
  });
  pgm.createIndex('refresh_tokens', ['user_id', 'device_hash'], { where: 'device_hash IS NOT NULL' });
};

export const down = (pgm) => {
  pgm.dropIndex('refresh_tokens', ['user_id', 'device_hash']);
  pgm.dropColumns('refresh_tokens', ['device_hash', 'short_lived']);
};
