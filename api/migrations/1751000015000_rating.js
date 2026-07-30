/**
 * Matchmaking rating (KUR-050). Starts at 1000; the ELO/Glicko update
 * logic lands with KUR-061 (#61) — the matcher only reads these.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    rating: { type: 'integer', notNull: true, default: 1000 },
    rating_games: { type: 'integer', notNull: true, default: 0 },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['rating', 'rating_games']);
};
