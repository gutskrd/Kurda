/**
 * An invite holds at most one pool connection at a time, against real
 * Postgres: a request that holds one connection and asks the pool for another
 * is how a burst of them takes every connection and waits on itself. Run here
 * on a pool of one, where any such request cannot finish at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { dictionaryKey, letterKey } from '@kurda/shared';
import { WordleBattleService } from '../game/wordle-battle-service.js';
import { FriendService } from '../friends/service.js';
import { WordleBattleAdapter } from './adapters/wordle-battle.js';
import { PlayEvents } from './events.js';
import { PlayService } from './service.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('play invites on a pool of one (integration)', () => {
  let pool: pg.Pool;
  let tight: pg.Pool;
  let events: PlayEvents;
  const suffix = Math.random().toString(36).slice(2, 8);
  const users: string[] = [];
  const entryIds: string[] = [];

  const makeUser = async (): Promise<string> => {
    const n = users.length;
    const birth = bornYearsAgo(30);
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month) VALUES ($1, $2, $3, $4) RETURNING id`,
      [`pip_${n}_${suffix}@it.kurda.app`, `pip_${n}_${suffix}`, birth.birthYear, birth.birthMonth],
    );
    users.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // one connection, and a short wait for it: a nested checkout fails fast instead of hanging
    tight = new pg.Pool({ connectionString: DATABASE_URL, max: 1, connectionTimeoutMillis: 2000 });
    for (const w of ['malan', 'kurdi', 'rojan']) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
         VALUES ($1, $2, $3, 'kurmanji', true) RETURNING id`,
        [w, letterKey(w), dictionaryKey(w)],
      );
      entryIds.push(r.rows[0]!.id);
    }
  });

  afterAll(async () => {
    events?.close();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (users.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [users]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await tight.end();
    await pool.end();
  });

  it('inviting an earlier player to the next round reads the earlier game outside the invite’s transaction', async () => {
    const host = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    for (const u of [a, b]) await befriend(pool, host, u);

    // a finished three-player battle and its next round, set up on an ordinary pool
    const battles = new WordleBattleService(pool);
    const created = await battles.create(host, { difficulty: 'medium' });
    if (!created.ok) throw new Error(created.reason);
    const first = created.battle.id;
    for (const u of [a, b]) expect((await battles.join(first, u)).ok).toBe(true);
    expect((await battles.start(first, host)).ok).toBe(true);
    const target = (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [first])).rows[0]!.target;
    for (const u of [host, a, b]) expect((await battles.guess(first, u, target)).ok).toBe(true);
    const round = await battles.openNextRound(host, first);
    if (!round.ok) throw new Error(round.reason);

    // the play layer on one connection
    events = new PlayEvents(tight, { notifyUser: async () => undefined, publish: async () => undefined }, { coalesceMs: 0 });
    const play = new PlayService(tight, {
      adapters: [new WordleBattleAdapter(new WordleBattleService(tight))],
      events,
      friends: new FriendService(tight),
      inbox: { record: async () => undefined },
      chat: { sendCard: async () => undefined },
      groupChat: { sendCard: async () => undefined },
      groups: { memberRole: async () => null },
    });
    expect(await play.invite(host, 'wordle-battle', round.id, [b])).toEqual({ invited: 1 });
    const row = await pool.query<{ rematch_of: string | null }>(
      `SELECT rematch_of FROM play_invites WHERE lobby_id = $1 AND invitee_id = $2`,
      [round.id, b],
    );
    // and it still says "again": b played the battle this round follows
    expect(row.rows[0]!.rematch_of).toBe(first);
  });
});
