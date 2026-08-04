/**
 * User tags & badges (KUR-286). `tags` is the catalog (built-in + admin-created);
 * `user_tags` holds a user's self-claimed / auto-granted tags. Each user has one
 * effective **main tag** resolved by precedence — Founder > Admin > Kurdish
 * (shop entitlement) > none — computed from RBAC + entitlements (not stored), plus
 * any number of **claimable** tags (age/gender/ethnicity self-claimed; year_joined
 * + level auto-granted). Sensitive tags are optional + revocable (privacy #109).
 */

export const up = (pgm) => {
  pgm.createTable('tags', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    key: { type: 'text', notNull: true, unique: true },
    label: { type: 'text', notNull: true },
    kind: { type: 'text', notNull: true, check: "kind IN ('main','claimable')" },
    category: { type: 'text', notNull: true, default: 'custom' },
    acquisition: {
      type: 'text',
      notNull: true,
      check: "acquisition IN ('default','role','purchase','self_claim','auto_grant')",
    },
    role_required: { type: 'text' }, // 'founder' | 'admin' for role-based main tags
    shop_sku: { type: 'text' }, // the shop item whose entitlement grants this tag
    sensitive: { type: 'boolean', notNull: true, default: false },
    created_by: { type: 'uuid' },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('user_tags', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    tag_id: { type: 'uuid', notNull: true, references: 'tags', onDelete: 'CASCADE' },
    source: { type: 'text', notNull: true }, // 'self_claim' | 'auto_grant' | 'purchase'
    value: { type: 'text' }, // declared value (e.g. an age band) or auto value
    displayed: { type: 'boolean', notNull: true, default: true },
    granted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('user_tags', 'user_tags_uniq', { unique: ['user_id', 'tag_id'] });
  pgm.createIndex('user_tags', 'user_id');

  // the Kurdish main tag is a shop item; its entitlement grants the tag
  pgm.sql(`
    INSERT INTO shop_items (sku, name, description, category, currency, price, is_unique)
    VALUES ('tag_kurdish', 'Kurdish Tag', 'A Kurdish identity tag for your profile.', 'tag', 'zer', 500, true)
    ON CONFLICT (sku) DO NOTHING
  `);

  // built-in tag catalog
  pgm.sql(`
    INSERT INTO tags (key, label, kind, category, acquisition, role_required, shop_sku, sensitive) VALUES
      ('founder',    'Founder',      'main',      'role',        'role',       'founder', NULL,          false),
      ('admin',      'Admin',        'main',      'role',        'role',       'admin',   NULL,          false),
      ('kurdish',    'Kurdish',      'main',      'purchase',    'purchase',   NULL,      'tag_kurdish', false),
      ('year_joined','Year Joined',  'claimable', 'year_joined', 'auto_grant', NULL,      NULL,          false),
      ('level',      'Level',        'claimable', 'level',       'auto_grant', NULL,      NULL,          false),
      ('age',        'Age',          'claimable', 'age',         'self_claim', NULL,      NULL,          true),
      ('gender',     'Gender',       'claimable', 'gender',      'self_claim', NULL,      NULL,          true),
      ('ethnicity',  'Ethnicity',    'claimable', 'ethnicity',   'self_claim', NULL,      NULL,          true)
    ON CONFLICT (key) DO NOTHING
  `);
};

export const down = (pgm) => {
  pgm.dropTable('user_tags');
  pgm.dropTable('tags');
  pgm.sql(`DELETE FROM shop_items WHERE sku = 'tag_kurdish'`);
};
