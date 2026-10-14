/**
 * Migration 1751000171000 against real Postgres: the frozen Elo moves into
 * Game Ranks (μ = 25 + (Elo − 1000)/48, σ = 4 with 20+ games else 6), into the
 * game a player's history was played in when it says, Wordle Battle otherwise;
 * the old numbers stay in the migration event; the old tables go. Run down and
 * up through node-pg-migrate itself, as `migrate down`/`migrate up` would.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { pointsOf } from '@kurda/shared';
import { deleteUsers, rankedUser } from '../test/ranks.js';

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

async function migrate(direction: 'up' | 'down', file: string): Promise<void> {
  await runner({
    databaseUrl: DATABASE_URL!,
    dir: MIGRATIONS,
    migrationsTable: 'pgmigrations',
    direction,
    file,
    // later migrations stay applied while this one goes down and up
    checkOrder: false,
    log: () => undefined,
  });
}

describe.skipIf(!DATABASE_URL)('the Elo → OpenSkill migration (integration)', () => {
  let pool: pg.Pool;
  const userIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    // whatever happened above, the schema is left migrated
    const gone = await pool.query(`SELECT to_regclass('player_ratings') IS NOT NULL AS back`);
    if (gone.rows[0].back) await migrate('up', '1751000171000_elo-to-openskill');
    await deleteUsers(pool, userIds);
    await pool.end();
  });

  it('carries each rating over by the formula, into the right game, and drops the old tables', async () => {
    const veteran = await rankedUser(pool, `mig_v_${suffix}`);
    const rhymer = await rankedUser(pool, `mig_r_${suffix}`);
    const unplayed = await rankedUser(pool, `mig_u_${suffix}`);
    userIds.push(veteran, rhymer, unplayed);

    await migrate('down', '1751000171000_elo-to-openskill');
    // a rhyme match the rhymer's rated history points at
    const match = await pool.query<{ id: string }>(
      `INSERT INTO rhyme_matches (created_by, prompt, window_ms) VALUES ($1, 'dil', 60000) RETURNING id`,
      [rhymer],
    );
    await pool.query(
      `INSERT INTO player_ratings (user_id, rating, games_played) VALUES ($1, 1480, 25), ($2, 904, 6), ($3, 1000, 0)`,
      [veteran, rhymer, unplayed],
    );
    await pool.query(
      `INSERT INTO rating_history (user_id, game_room_id, rating_before, rating_after, delta, rank)
       VALUES ($1, 'quiz:room:1', 1460, 1480, 20, 1), ($2, $3, 920, 904, -16, 2)`,
      [veteran, rhymer, match.rows[0]!.id],
    );
    await migrate('up', '1751000171000_elo-to-openskill');

    const rows = await pool.query<{ user_id: string; game: string; mu: number; sigma: number; points: number; placement_done: boolean }>(
      `SELECT user_id, game, mu, sigma, points, placement_done FROM game_ratings WHERE user_id = ANY($1::uuid[]) ORDER BY game`,
      [userIds],
    );
    const v = rows.rows.find((r) => r.user_id === veteran)!;
    expect(v.game).toBe('wordle-battle'); // a quiz room: no current game, so Wordle Battle
    expect(Number(v.mu)).toBeCloseTo(25 + 480 / 48, 9); // 35
    expect(Number(v.sigma)).toBe(4);
    expect(v.points).toBe(pointsOf(35, 4));
    expect(v.placement_done).toBe(true);
    const r = rows.rows.find((x) => x.user_id === rhymer)!;
    expect(r.game).toBe('rhyme-match');
    expect(Number(r.mu)).toBeCloseTo(25 - 96 / 48, 9); // 23
    expect(Number(r.sigma)).toBe(6);
    expect(r.points).toBe(pointsOf(23, 6));
    // nothing to carry for someone who never finished a rated game
    expect(rows.rows.some((x) => x.user_id === unplayed)).toBe(false);

    const ev = await pool.query<{ kind: string; state_before: { elo: number; eloGames: number } }>(
      `SELECT kind, state_before FROM rating_events WHERE user_id = $1`,
      [veteran],
    );
    expect(ev.rows).toEqual([{ kind: 'migration', state_before: { elo: 1480, eloGames: 25 } }]);

    const tables = await pool.query(
      `SELECT to_regclass('player_ratings') IS NULL AS ratings_gone, to_regclass('rating_history') IS NULL AS history_gone,
              NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('rating', 'rating_games')) AS columns_gone`,
    );
    expect(tables.rows[0]).toEqual({ ratings_gone: true, history_gone: true, columns_gone: true });
  });
});
