/**
 * Refresh token storage (KUR-014/KUR-015). Tokens are stored hashed
 * (sha256) — a DB leak exposes no usable tokens. family_id groups a
 * rotation chain: reuse of a rotated token revokes the whole family
 * (rotation logic lands in KUR-015, #15).
 */

export const up = (pgm) => {
  pgm.createTable('refresh_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'text', notNull: true, unique: true },
    family_id: { type: 'uuid', notNull: true },
    device_name: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
    replaced_by: { type: 'uuid' },
  });
  pgm.createIndex('refresh_tokens', ['user_id']);
  pgm.createIndex('refresh_tokens', ['family_id']);
};

export const down = (pgm) => {
  pgm.dropTable('refresh_tokens');
};
