/**
 * The learner's tree.
 *
 * Everybody plants one tree and grows it with the water their lessons earn
 * (shared `tree.ts` has the rules: the kinds, the stages, how it fares
 * without water). `user_trees` is the tree that stands: what kind it is,
 * when it was planted and last watered, both in the learner's own calendar
 * day, how often it has been watered, and the water held and not yet poured.
 * How far it has grown and how it fares are worked out from those when it is
 * read, so a tree left alone wilts without anything having to run.
 *
 * Planting another kind replaces the row's tree in place: `id` is made new
 * each time, so that what one tree paid out (a harvest's Zêr, keyed on the
 * tree and the harvest) can never be confused with the next one's, and
 * `planted` counts the trees a learner has had. The water held is the
 * learner's, not the tree's, and stays through a replanting.
 *
 * `user_tree_kinds` is the kinds a learner has bought. The ones free to
 * plant are not written down: they are everybody's. A kind is paid for once
 * and can be planted again whenever wanted.
 */
export const up = (pgm) => {
  pgm.createTable('user_trees', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    id: { type: 'uuid', notNull: true, default: pgm.func('gen_random_uuid()') },
    species: { type: 'text', notNull: true },
    planted_on: { type: 'date', notNull: true },
    last_watered_on: { type: 'date', notNull: true },
    waterings: { type: 'integer', notNull: true, default: 0, check: 'waterings >= 0' },
    water: { type: 'integer', notNull: true, default: 0, check: 'water >= 0 AND water <= 9999' },
    harvests: { type: 'integer', notNull: true, default: 0, check: 'harvests >= 0' },
    planted: { type: 'integer', notNull: true, default: 1, check: 'planted >= 1' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('user_tree_kinds', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    species: { type: 'text', notNull: true },
    bought_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('user_tree_kinds', 'user_tree_kinds_pkey', { primaryKey: ['user_id', 'species'] });
};

export const down = (pgm) => {
  pgm.dropTable('user_tree_kinds');
  pgm.dropTable('user_trees');
};
