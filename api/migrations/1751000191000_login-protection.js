/**
 * Sign-in protection: known devices, spraying from one network, security
 * notices, and an end to every session.
 *
 * - `known_devices`: a device (or, for apps that send no device id, a network)
 *   that has signed in to an account before, kept as a keyed hash (never the
 *   id or the address itself), with an expiry. It has its own failure budget,
 *   so someone typing the owner's address with wrong passwords from elsewhere
 *   cannot lock the owner out.
 * - `auth_lockouts` gains the `device` scope for that budget.
 * - `auth_network_failures`: one row per failed sign-in from a network (its
 *   keyed hash) and the account it was aimed at (a keyed hash too), so a hard
 *   network lock can wait for many failures across several accounts — a
 *   whole mobile carrier can share one address.
 * - `security_notices`: when a security email last went to an account, so
 *   "too many sign-in attempts" goes at most once a day.
 * - `refresh_tokens.session_started_at`: when the session the token belongs
 *   to began, carried over on every rotation, so a session ends after a fixed
 *   lifetime however often it is refreshed. Existing tokens start counting now
 *   rather than from their first sign-in, so nobody is signed out by the
 *   deploy.
 */

export const up = (pgm) => {
  pgm.dropConstraint('auth_lockouts', 'auth_lockouts_scope_check');
  pgm.addConstraint('auth_lockouts', 'auth_lockouts_scope_check', {
    check: "scope IN ('account', 'ip', 'device')",
  });

  pgm.createTable('known_devices', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    device_hash: { type: 'text', notNull: true },
    kind: { type: 'text', notNull: true, default: 'device', check: "kind IN ('device', 'network')" },
    first_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });
  pgm.addConstraint('known_devices', 'known_devices_pkey', { primaryKey: ['user_id', 'device_hash'] });
  pgm.createIndex('known_devices', 'expires_at');

  pgm.createTable('auth_network_failures', {
    network_key: { type: 'text', notNull: true },
    target_hash: { type: 'text', notNull: true },
    failed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('auth_network_failures', ['network_key', 'failed_at']);
  pgm.createIndex('auth_network_failures', 'failed_at');

  pgm.createTable('security_notices', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    kind: { type: 'text', notNull: true },
    sent_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('security_notices', 'security_notices_pkey', { primaryKey: ['user_id', 'kind'] });

  pgm.addColumns('refresh_tokens', {
    session_started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('refresh_tokens', ['session_started_at']);
  pgm.dropTable('security_notices');
  pgm.dropTable('auth_network_failures');
  pgm.dropTable('known_devices');
  pgm.sql(`DELETE FROM auth_lockouts WHERE scope = 'device'`);
  pgm.dropConstraint('auth_lockouts', 'auth_lockouts_scope_check');
  pgm.addConstraint('auth_lockouts', 'auth_lockouts_scope_check', { check: "scope IN ('account', 'ip')" });
};
