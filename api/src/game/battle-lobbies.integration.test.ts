/**
 * Wordle Battle and Rhyme Match lobbies under the rules every online game
 * shares (contract §B2): members only, the join rule, players as seats with
 * names only for friends, leaving and removing, idle lobbies, a battle that
 * cannot hang, the latecomer's answer, prompts in the match's own dialect,
 * and a `play_changed` after every change. Against real Postgres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOBBY_IDLE_MINUTES, dictionaryKey, letterKey } from '@kurda/shared';
import pg from 'pg';
import { AWAY_SECONDS, BATTLE_MINUTES, WordleBattleService } from './wordle-battle-service.js';
import { RhymeMatchService } from './rhyme-match-service.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend, block } from '../test/social.js';
import type { LobbyChange } from '../play/types.js';

const DATABASE_URL = process.env.DATABASE_URL;

const WORDS = ['malan', 'kurdi', 'rojan', 'zarok', 'aveji', 'bajar', 'welat', 'zanik'];
const RHYMES = ['gul', 'kul', 'pul', 'bul'];
// Soranî words for a Soranî match's prompt
const SORANI = ['گوڵ', 'کوڵ'];

describe.skipIf(!DATABASE_URL)('battle lobbies (integration)', () => {
  let pool: pg.Pool;
  const suffix = Math.random().toString(36).slice(2, 8);
  const users: string[] = [];
  const entryIds: string[] = [];
  const clock = { t: new Date() };
  const changed: string[] = [];
  /** changes no chat card shows (`card: false`), which the group room is spared */
  const quiet: string[] = [];
  let wordle: WordleBattleService;
  let rhyme: RhymeMatchService;

  const makeUser = async (age: 'adult' | 'minor' = 'adult'): Promise<string> => {
    const n = users.length;
    const birth = bornYearsAgo(age === 'adult' ? 30 : 15);
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, display_name, birth_year, birth_month) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`bl_${n}_${suffix}@it.kurda.app`, `bl_${n}_${suffix}`, `Name ${n}`, birth.birthYear, birth.birthMonth],
    );
    users.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };
  const addWord = async (w: string, dialect: string): Promise<void> => {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [w, letterKey(w), dictionaryKey(w), dialect],
    );
    entryIds.push(r.rows[0]!.id);
  };
  const later = (ms: number) => {
    clock.t = new Date(clock.t.getTime() + ms);
  };
  const targetOf = async (id: string) =>
    (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [id])).rows[0]!.target;
  /** a lobby of `host` with `others` joined (each made a friend of the host first) */
  const battleWith = async (host: string, ...others: string[]): Promise<string> => {
    const created = await wordle.create(host, { difficulty: 'medium' });
    if (!created.ok) throw new Error(created.reason);
    for (const o of others) {
      await befriend(pool, host, o);
      const joined = await wordle.join(created.battle.id, o);
      if (!joined.ok) throw new Error(joined.reason);
    }
    return created.battle.id;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const deps = {
      now: () => clock.t,
      onChange: (id: string, o?: LobbyChange) => {
        changed.push(id);
        if (o?.card === false) quiet.push(id);
      },
    };
    wordle = new WordleBattleService(pool, deps);
    rhyme = new RhymeMatchService(pool, deps);
    for (const w of WORDS) await addWord(w, 'kurmanji');
    for (const w of RHYMES) await addWord(w, 'kurmanji');
  });

  beforeEach(() => {
    clock.t = new Date();
    changed.length = 0;
    quiet.length = 0;
  });

  afterAll(async () => {
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
    await pool.end();
  });

  describe('Wordle Battle', () => {
    it('only members read a battle; a friend may look at the lobby first; a latecomer hears it started; a stranger, that it does not exist', async () => {
      const host = await makeUser();
      const friend = await makeUser();
      const latecomer = await makeUser();
      const stranger = await makeUser();
      await befriend(pool, host, friend);
      await befriend(pool, host, latecomer);
      const created = await wordle.create(host, { difficulty: 'medium' });
      if (!created.ok) throw new Error(created.reason);
      const id = created.battle.id;

      const preview = await wordle.read(id, friend);
      expect(preview.ok && preview.battle.status).toBe('lobby');
      expect(preview.ok && preview.battle.me).toBeNull();
      expect(await wordle.read(id, stranger)).toEqual({ ok: false, reason: 'not-found' });
      // a stranger cannot join either, and is told the same
      expect(await wordle.join(id, stranger)).toEqual({ ok: false, reason: 'not-found' });

      expect((await wordle.join(id, friend)).ok).toBe(true);
      expect((await wordle.start(id, host)).ok).toBe(true);
      expect(await wordle.read(id, latecomer)).toEqual({ ok: false, reason: 'started' });
      expect(await wordle.read(id, stranger)).toEqual({ ok: false, reason: 'not-found' });
      // the join rule comes before "already started", so a stranger learns nothing
      expect(await wordle.join(id, latecomer)).toEqual({ ok: false, reason: 'not-open' });
      expect(await wordle.join(id, stranger)).toEqual({ ok: false, reason: 'not-found' });
      expect(await wordle.isMember(id, stranger)).toBe(false);
      expect(await wordle.isMember(id, friend)).toBe(true);
    });

    it("players are seats to each other: a name only for a friend, and never another player's account id", async () => {
      const host = await makeUser();
      const a = await makeUser();
      const b = await makeUser();
      const id = await battleWith(host, a, b); // a and b are the host's friends, not each other's
      expect((await wordle.start(id, host)).ok).toBe(true);
      const target = await targetOf(id);
      for (const p of [host, a, b]) await wordle.guess(id, p, target);

      const view = await wordle.state(id, a);
      expect(view.createdBy).toBe('seat:1');
      expect(view.isHost).toBe(false);
      expect(view.players.map((p) => [p.seat, p.userId, p.name !== null, p.isMe])).toEqual([
        [1, 'seat:1', true, false], // the host: a friend
        [2, a, false, true], // me
        [3, 'seat:3', false, false], // not my friend: "Player 3"
      ]);
      const results = await wordle.results(id, a);
      // no other member's uuid anywhere in what a sees
      for (const shown of [JSON.stringify(view), JSON.stringify(results)]) {
        expect(shown).not.toContain(host);
        expect(shown).not.toContain(b);
        expect(shown).toContain(a);
      }
      expect((await wordle.state(id, host)).createdBy).toBe(host);
    });

    it('in an open battle any adult joins and everyone is named — but never across a block; only an adult opens one', async () => {
      const host = await makeUser();
      const adult = await makeUser();
      const blocker = await makeUser();
      const minor = await makeUser('minor');
      expect(await wordle.create(minor, { difficulty: 'medium', access: 'open' })).toEqual({ ok: false, reason: 'open-needs-adult' });

      const created = await wordle.create(host, { difficulty: 'medium', access: 'open' });
      if (!created.ok) throw new Error(created.reason);
      const id = created.battle.id;
      expect((await wordle.join(id, adult)).ok).toBe(true);
      // a minor with the link is told it does not exist
      expect(await wordle.join(id, minor)).toEqual({ ok: false, reason: 'not-found' });
      expect((await wordle.join(id, blocker)).ok).toBe(true);
      await block(pool, blocker, adult);
      const seen = await wordle.state(id, adult);
      expect(seen.players.find((p) => p.seat === 1)!.name).toBe('Name ' + users.indexOf(host));
      expect(seen.players.find((p) => p.seat === 3)!.name).toBeNull();
    });

    it('leaving: a lobby forgets you; the host leaving calls it off; a battle under way finishes you where you stand', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const b = await makeUser();
      const id = await battleWith(host, a, b);
      expect(await wordle.leave(id, a)).toEqual({ ok: true });
      expect(await wordle.isMember(id, a)).toBe(false);
      expect((await wordle.join(id, a)).ok).toBe(true); // they can come back

      // under way: b leaves mid-battle and is finished, unsolved, but still reads it
      expect((await wordle.start(id, host)).ok).toBe(true);
      await wordle.leave(id, b);
      const bView = await wordle.read(id, b);
      expect(bView.ok && bView.battle.me!.status).toBe('lost');
      expect(bView.ok && bView.battle.status).toBe('active');
      const guessAfter = await wordle.guess(id, b, WORDS[0]!);
      expect(guessAfter).toEqual({ ok: false, reason: 'not-in-match' });
      // the others finishing ends it: nobody waits for b
      const target = await targetOf(id);
      await wordle.guess(id, host, target);
      await wordle.guess(id, a, target);
      expect((await wordle.state(id, host)).status).toBe('finished');
      expect((await wordle.results(id, b))!.ranking).toHaveLength(3);

      // the host leaving a lobby calls it off, for everyone
      const lobby = await battleWith(host, a);
      await wordle.leave(lobby, host);
      expect((await wordle.state(lobby, a)).status).toBe('cancelled');
      expect(await wordle.join(lobby, b)).toEqual({ ok: false, reason: 'not-found' });
    });

    it('the host removes a player by seat, before the start only; to them the battle no longer exists', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const b = await makeUser();
      const id = await battleWith(host, a, b);
      expect(await wordle.remove(id, a, 1)).toEqual({ ok: false, reason: 'forbidden' });
      expect(await wordle.remove(id, host, 1)).toEqual({ ok: false, reason: 'no-seat' }); // not themselves
      expect(await wordle.remove(id, host, 9)).toEqual({ ok: false, reason: 'no-seat' });
      const removed = await wordle.remove(id, host, 3);
      expect(removed.ok && removed.battle.players.map((p) => p.seat)).toEqual([1, 2]);
      // and they hear about it once, though no longer in it
      expect(changed).toContain(id);

      expect(await wordle.read(id, b)).toEqual({ ok: false, reason: 'not-found' });
      expect(await wordle.join(id, b)).toEqual({ ok: false, reason: 'not-found' });
      expect((await wordle.card(b, id)).status).toBe('unavailable');
      // a new player takes a new seat, never b's
      const c = await makeUser();
      await befriend(pool, host, c);
      const joined = await wordle.join(id, c);
      expect(joined.ok && joined.battle.me!.seat).toBe(4);

      expect((await wordle.start(id, host)).ok).toBe(true);
      expect(await wordle.remove(id, host, 2)).toEqual({ ok: false, reason: 'not-lobby' });
    });

    it('a seat is never handed out twice, even after its player left the lobby', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const x = await makeUser();
      const id = await battleWith(host, a, x); // x sits in seat 3, the last one
      expect(await wordle.leave(id, x)).toEqual({ ok: true });
      const y = await makeUser();
      await befriend(pool, host, y);
      const joined = await wordle.join(id, y);
      expect(joined.ok && joined.battle.me!.seat).toBe(4);
      // the host's "remove seat 3", from a screen that still shows x, takes out nobody
      expect(await wordle.remove(id, host, 3)).toEqual({ ok: false, reason: 'no-seat' });
      expect(await wordle.isMember(id, y)).toBe(true);
      // and x coming back is a new seat as well
      const back = await wordle.join(id, x);
      expect(back.ok && back.battle.me!.seat).toBe(5);
    });

    it(`a lobby nobody starts closes after ${LOBBY_IDLE_MINUTES} minutes`, async () => {
      const host = await makeUser();
      const a = await makeUser();
      const id = await battleWith(host, a);
      const late = await makeUser();
      await befriend(pool, host, late);
      later((LOBBY_IDLE_MINUTES + 1) * 60_000);
      expect(await wordle.join(id, late)).toEqual({ ok: false, reason: 'not-found' });
      expect((await wordle.state(id, host)).status).toBe('cancelled');
      expect(await wordle.start(id, host)).toEqual({ ok: false, reason: 'not-lobby' });

      // the sweep closes the ones nobody looks at
      const quiet = await battleWith(host, a);
      later((LOBBY_IDLE_MINUTES + 1) * 60_000);
      changed.length = 0;
      await wordle.sweep();
      expect((await wordle.state(quiet, host)).status).toBe('cancelled');
      expect(changed).toContain(quiet);
    });

    it(`a closed tab cannot hang a battle: it ends ${BATTLE_MINUTES} minutes in, or once nobody racing is around`, async () => {
      const host = await makeUser();
      const a = await makeUser();
      // a solves; host closed the tab — once host is away, the battle ends on a's read
      const id = await battleWith(host, a);
      expect((await wordle.start(id, host)).ok).toBe(true);
      const started = await wordle.state(id, a);
      expect(new Date(started.endsAt!).getTime() - clock.t.getTime()).toBe(BATTLE_MINUTES * 60_000);
      await wordle.guess(id, a, await targetOf(id));
      expect((await wordle.state(id, a)).status).toBe('active'); // host is still around
      later((AWAY_SECONDS + 1) * 1000);
      const read = await wordle.read(id, a);
      expect(read.ok && read.battle.status).toBe('finished');
      const results = (await wordle.results(id, a))!;
      expect(results.ranking.find((r) => r.isMe)!.rank).toBe(1);
      expect(results.ranking.find((r) => !r.isMe)!.solved).toBe(false);

      // out of time: both still playing and present, the end time ends it
      const timed = await battleWith(host, a);
      expect((await wordle.start(timed, host)).ok).toBe(true);
      later(BATTLE_MINUTES * 60_000);
      expect(await wordle.guess(timed, host, WORDS[0]!)).toEqual({ ok: false, reason: 'finished' });
      expect((await wordle.state(timed, a)).status).toBe('finished');

      // and the sweep ends one nobody reads
      const unread = await battleWith(host, a);
      expect((await wordle.start(unread, host)).ok).toBe(true);
      later((AWAY_SECONDS + 1) * 1000);
      await wordle.sweep();
      expect((await wordle.state(unread, a)).status).toBe('finished');
    });

    it('announces every change (play_changed): join, start, guess, leave', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const id = await battleWith(host, a);
      expect(changed.filter((c) => c === id).length).toBeGreaterThanOrEqual(2); // create + join
      changed.length = 0;
      await wordle.start(id, host);
      await wordle.guess(id, host, await targetOf(id));
      await wordle.leave(id, a);
      expect(changed).toEqual([id, id, id]);
      // only the guess is one no chat card shows: a still racing, nothing ended
      expect(quiet).toEqual([id]);

      // a guess that ends the battle is one a card shows
      const b = await makeUser();
      const two = await battleWith(host, b);
      await wordle.start(two, host);
      const target = await targetOf(two);
      quiet.length = 0;
      await wordle.guess(two, host, target);
      expect(quiet).toEqual([two]);
      await wordle.guess(two, b, target);
      expect((await wordle.state(two, b)).status).toBe('finished');
      expect(quiet).toEqual([two]);
    });

    it('a pair rematch starts at once with both; the next round holds only the host; asking twice gives the same game', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const id = await battleWith(host, a);
      expect(await wordle.startPairRematch(id)).toEqual({ ok: false, reason: 'not-finished' });
      await wordle.start(id, host);
      const target = await targetOf(id);
      await wordle.guess(id, host, target);
      await wordle.guess(id, a, target);

      const first = await wordle.startPairRematch(id);
      if (!first.ok) throw new Error(first.reason);
      expect(await wordle.startPairRematch(id)).toEqual(first);
      const next = await wordle.state(first.id, a);
      expect(next.status).toBe('active');
      expect(next.players.map((p) => p.seat)).toEqual([1, 2]);
      expect((await wordle.state(id, a)).nextLobbyId).toBe(first.id);
      expect(await wordle.series(first.id, host, a)).toEqual({ me: 0, other: 0, draws: 1 }); // same guesses, same time

      // a round: only the host opens it, and only the host is in it
      const b = await makeUser();
      const three = await battleWith(host, a, b);
      await wordle.start(three, host);
      const t3 = await targetOf(three);
      for (const p of [host, a, b]) await wordle.guess(three, p, t3);
      expect(await wordle.openNextRound(a, three)).toEqual({ ok: false, reason: 'forbidden' });
      const round = await wordle.openNextRound(host, three);
      if (!round.ok) throw new Error(round.reason);
      expect(await wordle.openNextRound(host, three)).toEqual(round);
      const lobby = await wordle.state(round.id, host);
      expect(lobby.status).toBe('lobby');
      expect(lobby.players).toHaveLength(1);
      // the others join it like any lobby
      expect((await wordle.join(round.id, b)).ok).toBe(true);
    });

    it('a pair rematch is refused when a block came between the two', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const id = await battleWith(host, a);
      await wordle.start(id, host);
      const target = await targetOf(id);
      await wordle.guess(id, host, target);
      await wordle.guess(id, a, target);
      await block(pool, a, host);
      expect(await wordle.startPairRematch(id)).toEqual({ ok: false, reason: 'not-found' });
    });
  });

  describe('Rhyme Match', () => {
    it("draws the prompt from the match's own dialect", async () => {
      const host = await makeUser();
      const soraniInGames = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM dict_entries WHERE dialect = 'sorani' AND in_games`,
      );
      if (soraniInGames.rows[0]!.n === 0) {
        // no Soranî words to ask with: no Soranî match, rather than one with a Kurmancî prompt
        expect(await rhyme.create(host, { dialect: 'sorani' })).toEqual({ ok: false, reason: 'empty-lexicon' });
      }
      for (const w of SORANI) await addWord(w, 'sorani');
      for (let i = 0; i < 3; i++) {
        const created = await rhyme.create(host, { dialect: 'sorani' });
        if (!created.ok) throw new Error(created.reason);
        const prompt = (await pool.query<{ prompt: string }>(`SELECT prompt FROM rhyme_matches WHERE id = $1`, [created.match.id])).rows[0]!.prompt;
        const dialect = (await pool.query<{ dialect: string }>(`SELECT dialect FROM dict_entries WHERE headword = $1 LIMIT 1`, [prompt])).rows[0]!.dialect;
        expect(dialect).toBe('sorani');
      }
      const kurmanci = await rhyme.create(host, { dialect: 'kurmanci' });
      if (!kurmanci.ok) throw new Error(kurmanci.reason);
      const p = (await pool.query<{ prompt: string }>(`SELECT prompt FROM rhyme_matches WHERE id = $1`, [kurmanci.match.id])).rows[0]!.prompt;
      expect(SORANI).not.toContain(p);
    });

    it('a latecomer is told the match already started — not that time is up', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const late = await makeUser();
      await befriend(pool, host, a);
      await befriend(pool, host, late);
      const created = await rhyme.create(host, { dialect: 'kurmanci' });
      if (!created.ok) throw new Error(created.reason);
      const id = created.match.id;
      await rhyme.join(id, a);
      await rhyme.start(id, host);
      expect(await rhyme.read(id, late)).toEqual({ ok: false, reason: 'started' });
      expect(await rhyme.read(id, await makeUser())).toEqual({ ok: false, reason: 'not-found' });
    });

    it('scores by seat, leaving keeps your score, and the sweep ends a match nobody reads', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const b = await makeUser();
      await befriend(pool, host, a);
      await befriend(pool, host, b);
      const created = await rhyme.create(host, { dialect: 'kurmanci', windowMs: 60_000 });
      if (!created.ok) throw new Error(created.reason);
      const id = created.match.id;
      await rhyme.join(id, a);
      await rhyme.join(id, b);
      await rhyme.start(id, host);
      const view = await rhyme.state(id, a);
      expect(view.scoreboard.map((s) => s.userId)).toEqual(['seat:1', a, 'seat:3']);
      expect(JSON.stringify(view)).not.toContain(host);
      expect(JSON.stringify(view)).not.toContain(b);

      await rhyme.leave(id, b);
      expect((await rhyme.state(id, a)).scoreboard.find((s) => s.seat === 3)!.gone).toBe(true);
      expect(await rhyme.submit(id, b, RHYMES[0]!)).toEqual({ ok: false, reason: 'not-in-match' });

      later(60_001);
      changed.length = 0;
      await rhyme.sweep();
      expect(changed).toContain(id);
      expect((await rhyme.results(id, b))!.ranking).toHaveLength(3);
    });

    it('a scored word is a change no chat card shows; the match ending is one it does', async () => {
      const host = await makeUser();
      const a = await makeUser();
      await befriend(pool, host, a);
      const created = await rhyme.create(host, { dialect: 'kurmanci', windowMs: 60_000 });
      if (!created.ok) throw new Error(created.reason);
      const id = created.match.id;
      await rhyme.join(id, a);
      await rhyme.start(id, host);
      // a prompt the fixtures rhyme with
      await pool.query(`UPDATE rhyme_matches SET prompt = $2 WHERE id = $1`, [id, RHYMES[0]]);
      changed.length = 0;
      const scored = await rhyme.submit(id, a, RHYMES[1]!);
      expect(scored.ok && scored.result.accepted).toBe(true);
      expect(quiet).toEqual([id]);
      later(60_001);
      const tooLate = await rhyme.submit(id, a, RHYMES[2]!);
      expect(tooLate.ok && tooLate.result.reason).toBe('window-closed');
      expect(changed).toEqual([id, id]);
      expect(quiet).toEqual([id]);
    });

    it('the host removes by seat in the lobby, seats are never handed out twice, and an idle lobby closes', async () => {
      const host = await makeUser();
      const a = await makeUser();
      const b = await makeUser();
      await befriend(pool, host, a);
      await befriend(pool, host, b);
      const created = await rhyme.create(host, {});
      if (!created.ok) throw new Error(created.reason);
      const id = created.match.id;
      // b takes seat 2 and leaves; a comes after, into seat 3 — never b's
      await rhyme.join(id, b);
      await rhyme.leave(id, b);
      const joined = await rhyme.join(id, a);
      expect(joined.ok && joined.match.me!.seat).toBe(3);
      expect((await rhyme.remove(id, host, 2)).ok).toBe(false);
      expect((await rhyme.remove(id, host, 3)).ok).toBe(true);
      expect(await rhyme.read(id, a)).toEqual({ ok: false, reason: 'not-found' });
      expect(await rhyme.join(id, a)).toEqual({ ok: false, reason: 'not-found' });
      later((LOBBY_IDLE_MINUTES + 1) * 60_000);
      const read = await rhyme.read(id, host);
      expect(read.ok && read.match.status).toBe('cancelled');
    });
  });
});
