/**
 * Admin-decided rhyme pairs.
 *
 * Whether two words rhyme is otherwise derived from their endings, which is right
 * most of the time but cannot know about dialect quirks, borrowed words or pairs a
 * curator simply judges differently. These rows are the explicit answer for one
 * (prompt, word) pair and win over the computed one.
 *
 * `quality` doubles as the verdict: 'perfect'/'near' accept the word and set how
 * much it scores, 'none' rejects it outright. Both directions matter — forcing a
 * pair in AND ruling one out.
 *
 * Words are stored in their normalized form (the same normalizeWord() the scorer
 * uses), so a lookup is an exact key match rather than a scan.
 */
export const up = (pgm) => {
  pgm.createTable('rhyme_overrides', {
    prompt_normalized: { type: 'text', notNull: true },
    rhyme_normalized: { type: 'text', notNull: true },
    quality: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rhyme_overrides', 'rhyme_overrides_pkey', {
    primaryKey: ['prompt_normalized', 'rhyme_normalized'],
  });
  pgm.addConstraint('rhyme_overrides', 'rhyme_overrides_quality_check', {
    check: "quality IN ('perfect','near','none')",
  });
};

export const down = (pgm) => {
  pgm.dropTable('rhyme_overrides');
};
