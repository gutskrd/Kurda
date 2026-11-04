/**
 * The story library: stories filed, attributed, reviewed and remembered.
 *
 * Stories were a flat list of three levels. The library gives each story a
 * place and a provenance, and each reader a record on it:
 *
 * - `level` widens to 1–5 (A1 to C1, `cefrOf` in @kurda/shared), on the games
 *   too, which copy the level they were played at. Existing rows keep 1–3.
 * - `language` is stored on every story although only Kurdish exists yet, so
 *   another language can arrive without a rewrite; the dialect stays the
 *   variety within it.
 * - `category` files the story under one of `story_categories`, which the
 *   library lists with counts. The eight starting categories are seeded here
 *   in English, Kurmancî and Soranî; an editor may add more. Deleting a
 *   category with stories in it is refused by the admin unless forced, and
 *   then the stories are left unfiled (ON DELETE SET NULL).
 * - `tradition`, `author`, `source`, `source_url` and `attribution_note` say
 *   where a story comes from. An original story written for learners is never
 *   presented as folklore, so this is a column and not a line in the summary.
 * - `translations` holds full translations by interface language, each with
 *   the body's paragraphs; the reader shows them beside the Kurdish.
 * - `cover` names a shared background picture; `reading_minutes` lets an
 *   editor override the estimate; `featured` and `featured_at` are the
 *   editors' picks for the library's front row.
 * - `review_status`: editorial review, separate from publication. A story is
 *   approved by a reviewer and then published; a content change to an
 *   approved story sends it back to unreviewed. Every story published before
 *   this migration was read before it went live, so it is approved as of its
 *   publication. The check keeps the rule the API enforces: nothing is
 *   published that was not approved.
 * - `translation_group` links the versions of one story (a Kurmancî and a
 *   Soranî telling); the same group is the same story.
 *
 * `story_bookmarks` is a reader's own shelf; `story_reading` their last place
 * in each story and when they finished it. Both are deleted with the account
 * (api/src/gdpr/service.ts lists them too, for the erasure that keeps the row).
 */

const CATEGORIES = [
  ['folktale', { en: 'Folktales', ku: 'Çîrokên gelêrî', ckb: 'چیرۆکی گەلێری' }],
  ['fable', { en: 'Animal fables', ku: 'Çîrokên heywanan', ckb: 'چیرۆکی ئاژەڵان' }],
  ['legend', { en: 'Legends and history', ku: 'Efsane û dîrok', ckb: 'ئەفسانە و مێژوو' }],
  ['family', { en: 'Family', ku: 'Malbat', ckb: 'خێزان' }],
  ['village', { en: 'Village life', ku: 'Jiyana gund', ckb: 'ژیانی گوند' }],
  ['nature', { en: 'Nature', ku: 'Xweza', ckb: 'سروشت' }],
  ['everyday', { en: 'Everyday life', ku: 'Jiyana rojane', ckb: 'ژیانی ڕۆژانە' }],
  ['celebrations', { en: 'Celebrations', ku: 'Cejn û şahî', ckb: 'جەژن و ئاهەنگ' }],
];

export const up = (pgm) => {
  // five levels, on the stories and on the games played at a level
  pgm.dropConstraint('stories', 'stories_level_check');
  pgm.addConstraint('stories', 'stories_level_check', { check: 'level BETWEEN 1 AND 5' });
  pgm.dropConstraint('story_games', 'story_games_level_check');
  pgm.addConstraint('story_games', 'story_games_level_check', { check: 'level BETWEEN 1 AND 5' });

  pgm.createTable('story_categories', {
    slug: { type: 'text', primaryKey: true },
    /** { en: string } & Partial<Record<locale, string>> */
    name: { type: 'jsonb', notNull: true },
    position: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('story_categories', 'story_categories_slug_format', { check: "slug ~ '^[a-z0-9-]{2,40}$'" });
  pgm.addConstraint('story_categories', 'story_categories_name_shape', {
    check: "jsonb_typeof(name) = 'object' AND jsonb_typeof(name->'en') = 'string'",
  });
  pgm.createTrigger('story_categories', 'story_categories_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at',
  });
  CATEGORIES.forEach(([slug, name], position) => {
    pgm.sql(`INSERT INTO story_categories (slug, name, position) VALUES ('${slug}', '${JSON.stringify(name)}'::jsonb, ${position})`);
  });

  pgm.addColumns('stories', {
    language: { type: 'text', notNull: true, default: 'ku' },
    category: { type: 'text', references: 'story_categories', onUpdate: 'CASCADE', onDelete: 'SET NULL' },
    tradition: { type: 'text', notNull: true, default: 'original' },
    author: { type: 'text' },
    /** the collection, teller, region or publication it comes from (`source` already names the door it came in by) */
    story_source: { type: 'text' },
    source_url: { type: 'text' },
    attribution_note: { type: 'text' },
    /** { [locale]: string }, each with the body's paragraphs */
    translations: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    /** the key of a shared background picture */
    cover: { type: 'text' },
    /** an editor's reading time; the API answers it in place of the estimate */
    reading_minutes: { type: 'smallint' },
    featured: { type: 'boolean', notNull: true, default: false },
    featured_at: { type: 'timestamptz' },
    review_status: { type: 'text', notNull: true, default: 'unreviewed' },
    reviewed_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reviewed_at: { type: 'timestamptz' },
    review_note: { type: 'text' },
    translation_group: { type: 'uuid' },
  });
  pgm.addConstraint('stories', 'stories_language_check', { check: "language IN ('ku')" });
  pgm.addConstraint('stories', 'stories_tradition_check', { check: "tradition IN ('traditional', 'adapted', 'original')" });
  pgm.addConstraint('stories', 'stories_author_length', { check: 'author IS NULL OR char_length(author) <= 120' });
  pgm.addConstraint('stories', 'stories_story_source_length', { check: 'story_source IS NULL OR char_length(story_source) <= 300' });
  pgm.addConstraint('stories', 'stories_source_url_check', {
    check: "source_url IS NULL OR (char_length(source_url) <= 500 AND source_url LIKE 'https://%')",
  });
  pgm.addConstraint('stories', 'stories_attribution_note_length', {
    check: 'attribution_note IS NULL OR char_length(attribution_note) <= 600',
  });
  pgm.addConstraint('stories', 'stories_translations_shape', { check: "jsonb_typeof(translations) = 'object'" });
  pgm.addConstraint('stories', 'stories_cover_length', { check: 'cover IS NULL OR char_length(cover) <= 80' });
  pgm.addConstraint('stories', 'stories_reading_minutes_check', { check: 'reading_minutes IS NULL OR reading_minutes BETWEEN 1 AND 120' });
  pgm.addConstraint('stories', 'stories_review_status_check', { check: "review_status IN ('unreviewed', 'approved')" });
  pgm.addConstraint('stories', 'stories_review_note_length', { check: 'review_note IS NULL OR char_length(review_note) <= 600' });

  // whoever published a story before review existed had read it: it is approved as of then
  pgm.sql(`UPDATE stories SET review_status = 'approved', reviewed_by = published_by, reviewed_at = published_at WHERE status = 'published'`);
  pgm.addConstraint('stories', 'stories_published_is_approved', { check: "status <> 'published' OR review_status = 'approved'" });

  pgm.createIndex('stories', 'translation_group', { where: 'translation_group IS NOT NULL' });
  // the library's rows: the featured picks and the latest published
  pgm.createIndex('stories', ['status', 'featured_at'], { where: 'featured' });
  pgm.createIndex('stories', ['status', 'published_at']);
  pgm.createIndex('stories', ['status', 'category']);

  pgm.createTable('story_bookmarks', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    story_id: { type: 'uuid', notNull: true, references: 'stories', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('story_bookmarks', 'story_bookmarks_pkey', { primaryKey: ['user_id', 'story_id'] });
  pgm.createIndex('story_bookmarks', ['user_id', { name: 'created_at', sort: 'DESC' }]);
  // deleting a story cascades here: without this, a scan per deleted story
  pgm.createIndex('story_bookmarks', 'story_id');

  pgm.createTable('story_reading', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    story_id: { type: 'uuid', notNull: true, references: 'stories', onDelete: 'CASCADE' },
    /** the last paragraph read, an index into the story's paragraphs */
    paragraph: { type: 'smallint', notNull: true, default: 0 },
    /** how far through the text, 0–1 */
    share: { type: 'real', notNull: true, default: 0 },
    /** set once, the first time the reader finishes; never unset */
    finished_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('story_reading', 'story_reading_pkey', { primaryKey: ['user_id', 'story_id'] });
  pgm.addConstraint('story_reading', 'story_reading_share_check', { check: 'share >= 0 AND share <= 1' });
  pgm.addConstraint('story_reading', 'story_reading_paragraph_check', { check: 'paragraph >= 0' });
  pgm.createIndex('story_reading', ['user_id', { name: 'updated_at', sort: 'DESC' }]);
  pgm.createIndex('story_reading', 'story_id');
};

export const down = (pgm) => {
  pgm.dropTable('story_reading');
  pgm.dropTable('story_bookmarks');
  pgm.dropIndex('stories', ['status', 'category']);
  pgm.dropIndex('stories', ['status', 'published_at']);
  pgm.dropIndex('stories', ['status', 'featured_at']);
  pgm.dropIndex('stories', 'translation_group');
  pgm.dropConstraint('stories', 'stories_published_is_approved');
  for (const name of [
    'stories_language_check',
    'stories_tradition_check',
    'stories_author_length',
    'stories_story_source_length',
    'stories_source_url_check',
    'stories_attribution_note_length',
    'stories_translations_shape',
    'stories_cover_length',
    'stories_reading_minutes_check',
    'stories_review_status_check',
    'stories_review_note_length',
  ]) {
    pgm.dropConstraint('stories', name);
  }
  pgm.dropColumns('stories', [
    'language',
    'category',
    'tradition',
    'author',
    'story_source',
    'source_url',
    'attribution_note',
    'translations',
    'cover',
    'reading_minutes',
    'featured',
    'featured_at',
    'review_status',
    'reviewed_by',
    'reviewed_at',
    'review_note',
    'translation_group',
  ]);
  pgm.dropTable('story_categories');
  // a story or game at level 4 or 5 cannot go back under the old check: it is brought down to 3
  pgm.sql(`UPDATE story_games SET level = 3 WHERE level > 3`);
  pgm.sql(`UPDATE stories SET level = 3 WHERE level > 3`);
  pgm.dropConstraint('story_games', 'story_games_level_check');
  pgm.addConstraint('story_games', 'story_games_level_check', { check: 'level BETWEEN 1 AND 3' });
  pgm.dropConstraint('stories', 'stories_level_check');
  pgm.addConstraint('stories', 'stories_level_check', { check: 'level BETWEEN 1 AND 3' });
};
