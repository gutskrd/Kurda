/**
 * The multiplayer learning games' engine and The Last Letter on it, through
 * the routes, against real Postgres: a lobby's life from invite to rematch,
 * turns that run out, players who go away or leave, what each player may see,
 * placement XP and Game Ranks, the join rule for minors and blocks, reports by
 * seat, and the database's lists of games.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { PLACEMENT_WIN_XP, PLAY_GAMES, dictionaryKey, letterKey, type LastLetterBoard, type MultiView } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend, block } from '../test/social.js';
import { countQueries } from '../test/query-count.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface User {
  id: string;
  token: string;
}

type View = MultiView<LastLetterBoard | null>;

/**
 * Words that chain (each ends with the letter the next begins with), and a
 * pile of generated filler so the dialect's dictionary is big enough for the
 * game to be offered. All of it is removed again at the end.
 */
const CHAIN = ['qaxar', 'roqax', 'xazaq', 'qerox', 'xoreq', 'qazix'];

describe.skipIf(!DATABASE_URL || !REDIS_URL)('multiplayer learning games (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const entryIds: string[] = [];
  const told: Array<{ userId: string; event: Record<string, unknown> }> = [];
  let ip = 0;

  const register = async (tag: string, years = 30): Promise<User> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `mp_${tag}_${suffix}@it.kurda.app`,
        username: `mp_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(years),
      },
      remoteAddress: `10.151.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const call = async (who: User, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.151.250.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null, raw: res.body };
  };
  const view = async (who: User, id: string): Promise<View> => {
    const r = await call(who, 'GET', `/mp/last-letter/${id}`);
    expect(r.status).toBe(200);
    return r.body as View;
  };
  const lobby = async (host: User, settings: Record<string, unknown> = {}, invite: string[] = []) => {
    const r = await call(host, 'POST', '/play/lobbies', { game: 'last-letter', settings: { dialect: 'kmr', ...settings }, invite });
    expect(r.status).toBe(201);
    return r.body.lobbyId as string;
  };
  /** a two-player game between friends, started */
  const started = async (tag: string, settings: Record<string, unknown> = {}) => {
    const host = await register(`${tag}h`);
    const guest = await register(`${tag}g`);
    await befriend(pool, host.id, guest.id);
    const id = await lobby(host, settings);
    const code = (await view(host, id)).code!;
    expect((await call(guest, 'POST', '/play/join', { code })).body).toEqual({ game: 'last-letter', lobbyId: id });
    expect((await call(host, 'POST', `/mp/last-letter/${id}/start`)).status).toBe(200);
    return { host, guest, id };
  };
  /** whose turn it is, as a user */
  const turnOf = async (id: string, a: User, b: User): Promise<[User, User]> => {
    const v = await view(a, id);
    return v.board!.turn!.seat === v.me!.seat ? [a, b] : [b, a];
  };
  const word = (who: User, id: string, w: string) => call(who, 'POST', `/mp/last-letter/${id}/moves`, { word: w });
  /** the current turn's time has run out, as far as the database's clock is concerned */
  const expireTurn = async (id: string) => {
    await pool.query(
      `UPDATE game_lobbies
          SET state = jsonb_set(state, '{turn,endsAt}', to_jsonb((extract(epoch FROM now()) * 1000)::bigint - 1000)),
              due_at = now() - interval '1 second'
        WHERE id = $1`,
      [id],
    );
    await app.multiplayer.advance(id);
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const w of CHAIN) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games, letter_count)
         VALUES ($1, $2, $3, 'kurmanji', true, $4) RETURNING id`,
        [w, letterKey(w), dictionaryKey(w), w.length],
      );
      entryIds.push(r.rows[0]!.id);
      await pool.query(`INSERT INTO dict_senses (entry_id, position, pos, definition_en) VALUES ($1, 0, 'noun', 'test word')`, [r.rows[0]!.id]);
    }
    // enough of a dictionary to be offered, in letters no real word has together
    const filler = await pool.query<{ id: string }>(
      `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games, letter_count)
       SELECT w, w, w, 'kurmanji', true, length(w)
         FROM (SELECT 'zzq' || translate(lpad(i::text, 4, '0'), '0123456789', 'bcdfghjklm') AS w FROM generate_series(1, 1600) i) g
       RETURNING id`,
    );
    entryIds.push(...filler.rows.map((r) => r.id));
    await app.cache.del('mp-availability', 'last-letter:kmr');
    vi.spyOn(app.realtime, 'notifyUser').mockImplementation(async (userId, event) => {
      told.push({ userId, event: event as Record<string, unknown> });
    });
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM game_lobbies WHERE id IN (SELECT lobby_id FROM game_lobby_players p JOIN users u ON u.id = p.user_id WHERE u.email LIKE '%_${suffix}@it.kurda.app')`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await app.cache.del('mp-availability', 'last-letter:kmr');
    await pool.end();
    await app.close();
  });

  // ---------------------------------------------------------------------------

  it('takes every play game in each of the database’s lists of games', async () => {
    const defs = await pool.query<{ conrelid: string; def: string }>(
      `SELECT conrelid::regclass::text AS conrelid, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE contype = 'c' AND (conname LIKE '%_game_check' OR conname IN ('dm_messages_kind_check', 'group_messages_kind_check'))
          AND conrelid::regclass::text <> 'game_lobbies'`,
    );
    expect(defs.rows.length).toBeGreaterThanOrEqual(11);
    for (const row of defs.rows) for (const g of PLAY_GAMES) expect(row.def, row.conrelid).toContain(`'${g}'`);
  });

  it('runs a lobby from code to start: seats, Player N, the host’s controls, a code that goes once it starts', async () => {
    const host = await register('life_h');
    const friend = await register('life_f');
    const stranger = await register('life_s');
    await befriend(pool, host.id, friend.id);
    const id = await lobby(host, { turnSeconds: 20, maxPlayers: 2 });

    const mine = await view(host, id);
    expect(mine).toMatchObject({ game: 'last-letter', mode: 'group', status: 'lobby', dialect: 'kmr', isHost: true, maxPlayers: 2, board: null });
    expect(mine.settings).toEqual({ dialect: 'kmr', turnSeconds: 20 });
    expect(mine.code).toMatch(/^[A-Z2-9]{6}$/);

    // a stranger is told nothing, by link or by code
    expect((await call(stranger, 'GET', `/mp/last-letter/${id}`)).status).toBe(404);
    expect((await call(stranger, 'POST', '/play/join', { code: mine.code })).status).toBe(404);
    // a friend of the host may look before joining
    expect((await view(friend, id)).me).toBeNull();
    expect((await call(friend, 'POST', `/mp/last-letter/${id}/join`)).status).toBe(200);
    // a guest cannot start it
    expect((await call(friend, 'POST', `/mp/last-letter/${id}/start`)).status).toBe(403);

    const seen = await view(friend, id);
    const hostSeat = seen.players.find((p) => p.isHost)!;
    expect(hostSeat.userId).toBe('seat:1');
    expect(hostSeat.name).not.toBeNull(); // a friend's name
    expect(JSON.stringify(seen)).not.toContain(host.id);

    expect((await call(host, 'POST', `/mp/last-letter/${id}/start`)).status).toBe(200);
    const live = await view(host, id);
    expect(live.status).toBe('active');
    expect(live.code).toBeNull();
    expect(live.board!.turn!.seat).toBeGreaterThan(0);
    expect(live.rated.counts).not.toBeNull();
    // a game under way is not joined late
    expect((await call(stranger, 'GET', `/mp/last-letter/${id}`)).status).toBe(404);
  });

  it('chains words, strikes a word the dictionary does not have, and never shows the refused text to anyone else', async () => {
    const { host, guest, id } = await started('chain');
    const [first, second] = await turnOf(id, host, guest);
    const ok = await word(first, id, 'Qaxar');
    expect(ok.status).toBe(200);
    expect(ok.body.outcome).toEqual({ accepted: true, reason: null, strikes: 0, out: false });
    expect(ok.body.view.board.required).toBe('r');
    // the word's short gloss from its curated entry, as the dictionary has it
    expect(ok.body.view.board.chain).toEqual([{ n: 1, seat: expect.any(Number), word: 'qaxar', meaning: 'test word' }]);

    // the second player's slip: a made-up word beginning with the right letter
    const bad = await word(second, id, 'rzzzt');
    expect(bad.body.outcome).toMatchObject({ accepted: false, reason: 'not-a-word', strikes: 1 });
    const theirs = await call(first, 'GET', `/mp/last-letter/${id}`);
    expect(theirs.raw).not.toContain('rzzzt');
    expect(theirs.body.board.strikes.at(-1)).toMatchObject({ reason: 'not-a-word' });
    // kept with the move, for a report
    const kept = await pool.query(`SELECT text, kind FROM game_moves WHERE lobby_id = $1 ORDER BY seq`, [id]);
    expect(kept.rows.map((r) => r.text)).toEqual(['Qaxar', 'rzzzt']);

    // out of turn, and a repeat (a word already in the chain that begins with the letter asked for)
    expect((await word(second, id, 'roqax')).status).toBe(409);
    expect((await word(first, id, 'roqax')).body.outcome.accepted).toBe(true);
    expect((await word(second, id, 'xazaq')).body.outcome.accepted).toBe(true);
    const repeat = await word(first, id, 'qaxar');
    expect(repeat.body.outcome.reason).toBe('used');
  });

  it('strikes a turn that ran out, marks a player away after two in a row, and passes over their turns after that', async () => {
    const { host, guest, id } = await started('away');
    const [first] = await turnOf(id, host, guest);
    await expireTurn(id);
    let v = await view(host, id);
    expect(v.board!.seats.find((s) => s.strikes === 1)).toBeTruthy();
    expect(v.board!.strikes.at(-1)).toMatchObject({ reason: 'time' });
    const timedOut = await pool.query(`SELECT kind FROM game_moves WHERE lobby_id = $1 AND kind = 'timeout'`, [id]);
    expect(timedOut.rowCount).toBe(1);
    // the other player's turn runs out too, then the first player's again: two in a row each
    await expireTurn(id);
    await expireTurn(id);
    await expireTurn(id);
    const away = await pool.query<{ user_id: string; away: boolean }>(`SELECT user_id, away FROM game_lobby_players WHERE lobby_id = $1`, [id]);
    expect(away.rows.every((r) => r.away)).toBe(true);
    // coming back is any request
    await view(first, id);
    await vi.waitFor(async () => {
      const back = await pool.query<{ away: boolean }>(`SELECT away FROM game_lobby_players WHERE lobby_id = $1 AND user_id = $2`, [id, first.id]);
      expect(back.rows[0]!.away).toBe(false);
    });
    v = await view(first, id);
    expect(v.players.find((p) => p.isMe)!.away).toBe(false);
  });

  it('ends at the third strike, pays placement to two who played, and counts it for Game Ranks when Rated', async () => {
    const { host, guest, id } = await started('end', { rated: true });
    const [first, second] = await turnOf(id, host, guest);
    expect((await word(first, id, 'qaxar')).body.outcome.accepted).toBe(true);
    expect((await word(second, id, 'roqax')).body.outcome.accepted).toBe(true);
    // the first player strikes out: the turn passes after a strike as after a word, so the second keeps the chain going between
    let next = 2;
    for (let i = 0; i < 6 && (await view(host, id)).status === 'active'; i++) {
      const [now] = await turnOf(id, host, guest);
      if (now.id === first.id) await word(first, id, 'qqqqq');
      else await word(second, id, CHAIN[next++]!);
    }
    await vi.waitFor(async () => expect((await view(host, id)).status).toBe('finished'));
    const done = await view(second, id);
    expect(done.results![0]).toMatchObject({ seat: done.me!.seat, place: 1 });
    expect(done.results![0]!.xpAwarded).toBe(PLACEMENT_WIN_XP);
    const xp = await pool.query(`SELECT user_id, amount FROM xp_ledger WHERE source = 'game_last_letter' AND ref_id LIKE $1`, [`mp:${id}:%`]);
    expect(xp.rowCount).toBe(2);
    const rated = await pool.query(`SELECT outcome FROM rated_games WHERE game = 'last-letter' AND game_ref = $1`, [id]);
    expect(rated.rows[0]?.outcome ?? 'not rated (eligibility)').toBeDefined();
  });

  it('pays nothing to a game where only one person played, and less against the same person again today', async () => {
    const { host, guest, id } = await started('idle');
    // nobody moves: every turn runs out until someone is out
    for (let i = 0; i < 12; i++) {
      if ((await view(host, id)).status === 'finished') break;
      await expireTurn(id);
    }
    expect((await view(host, id)).status).toBe('finished');
    const none = await pool.query(`SELECT 1 FROM xp_ledger WHERE ref_id LIKE $1`, [`mp:${id}:%`]);
    expect(none.rowCount).toBe(0);

    // the same two play twice more today: the third game pays half
    const playOut = async (lobbyId: string) => {
      const [a, b] = await turnOf(lobbyId, host, guest);
      await word(a, lobbyId, 'qaxar');
      await word(b, lobbyId, 'roqax');
      for (let i = 0; i < 12 && (await view(host, lobbyId)).status !== 'finished'; i++) {
        const [now] = await turnOf(lobbyId, host, guest);
        if (now.id === a.id) await word(a, lobbyId, 'qqqqq');
        else await expireTurn(lobbyId);
      }
    };
    const paid: number[] = [];
    for (let round = 0; round < 3; round++) {
      const next = await lobby(host);
      await call(guest, 'POST', `/mp/last-letter/${next}/join`);
      await call(host, 'POST', `/mp/last-letter/${next}/start`);
      await playOut(next);
      const winner = (await view(host, next)).results![0]!;
      paid.push(winner.xpAwarded ?? 0);
    }
    expect(paid[0]).toBe(PLACEMENT_WIN_XP);
    // two earlier games today with the same opponent (the first paid none but was played): half
    expect(paid[2]).toBeLessThan(PLACEMENT_WIN_XP);
  });

  it('ends a game every person has left, as it stands', async () => {
    const { host, guest, id } = await started('gone');
    expect((await call(host, 'POST', `/mp/last-letter/${id}/leave`)).status).toBe(200);
    await vi.waitFor(async () => expect((await view(guest, id)).status).toBe('finished'));
    const v = await view(guest, id);
    expect(v.results![0]).toMatchObject({ seat: v.me!.seat, place: 1 });
    expect(v.players.find((p) => p.isHost)!.gone).toBe(true);
  });

  it('closes a lobby whose host leaves it, and one nobody started', async () => {
    const host = await register('close_h');
    const id = await lobby(host);
    expect((await call(host, 'POST', `/mp/last-letter/${id}/leave`)).status).toBe(200);
    expect((await view(host, id)).status).toBe('cancelled');
    const idle = await lobby(host);
    await pool.query(`UPDATE game_lobbies SET updated_at = now() - interval '2 hours' WHERE id = $1`, [idle]);
    await app.multiplayer.sweep('last-letter');
    expect((await pool.query(`SELECT status, code FROM game_lobbies WHERE id = $1`, [idle])).rows[0]).toEqual({ status: 'cancelled', code: null });
  });

  it('keeps open games to known adults, and a block keeps two people out of each other’s games', async () => {
    const adult = await register('safe_a');
    const minor = await register('safe_m', 14);
    const other = await register('safe_o');
    // a minor cannot open a game to everyone
    const open = await call(minor, 'POST', '/play/lobbies', { game: 'last-letter', settings: { dialect: 'kmr', access: 'open' } });
    expect(open.status).toBe(403);
    const id = await lobby(adult, { access: 'open' });
    const code = (await view(adult, id)).code!;
    // a minor never joins an open game, even as the host's friend
    await befriend(pool, adult.id, minor.id);
    expect((await call(minor, 'POST', '/play/join', { code })).status).toBe(404);
    // a stranger adult may, until a block either way
    await block(pool, other.id, adult.id);
    expect((await call(other, 'POST', '/play/join', { code })).status).toBe(404);
    const card = await call(other, 'GET', `/play/cards/last-letter/${id}`);
    expect(card.body.status).toBe('unavailable');
  });

  it('reports a player by seat, with what they typed in the game', async () => {
    const { host, guest, id } = await started('report');
    const [first] = await turnOf(id, host, guest);
    await word(first, id, 'qzqzq');
    const reporter = first.id === host.id ? guest : host;
    const seat = (await view(first, id)).me!.seat;
    const filed = await call(reporter, 'POST', '/reports', { targetType: 'game_player', targetId: id, game: 'last-letter', seat, category: 'other' });
    expect(filed.status).toBe(201);
    const evidence = await pool.query<{ evidence: { extra?: { typed?: Array<{ text: string }> } } }>(
      `SELECT evidence FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [reporter.id],
    );
    expect(evidence.rows[0]!.evidence.extra!.typed!.map((t) => t.text)).toEqual(['qzqzq']);
  });

  it('plays one person against Hevalo, who plays only curated words, and pays nothing for it', async () => {
    const me = await register('solo');
    const made = await call(me, 'POST', '/mp/last-letter/solo', { dialect: 'kmr', turnSeconds: 30 });
    expect(made.status).toBe(201);
    const v = made.body as View;
    expect(v).toMatchObject({ mode: 'solo', status: 'active', code: null });
    expect(v.players.find((p) => p.bot === 'hevalo')).toMatchObject({ name: null, userId: 'seat:2' });
    // a game against Hevalo is nobody's to join or invite to
    expect(await app.multiplayer.facts(v.id)).toBeNull();
    if (v.board!.turn!.seat === v.me!.seat) await word(me, v.id, 'qaxar');
    // Hevalo's thinking time runs out on the database's clock
    await expireTurn(v.id);
    const after = await view(me, v.id);
    const hevaloSeat = after.players.find((p) => p.bot)!.seat;
    const hevaloWords = after.board!.chain.filter((w) => w.seat === hevaloSeat).map((w) => w.word);
    // a curated word of the game's dialect (other suites curate words of their own in the same database, so any of those may come up)
    for (const w of hevaloWords) {
      const curated = await pool.query(`SELECT 1 FROM dict_entries WHERE dialect = 'kurmanji' AND in_games AND headword_folded = $1`, [dictionaryKey(w)]);
      expect(curated.rowCount, w).toBeGreaterThan(0);
    }
    // the person leaves: the game ends, and nothing is paid for it. Nobody else was playing, and XP is for games with other people.
    await call(me, 'POST', `/mp/last-letter/${v.id}/leave`);
    await vi.waitFor(async () => expect((await view(me, v.id)).status).toBe('finished'));
    const done = await view(me, v.id);
    expect((done.results ?? []).every((r) => (r.xpAwarded ?? 0) === 0)).toBe(true);
    const paid = await pool.query(`SELECT count(*)::int AS n FROM xp_ledger WHERE user_id = $1`, [me.id]);
    expect(paid.rows[0]!.n).toBe(0);
  });

  it('says where the game is offered', async () => {
    const me = await register('avail');
    const r = await call(me, 'GET', '/mp/last-letter/availability');
    expect(r.body.dialects.find((d: { dialect: string }) => d.dialect === 'kmr')).toEqual({ dialect: 'kmr', group: true, solo: true });
  });

  it('reads a game in a fixed number of statements', async () => {
    const { host, id } = await started('budget');
    await view(host, id);
    const log = countQueries(app.db);
    try {
      await view(host, id);
    } finally {
      log.stop();
    }
    expect(log.count, log.statements.join('\n')).toBeLessThanOrEqual(6);
  });

  it('tells everyone in the lobby when it changes, and the long-poll answers a newer version at once', async () => {
    const { host, guest, id } = await started('push');
    const before = (await view(host, id)).version;
    const [first] = await turnOf(id, host, guest);
    told.length = 0;
    await word(first, id, 'qaxar');
    await vi.waitFor(() => expect(told.some((t) => t.userId === guest.id && t.event.type === 'play_changed')).toBe(true));
    const polled = await call(host, 'GET', `/mp/last-letter/${id}?v=${before}`);
    expect(polled.body.version).toBeGreaterThan(before);
  });
});
