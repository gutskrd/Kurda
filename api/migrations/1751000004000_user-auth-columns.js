/**
 * Auth enforcement columns (KUR-016):
 * - token_version: bumped to force-invalidate all issued access tokens
 *   (bans, password resets, "logout everywhere")
 * - roles: authorization roles ('admin', 'moderator', ...); empty for
 *   normal users
 * - banned_at: moderation bans (KUR-101) — banned users get 403 even
 *   with an otherwise valid token
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    token_version: { type: 'integer', notNull: true, default: 0 },
    roles: { type: 'text[]', notNull: true, default: '{}' },
    banned_at: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['token_version', 'roles', 'banned_at']);
};
