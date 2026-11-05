/**
 * Join codes for every online game, in place of invite links.
 *
 * Story games have had a six-character code since they began; Peyvok Battle
 * and Rhyme Match were joined through a link carrying the lobby's id. Now every
 * lobby has a code from the same alphabet (no 0/O, 1/I/L), so a friend can be
 * told it across a room or over the phone, and one box on the games page takes
 * the code of any game.
 *
 * The code is made here, by `new_game_code()`, rather than by each service:
 * a lobby is made in several places (a new game, a two-player rematch, the
 * host's next round) and every one of them gets a code without being touched,
 * and the function checks all three games' tables, so a code names one game
 * across all of them — the single box needs that. Story games call the same
 * function when they make theirs.
 *
 * A code lives only while its game can be joined, as story codes always have:
 * a trigger clears it the moment a battle or match leaves the lobby (started,
 * finished, called off), so the codes in use at any time are the few open
 * lobbies' and a code can be issued again later.
 */

const GAMES = ['wordle_battles', 'rhyme_matches'];

export const up = (pgm) => {
  pgm.sql(`
    CREATE FUNCTION new_game_code() RETURNS text
    LANGUAGE plpgsql VOLATILE AS $$
    DECLARE
      alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      candidate text;
      b int;
    BEGIN
      LOOP
        candidate := '';
        WHILE char_length(candidate) < 6 LOOP
          b := get_byte(gen_random_bytes(1), 0);
          -- 248 = 8 × 31: drawing again above it keeps every letter equally likely
          IF b < 248 THEN
            candidate := candidate || substr(alphabet, 1 + b % 31, 1);
          END IF;
        END LOOP;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM story_games s WHERE s.code = candidate)
          AND NOT EXISTS (SELECT 1 FROM wordle_battles w WHERE w.code = candidate)
          AND NOT EXISTS (SELECT 1 FROM rhyme_matches r WHERE r.code = candidate);
      END LOOP;
      RETURN candidate;
    END
    $$
  `);

  pgm.sql(`
    CREATE FUNCTION release_game_code() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.status <> 'lobby' THEN
        NEW.code := NULL;
      END IF;
      RETURN NEW;
    END
    $$
  `);

  for (const table of GAMES) {
    pgm.addColumn(table, { code: { type: 'text', check: 'code IS NULL OR char_length(code) = 6' } });
    pgm.createIndex(table, 'code', { unique: true, where: 'code IS NOT NULL' });
    // lobbies already open get theirs now, before the default exists, so none is left without one
    pgm.sql(`UPDATE ${table} SET code = new_game_code() WHERE status = 'lobby'`);
    pgm.sql(`ALTER TABLE ${table} ALTER COLUMN code SET DEFAULT new_game_code()`);
    pgm.sql(`
      CREATE TRIGGER ${table}_release_code
      BEFORE INSERT OR UPDATE OF status ON ${table}
      FOR EACH ROW EXECUTE FUNCTION release_game_code()
    `);
  }
};

export const down = (pgm) => {
  for (const table of GAMES) {
    pgm.sql(`DROP TRIGGER IF EXISTS ${table}_release_code ON ${table}`);
    pgm.dropColumn(table, 'code');
  }
  pgm.sql('DROP FUNCTION IF EXISTS release_game_code()');
  pgm.sql('DROP FUNCTION IF EXISTS new_game_code()');
};
