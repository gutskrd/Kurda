/**
 * The oak alone stays free to plant (shared tree.ts); the pomegranate, almond and willow are now bought like every
 * other kind. Whoever is growing one of them planted it while it was free, so it is written down as theirs and they can
 * plant it again later without paying.
 */

const ONCE_FREE = ['hinar', 'behiv', 'bi'];

export const up = (pgm) => {
  pgm.sql(`
    INSERT INTO user_tree_kinds (user_id, species)
    SELECT t.user_id, t.species FROM user_trees t
     WHERE t.species IN (${ONCE_FREE.map((s) => `'${s}'`).join(', ')})
    ON CONFLICT DO NOTHING`);
};

/** The kinds stay written down: with them free again they change nothing, and some may have been bought since. */
export const down = () => {};
