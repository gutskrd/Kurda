/** The play layer's timer: invites past their time, and old rows, against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { dictionaryKey, letterKey } from '@kurda/shared';
import { WordleBattleService } from '../game/wordle-battle-service.js';
import { FriendService } from '../friends/service.js';
import { WordleBattleAdapter } from './adapters/wordle-battle.js';
import { PlayEvents, type PlayNotifier } from './events.js';
import { PlayService } from './service.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';

const DATABASE_URL = process.env.DATABASE_URL;

class FakeNotifier implements PlayNotifier {
  told: Array<{ userId: string; event: Record<string, unknown> }> = [];
  async notifyUser(userId: string, event: Record<string, unknown>): Promise<void> {
    this.told.push({ userId, event });
  }
  async publish(): Promise<void> {}
}

describe.skipIf(!DATABASE_URL)('play sweep (integration)', () => {
  let pool: pg.Pool;
  let play: PlayService;
  let events: PlayEvents;
  const notifier = new FakeNotifier();
  const suffix = Math.random().toString(36).slice(2, 8);
  const users: string[] = [];
  const entryIds: string[] = [];
  const clock = { t: new Date() };

  const makeUser = async (): Promise<string> => {
    const n = users.length;
    const birth = bornYearsAgo(30);
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month) VALUES ($1, $2, $3, $4) RETURNING id`,
      [`psw_${n}_${suffix}@it.kurda.app`, `psw_${n}_${suffix}`, birth.birthYear, birth.birthMonth],
    );
    users.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const w of ['malan', 'kurdi', 'rojan']) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
         VALUES ($1, $2, $3, 'kurmanji', true) RETURNING id`,
        [w, letterKey(w), dictionaryKey(w)],
      );
      entryIds.push(r.rows[0]!.id);
    }
    events = new PlayEvents(pool, notifier, { coalesceMs: 0 });
    play = new PlayService(pool, {
      adapters: [new WordleBattleAdapter(new WordleBattleService(pool, { now: () => clock.t }))],
      events,
      friends: new FriendService(pool),
      inbox: { record: async () => undefined },
      chat: { sendCard: async () => undefined },
      groupChat: { sendCard: async () => undefined },
      groups: { memberRole: async () => null },
      now: () => clock.t,
    });
  });

  afterAll(async () => {
    events.close();
    if (users.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [users]);
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
  });

  it('expires invites past their time, telling both sides; deletes old answered invites at most hourly', async () => {
    clock.t = new Date();
    const host = await makeUser();
    const friend = await makeUser();
    await befriend(pool, host, friend);
    const made = await play.createLobby(host, { game: 'wordle-battle', settings: {}, invite: [friend] });
    expect(made.invited).toBe(1);
    const invite = (await pool.query<{ id: string }>(`SELECT id FROM play_invites WHERE lobby_id = $1`, [made.lobbyId])).rows[0]!;

    // an old answered invite, kept past its 30 days
    const old = await pool.query<{ id: string }>(
      `INSERT INTO play_invites (game, lobby_id, host_id, invitee_id, status, created_at, expires_at)
       VALUES ('wordle-battle', gen_random_uuid(), $1, $2, 'declined', now() - interval '31 days', now() - interval '31 days')
       RETURNING id`,
      [host, friend],
    );

    clock.t = new Date(clock.t.getTime() + 16 * 60_000); // past INVITE_TTL_MINUTES
    notifier.told = [];
    await play.sweep();
    const status = (await pool.query<{ status: string }>(`SELECT status FROM play_invites WHERE id = $1`, [invite.id])).rows[0]!.status;
    expect(status).toBe('expired');
    const updates = notifier.told.filter((t) => t.event.type === 'play_invite_update');
    expect(updates.map((u) => u.userId).sort()).toEqual([friend, host].sort());
    expect((await pool.query(`SELECT 1 FROM play_invites WHERE id = $1`, [old.rows[0]!.id])).rowCount).toBe(0);

    // within the hour, the cleanup does not run again
    const again = await pool.query<{ id: string }>(
      `INSERT INTO play_invites (game, lobby_id, host_id, invitee_id, status, created_at, expires_at)
       VALUES ('wordle-battle', gen_random_uuid(), $1, $2, 'declined', now() - interval '31 days', now() - interval '31 days')
       RETURNING id`,
      [host, friend],
    );
    await play.sweep();
    expect((await pool.query(`SELECT 1 FROM play_invites WHERE id = $1`, [again.rows[0]!.id])).rowCount).toBe(1);
  });
});
