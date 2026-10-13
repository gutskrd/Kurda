/**
 * The rating box after a first game, "Send feedback" in Settings, and the
 * native store prompt (@kurda/shared `feedback`).
 *
 * `app_feedback` is one answer: stars, the chips ticked, a comment — any of
 * them, but at least one — and where and on what it was sent. Every answer
 * goes to the admin's inbox whatever the stars, which is what keeps the box on
 * the right side of the stores' rules against review gating. An answer
 * outlives its account: `user_id` is set null if the user row ever goes, and
 * `user_hash` (a keyed hash of the id, never reversible from here) still tells
 * one person's answers from another's in the counts. Accounts are anonymised
 * rather than deleted, so in practice the comment is what has to go, and the
 * GDPR code scrubs it (and a closed child's answers entirely).
 *
 * Whether the box has been shown is per account, not per device — it is shown
 * once, ever — so it is a column on `users`, as is what the store prompt needs
 * to keep to its limits: when it was last asked for, how often, and in which
 * app version (at most once per version).
 *
 * Both are decided from the games a player has finished, counted across every
 * game's own table each time the apps ask (finished-games.ts) — after every
 * game. The two multiplayer player tables are keyed by game first, so nothing
 * could find one player's rows without reading all of them: each gets an index
 * on the player, which also serves the cascade when an account row is deleted.
 *
 * The play-invites migration (1751000149000, built alongside this one) adds
 * the same two indexes under the same names, for "my games" and blocks.
 * Whichever runs second finds them there (IF NOT EXISTS), and the down leaves
 * them to that migration's own down, which drops them by name and would fail
 * if they were already gone. On a database without it, rolling this back
 * leaves two indexes that cost nothing and that running it again keeps.
 */

const CATEGORIES = "'lessons','games','stories','bugs','too_hard','too_easy','other'";

export const up = (pgm) => {
  pgm.createTable('app_feedback', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    user_hash: { type: 'text', notNull: true },
    stars: { type: 'smallint' },
    categories: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    comment: { type: 'text' },
    source: { type: 'text', notNull: true },
    platform: { type: 'text', notNull: true },
    app_version: { type: 'text', notNull: true },
    locale: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    status: { type: 'text', notNull: true, default: 'new' },
    admin_note: { type: 'text' },
  });
  pgm.addConstraint('app_feedback', 'app_feedback_stars_check', { check: 'stars IS NULL OR stars BETWEEN 1 AND 5' });
  pgm.addConstraint('app_feedback', 'app_feedback_categories_check', {
    check: `categories <@ ARRAY[${CATEGORIES}]::text[]`,
  });
  pgm.addConstraint('app_feedback', 'app_feedback_comment_check', {
    check: 'comment IS NULL OR char_length(comment) BETWEEN 1 AND 2000',
  });
  // an empty answer says nothing; "not now" is a dismissal, not an answer
  pgm.addConstraint('app_feedback', 'app_feedback_not_empty', {
    check: 'stars IS NOT NULL OR comment IS NOT NULL OR cardinality(categories) > 0',
  });
  pgm.addConstraint('app_feedback', 'app_feedback_source_check', { check: "source IN ('first_game', 'settings')" });
  pgm.addConstraint('app_feedback', 'app_feedback_platform_check', { check: "platform IN ('web', 'ios', 'android')" });
  pgm.addConstraint('app_feedback', 'app_feedback_status_check', { check: "status IN ('new', 'read', 'archived')" });
  pgm.addConstraint('app_feedback', 'app_feedback_note_check', {
    check: 'admin_note IS NULL OR char_length(admin_note) <= 2000',
  });
  pgm.createIndex('app_feedback', [{ name: 'created_at', sort: 'DESC' }]);
  pgm.createIndex('app_feedback', ['status', { name: 'created_at', sort: 'DESC' }]);
  pgm.createIndex('app_feedback', 'user_id', { where: 'user_id IS NOT NULL' });

  pgm.addColumns('users', {
    app_feedback_prompted_at: { type: 'timestamptz' },
    store_review_prompted_at: { type: 'timestamptz' },
    store_review_count: { type: 'integer', notNull: true, default: 0 },
    store_review_version: { type: 'text' },
  });

  pgm.createIndex('wordle_battle_players', 'user_id', { ifNotExists: true });
  pgm.createIndex('rhyme_match_players', 'user_id', { ifNotExists: true });
};

export const down = (pgm) => {
  // the player indexes stay: see above
  pgm.dropColumns('users', [
    'app_feedback_prompted_at',
    'store_review_prompted_at',
    'store_review_count',
    'store_review_version',
  ]);
  pgm.dropTable('app_feedback');
};
