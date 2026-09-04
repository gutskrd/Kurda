/**
 * Curated rhyme prompts.
 *
 * Rhyme rounds picked their prompt at random from the WHOLE dictionary, so a word
 * with no rhyming partner could be chosen and the round was unplayable — nothing
 * the player did could score. This flag lets an admin choose which words are good
 * prompts.
 *
 * Selection prefers curated words and falls back to the whole dictionary while
 * none are marked, so the games keep working before anyone curates anything.
 */
export const up = (pgm) => {
  pgm.addColumn('dict_entries', {
    is_rhyme_prompt: { type: 'boolean', notNull: true, default: false },
  });
  // the prompt picker only ever scans the curated set
  pgm.createIndex('dict_entries', 'is_rhyme_prompt', {
    name: 'dict_entries_rhyme_prompt_idx',
    where: 'is_rhyme_prompt',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('dict_entries', 'is_rhyme_prompt', { name: 'dict_entries_rhyme_prompt_idx' });
  pgm.dropColumn('dict_entries', 'is_rhyme_prompt');
};
