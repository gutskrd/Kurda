/**
 * What a rhyme match breaks a tie on.
 *
 * Two players on the same score used to be split by who had *fewer* accepted
 * rhymes, as the more efficient one, which on an equal score put the player
 * who found less ahead. The tie now goes to more perfect rhymes, and then to
 * the player whose last rhyme came first (rhyme-match.ts). Neither can be read
 * back from `used_words`, so each player's row counts them as they score.
 *
 * A match already under way when this runs starts both at nothing, which ties
 * as before; the score itself is unchanged.
 */

export const up = (pgm) => {
  pgm.addColumns('rhyme_match_players', {
    perfect: { type: 'integer', notNull: true, default: 0 },
    last_scored_at: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('rhyme_match_players', ['perfect', 'last_scored_at']);
};
