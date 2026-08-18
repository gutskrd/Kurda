/**
 * Rhyme multiplayer 1v1 / free-for-all (KUR-299). Server-authoritative: every
 * player races the same server-held `prompt` within one shared timed window;
 * submissions are validated + scored by the #298 engine here, so the client never
 * decides rhyme or score. `rhyme_matches` holds the shared prompt/window;
 * `rhyme_match_players` holds each player's used words + score. Placement is the
 * pure `rhyme-match.ts` ranker (score → efficiency) and XP is by placement.
 *
 * Poll-safe (like Wordle Battle #306) so the flow is integration-testable without
 * a live socket; realtime scoreboard push (#049) + matchmaking (#050) layer on top.
 */

export const up = (pgm) => {
  pgm.createTable('rhyme_matches', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    created_by: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    dialect: { type: 'text', notNull: true, default: 'kurmanci', check: "dialect IN ('kurmanci','sorani')" },
    prompt: { type: 'text', notNull: true },
    window_ms: { type: 'integer', notNull: true },
    max_players: { type: 'integer', notNull: true, default: 8, check: 'max_players BETWEEN 2 AND 8' },
    status: { type: 'text', notNull: true, default: 'lobby', check: "status IN ('lobby','active','finished')" },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('rhyme_matches', ['status', 'created_at']);

  pgm.createTable('rhyme_match_players', {
    match_id: { type: 'uuid', notNull: true, references: 'rhyme_matches', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    used_words: { type: 'jsonb', notNull: true, default: '[]' },
    score: { type: 'integer', notNull: true, default: 0 },
    accepted: { type: 'integer', notNull: true, default: 0 },
    xp_awarded: { type: 'integer' },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rhyme_match_players', 'rhyme_match_players_pkey', { primaryKey: ['match_id', 'user_id'] });
};

export const down = (pgm) => {
  pgm.dropTable('rhyme_match_players');
  pgm.dropTable('rhyme_matches');
};
