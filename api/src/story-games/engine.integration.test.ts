/**
 * The story game engine against real Postgres, below the HTTP layer: what has
 * to hold with a pool of ten connections, several API instances and clocks
 * that do not wait — long-polls that hold nothing, wakeups that cannot be
 * lost, the answer grace, presence, one advance however many ask for it,
 * rewards that are paid once and survive one player's failure, the sweep, and
 * what the play module calls.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { ANSWER_GRACE_MS, type StoryGameView } from '@kurda/shared';
import { LocalRoomBus } from '../realtime/bus.js';
import { XpService } from '../xp/service.js';
import { AppError } from '../plugins/errors.js';
import { canonicalPair } from '../friends/pair.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';
import { StoryGameNotifier } from './notifier.js';
import { Presence } from './presence.js';
import { StoryGamesService, type CreateGameInput } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!DATABASE_URL)('story game engine (integration)', () => {
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const storyIds: string[] = [];
  const userIds: string[] = [];
  const services: StoryGamesService[] = [];
  const log = { warn: vi.fn(), info: vi.fn() };
  let n = 0;

  const user = async (birthYear = 1990): Promise<string> => {
    const i = ++n;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month, email_verified_at, timezone)
       VALUES ($1, $2, $3, 6, now(), 'Europe/Berlin') RETURNING id`,
      [`sge_${i}_${suffix}@it.kurda.app`, `sge_${i}_${suffix}`.slice(0, 30), birthYear],
    );
    userIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };
  const befriend = async (a: string, b: string) => {
    const { lo, hi } = canonicalPair(a, b);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, responded_at, requested_by) VALUES ($1, $2, 'accepted', now(), $1)
       ON CONFLICT DO NOTHING`,
      [lo, hi],
    );
  };
  const story = async (opts: Partial<Parameters<typeof insertStory>[1]> = {}) => {
    const s = await insertStory(pool, { slug: `sge-${++n}-${suffix}`, questions: 8, ...opts });
    storyIds.push(s.id);
    return s;
  };

  /** A service as one API instance has it: its own notifier on the shared bus, its own presence. */
  const instance = (bus = new LocalRoomBus(), opts: { presence?: Presence; xp?: XpService; db?: pg.Pool } = {}) => {
    const notifier = new StoryGameNotifier(bus, log);
    const svc = new StoryGamesService(opts.db ?? pool, { notifier, log, presence: opts.presence, xp: opts.xp });
    services.push(svc);
    return { svc, notifier, bus };
  };

  const base = (storyId: string, over: Partial<CreateGameInput> = {}): CreateGameInput => ({
    mode: 'group',
    storyId,
    questionCount: 3,
    timerSeconds: 0,
    textDuring: 'visible',
    access: 'friends',
    ...over,
  });

  /** A group lobby by a host with friends in it. */
  const groupLobby = async (svc: StoryGamesService, size: number, over: Partial<CreateGameInput> = {}) => {
    const host = await user();
    const others: string[] = [];
    for (let i = 1; i < size; i++) {
      const u = await user();
      await befriend(host, u);
      others.push(u);
    }
    const s = await story();
    const v = await svc.create(host, base(s.id, { mode: size === 2 ? 'duo' : 'group', ...over }));
    for (const u of others) await svc.join(u, { id: v.id });
    return { gameId: v.id, host, others, storyId: s.id, all: [host, ...others] };
  };

  const rightOf = (v: StoryGameView) => v.question!.options.findIndex((o) => o.startsWith('rast'));

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
  });

  afterAll(async () => {
    for (const s of services) s.close();
    await deleteStories(pool, storyIds);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
  });

  describe('long-poll', () => {
    it('thirty waiting polls hold no connection: the pool stays free for everyone else', async () => {
      const { svc, notifier } = instance();
      const games = [await groupLobby(svc, 8), await groupLobby(svc, 8)];
      const polls: Array<Promise<StoryGameView | null>> = [];
      for (const g of games) {
        const v = await svc.view(g.gameId, g.host);
        for (const u of g.all) for (let k = 0; k < 2; k++) polls.push(svc.poll(g.gameId, u, v.version));
      }
      expect(polls).toHaveLength(32);
      // each poll registers, reads once, then waits; give the reads time to run
      const settled = () => pool.waitingCount === 0 && pool.idleCount === pool.totalCount;
      for (let i = 0; i < 150 && !(notifier.waiting() === 32 && settled()); i++) await sleep(20);
      await sleep(100);
      // all thirty-two still waiting — and nothing of theirs in the pool
      expect(notifier.waiting()).toBe(32);
      expect(pool.waitingCount).toBe(0);
      expect(pool.totalCount - pool.idleCount).toBe(0);
      // other work goes through at once
      const t0 = Date.now();
      await pool.query('SELECT 1');
      await svc.active(games[0]!.host);
      expect(Date.now() - t0).toBeLessThan(1000);

      // a change wakes every waiter of that game with the new version
      const changed = await svc.updateSettings(games[0]!.gameId, games[0]!.host, { textDuring: 'hidden' });
      await svc.updateSettings(games[1]!.gameId, games[1]!.host, { textDuring: 'hidden' });
      const views = await Promise.all(polls);
      expect(views.every((v) => v !== null && v.settings.textDuring === 'hidden')).toBe(true);
      expect(views.slice(0, 16).every((v) => v!.version === changed.version)).toBe(true);
    });

    it('does not lose a change that commits between registering and reading the version', async () => {
      const { svc: other } = instance();
      const { gameId, host, others } = await groupLobby(other, 3);
      const v = await other.view(gameId, host);

      // a service whose first read of the version is held back until a change has committed
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const slow = Object.create(pool) as pg.Pool;
      let held = false;
      slow.query = (async (...args: Parameters<pg.Pool['query']>) => {
        const result = await (pool.query as (...a: unknown[]) => Promise<unknown>)(...args);
        if (!held && typeof args[0] === 'string' && args[0].includes('SELECT g.status, g.version')) {
          held = true;
          await gate;
        }
        return result;
      }) as pg.Pool['query'];
      const notifier = new StoryGameNotifier(null, log);
      const svc = new StoryGamesService(slow, { notifier, log });
      services.push(svc);

      const t0 = Date.now();
      const polled = svc.poll(gameId, others[0]!, v.version);
      for (let i = 0; i < 100 && !held; i++) await sleep(10);
      expect(held).toBe(true);
      // the change commits (on this instance) after the version was read as v, before the wait
      await svc.updateSettings(gameId, host, { timerSeconds: 60 });
      release();
      const got = await polled;
      expect(got!.version).toBeGreaterThan(v.version);
      expect(Date.now() - t0).toBeLessThan(3000);
    });

    it('a change on one instance wakes a poll waiting on another, over the bus', async () => {
      const bus = new LocalRoomBus();
      const a = instance(bus);
      const b = instance(bus);
      const { gameId, host, others } = await groupLobby(a.svc, 3);
      const v = await b.svc.view(gameId, others[0]!);
      const waiting = b.svc.poll(gameId, others[0]!, v.version);
      for (let i = 0; i < 50 && b.notifier.waiting(gameId) === 0; i++) await sleep(10);
      const t0 = Date.now();
      await a.svc.updateSettings(gameId, host, { timerSeconds: 30 });
      const got = await waiting;
      expect(got!.settings.timerSeconds).toBe(30);
      expect(Date.now() - t0).toBeLessThan(2000);
    });

    it('answers at once for an old version, a cancelled game, and on shutdown', async () => {
      const { svc } = instance();
      const { gameId, host, others } = await groupLobby(svc, 3);
      const v = await svc.view(gameId, host);
      const t0 = Date.now();
      expect((await svc.poll(gameId, host, v.version - 1))!.version).toBe(v.version);
      await svc.leave(gameId, host); // the host leaving a lobby cancels it
      const cancelled = await svc.view(gameId, others[0]!);
      expect(cancelled.status).toBe('cancelled');
      expect((await svc.poll(gameId, others[0]!, cancelled.version))!.status).toBe('cancelled');
      expect(Date.now() - t0).toBeLessThan(2000);

      const { svc: s2 } = instance();
      const g2 = await groupLobby(s2, 2);
      const v2 = await s2.view(g2.gameId, g2.host);
      const waiting = s2.poll(g2.gameId, g2.host, v2.version);
      await sleep(50);
      const t1 = Date.now();
      s2.close();
      expect((await waiting)!.version).toBe(v2.version);
      expect(Date.now() - t1).toBeLessThan(1000);
      // and after shutdown nobody waits
      const t2 = Date.now();
      await s2.poll(g2.gameId, g2.host, v2.version);
      expect(Date.now() - t2).toBeLessThan(1000);
    });

    it('a member the host removed gets the same 404 as a stranger', async () => {
      const { svc } = instance();
      const { gameId, host, others } = await groupLobby(svc, 3);
      const stranger = await user();
      const seat = (await svc.view(gameId, others[1]!)).players.find((p) => p.isMe)!.seat;
      await svc.remove(gameId, host, seat);
      for (const who of [others[1]!, stranger]) {
        await expect(svc.poll(gameId, who, undefined)).rejects.toMatchObject({ statusCode: 404, code: 'GAME_NOT_FOUND' });
        await expect(svc.story(gameId, who)).rejects.toMatchObject({ statusCode: 404 });
      }
    });
  });

  describe('deadlines', () => {
    it('takes an answer that arrives within the grace after the deadline, while another player waits on it', async () => {
      const { svc } = instance();
      const { gameId, host, others } = await groupLobby(svc, 2, { timerSeconds: 30 });
      const mate = others[0]!;
      await svc.start(gameId, host);
      await svc.doneReading(gameId, host);
      let v = await svc.doneReading(gameId, mate);
      expect(v.status).toBe('question');
      // the deadline was 200 ms ago
      await pool.query(
        `UPDATE story_games SET phase_started_at = now() - interval '30.2 seconds', phase_ends_at = now() - interval '0.2 seconds'
          WHERE id = $1`,
        [gameId],
      );
      const waiting = svc.poll(gameId, mate, v.version);
      await sleep(30);
      v = await svc.answer(gameId, host, 0, 0, Date.now());
      expect(v.status).toBe('question');
      expect(v.question!.myChoice).toBe(0);
      // the mate's poll woke for it; the question closes at the deadline plus the grace
      const woke = await waiting;
      expect(woke!.answeredCount).toBe(1);
      expect(woke!.status).toBe('question');
      const closed = await svc.poll(gameId, mate, woke!.version);
      expect(closed!.status).toBe('reveal');
      // an answer after that is too late
      await expect(svc.answer(gameId, mate, 0, 1, Date.now())).rejects.toMatchObject({ code: 'TOO_LATE' });
    });

    it('refuses an answer received after the deadline and the grace, even before the question closed', async () => {
      const { svc } = instance();
      const { gameId, host, others } = await groupLobby(svc, 2, { timerSeconds: 30 });
      await svc.start(gameId, host);
      await svc.doneReading(gameId, host);
      await svc.doneReading(gameId, others[0]!);
      const row = await pool.query<{ ends: Date }>(`SELECT phase_ends_at AS ends FROM story_games WHERE id = $1`, [gameId]);
      const late = row.rows[0]!.ends.getTime() + ANSWER_GRACE_MS + 100;
      await expect(svc.answer(gameId, host, 0, 0, late)).rejects.toMatchObject({ code: 'TOO_LATE' });
      // in time, it counts
      const ok = await svc.answer(gameId, host, 0, 0, row.rows[0]!.ends.getTime() + ANSWER_GRACE_MS - 100);
      expect(ok.question!.myChoice).toBe(0);
    });

    it('advances a due game once, however many instances and timers ask at the same moment', async () => {
      const bus = new LocalRoomBus();
      const a = instance(bus);
      const b = instance(bus);
      const { gameId, host, others } = await groupLobby(a.svc, 2, { timerSeconds: 30 });
      await a.svc.start(gameId, host);
      await a.svc.doneReading(gameId, host);
      let v = await a.svc.doneReading(gameId, others[0]!);
      v = await a.svc.answer(gameId, host, 0, rightOf(v), Date.now());
      const before = v.version;
      await pool.query(
        `UPDATE story_games SET phase_started_at = now() - interval '40 seconds', phase_ends_at = now() - interval '10 seconds'
          WHERE id = $1`,
        [gameId],
      );
      await Promise.all([...Array.from({ length: 10 }, () => a.svc.advance(gameId)), ...Array.from({ length: 10 }, () => b.svc.advance(gameId))]);
      const row = await pool.query(`SELECT status, current_index, version FROM story_games WHERE id = $1`, [gameId]);
      expect(row.rows[0]).toMatchObject({ status: 'reveal', current_index: 0, version: before + 1 });
      // scored once
      const score = await pool.query(`SELECT score FROM story_game_players WHERE game_id = $1 AND user_id = $2`, [gameId, host]);
      expect(score.rows[0]!.score).toBe(100);
    });
  });

  describe('presence', () => {
    it('does not wait for an away player, and hands the host controls to the earliest active player', async () => {
      const presence = new Presence({ startGraceMs: 0 });
      const { svc } = instance(new LocalRoomBus(), { presence });
      const { gameId, host, others } = await groupLobby(svc, 3);
      const [first, second] = others as [string, string];
      // the host's phone died a minute ago
      await pool.query(`UPDATE story_game_players SET last_seen_at = now() - interval '60 seconds' WHERE game_id = $1 AND user_id = $2`, [
        gameId,
        host,
      ]);
      presence.setSeenForTest(gameId, host, Date.now() - 60_000);

      const fv = await svc.view(gameId, first);
      expect(fv.isHost).toBe(true);
      expect(fv.activeCount).toBe(2);
      expect(fv.players.find((p) => p.seat === 1)).toMatchObject({ isHost: true, away: true });
      expect((await svc.view(gameId, second)).isHost).toBe(false);
      // the stand-in starts; the away host is not waited for while reading
      expect((await svc.start(gameId, first)).status).toBe('reading');
      await svc.doneReading(gameId, first);
      const q = await svc.doneReading(gameId, second);
      expect(q.status).toBe('question');
      expect(q.activeCount).toBe(2);

      // the host comes back: present again, controls back, everyone told
      const back = await svc.poll(gameId, host, undefined);
      expect(back!.isHost).toBe(true);
      expect(back!.players.find((p) => p.isMe)!.away).toBe(false);
      await sleep(200);
      const after = await svc.view(gameId, first);
      expect(after.isHost).toBe(false);
      expect(after.version).toBeGreaterThan(q.version);
    });

    it('the stand-in holds the controls, but cannot remove the host', async () => {
      const presence = new Presence({ startGraceMs: 0 });
      const { svc } = instance(new LocalRoomBus(), { presence });
      const { gameId, host, others } = await groupLobby(svc, 3);
      await pool.query(`UPDATE story_game_players SET last_seen_at = now() - interval '60 seconds' WHERE game_id = $1 AND user_id = $2`, [
        gameId,
        host,
      ]);
      presence.setSeenForTest(gameId, host, Date.now() - 60_000);
      expect((await svc.view(gameId, others[0]!)).isHost).toBe(true);
      await expect(svc.remove(gameId, others[0]!, 1)).rejects.toMatchObject({ code: 'NOT_HOST' });
      // the others, yes
      const v = await svc.remove(gameId, others[0]!, 3);
      expect(v.players.map((p) => p.seat)).toEqual([1, 2]);
    });

    it('an away player does not count towards starting', async () => {
      const presence = new Presence({ startGraceMs: 0 });
      const { svc } = instance(new LocalRoomBus(), { presence });
      const { gameId, host, others } = await groupLobby(svc, 2);
      await pool.query(`UPDATE story_game_players SET last_seen_at = now() - interval '60 seconds' WHERE game_id = $1 AND user_id = $2`, [
        gameId,
        others[0],
      ]);
      presence.setSeenForTest(gameId, others[0]!, Date.now() - 60_000);
      await expect(svc.start(gameId, host)).rejects.toMatchObject({ code: 'NOT_ENOUGH_PLAYERS' });
    });

    it('after a process starts, everyone counts as present for a while', async () => {
      const { svc } = instance(new LocalRoomBus(), { presence: new Presence() });
      const { gameId, host, others } = await groupLobby(svc, 2);
      await pool.query(`UPDATE story_game_players SET last_seen_at = now() - interval '1 hour' WHERE game_id = $1`, [gameId]);
      const v = await svc.view(gameId, host);
      expect(v.players.every((p) => !p.away)).toBe(true);
      expect(v.activeCount).toBe(2);
      expect(v.isHost).toBe(true);
      expect(others).toHaveLength(1);
      // both count towards starting
      expect((await svc.start(gameId, host)).status).toBe('reading');
    });
  });

  describe('rewards', () => {
    it('a failure paying one player leaves that player unpaid and never undoes the game or the others', async () => {
      const failing = new XpService(pool);
      const { svc } = instance(new LocalRoomBus(), { xp: failing });
      const { gameId, host, others } = await groupLobby(svc, 2);
      const mate = others[0]!;
      const award = failing.award.bind(failing);
      vi.spyOn(failing, 'award').mockImplementation(async (input, executor) => {
        if (input.userId === mate) throw new Error('ledger on fire');
        return award(input, executor);
      });
      await svc.start(gameId, host);
      await svc.doneReading(gameId, host);
      let v = await svc.doneReading(gameId, mate);
      for (let i = 0; i < 3; i++) {
        await svc.answer(gameId, host, i, 0, Date.now());
        v = await svc.answer(gameId, mate, i, 0, Date.now());
        if (i < 2) {
          await svc.continueAfter(gameId, host, i);
          v = await svc.continueAfter(gameId, mate, i);
        }
      }
      expect(v.status).toBe('reveal');
      expect(v.results).not.toBeNull();
      const rows = await pool.query(
        `SELECT user_id, learning_counted, xp_awarded FROM story_game_players WHERE game_id = $1`,
        [gameId],
      );
      const byUser = new Map(rows.rows.map((r) => [r.user_id, r]));
      expect(byUser.get(host)).toMatchObject({ learning_counted: true });
      expect(byUser.get(mate)).toMatchObject({ learning_counted: false, xp_awarded: 0 });
      expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ userId: mate }), expect.stringContaining('unpaid'));
      const streak = await pool.query(`SELECT days_learned FROM user_streaks WHERE user_id = $1`, [mate]);
      expect(streak.rows[0]?.days_learned ?? 0).toBe(0);
    });

    it('pays once: finishing again, by the sweep or a late tap, pays nothing more', async () => {
      const { svc } = instance();
      const me = await user();
      const s = await story();
      let v = await svc.create(me, base(s.id, { mode: 'solo', skipReading: true }));
      for (let i = 0; i < 3; i++) {
        v = await svc.answer(v.id, me, i, rightOf(v), Date.now());
        if (i < 2) v = await svc.continueAfter(v.id, me, i);
      }
      const ledger = async () =>
        (await pool.query(`SELECT count(*)::int n, COALESCE(sum(amount),0)::int xp FROM xp_ledger WHERE user_id = $1`, [me])).rows[0];
      const streak = async () => (await pool.query(`SELECT days_learned, freeze_progress FROM user_streaks WHERE user_id = $1`, [me])).rows[0];
      const paid = await ledger();
      const learned = await streak();
      expect(paid).toEqual({ n: 1, xp: 20 });
      // left on the last reveal for hours: the sweep finishes it, without paying again
      await pool.query(`UPDATE story_games SET updated_at = now() - interval '7 hours' WHERE id = $1`, [v.id]);
      await svc.housekeeping();
      expect((await svc.view(v.id, me)).status).toBe('finished');
      await svc.continueAfter(v.id, me, 2);
      await svc.advance(v.id);
      expect(await ledger()).toEqual(paid);
      expect(await streak()).toEqual(learned);
    });

    it('two games on the same story finishing at once pay first-time XP once', async () => {
      const { svc } = instance();
      const me = await user();
      const s = await story();
      const a = await svc.create(me, base(s.id, { mode: 'solo', skipReading: true }));
      // a second solo game on the same story would end the first; one is a duo instead
      const mate = await user();
      await befriend(me, mate);
      const b = await svc.create(me, base(s.id, { mode: 'duo' }));
      await svc.join(mate, { id: b.id });
      await svc.start(b.id, me);
      await svc.doneReading(b.id, me);
      await svc.doneReading(b.id, mate);
      // both up to their last question
      let va = a;
      for (let i = 0; i < 2; i++) {
        va = await svc.answer(a.id, me, i, rightOf(va), Date.now());
        va = await svc.continueAfter(a.id, me, i);
      }
      let vb = await svc.view(b.id, me);
      for (let i = 0; i < 2; i++) {
        await svc.answer(b.id, mate, i, 0, Date.now());
        vb = await svc.answer(b.id, me, i, rightOf(vb), Date.now());
        await svc.continueAfter(b.id, mate, i);
        vb = await svc.continueAfter(b.id, me, i);
      }
      await svc.answer(b.id, mate, 2, 0, Date.now());
      const [ra, rb] = await Promise.all([
        svc.answer(a.id, me, 2, rightOf(va), Date.now()),
        svc.answer(b.id, me, 2, rightOf(vb), Date.now()),
      ]);
      const xp = [ra.results!.me!.xp, rb.results!.me!.xp].sort((x, y) => x - y);
      // one first finish (10 + 10 for all right), one repeat (a quarter)
      expect(xp).toEqual([5, 20]);
      const done = await pool.query(`SELECT count(*)::int n FROM story_completions WHERE user_id = $1 AND story_id = $2`, [me, s.id]);
      expect(done.rows[0]!.n).toBe(1);
    });

    it('counts only the answers given on the player’s own today', async () => {
      const { svc } = instance();
      const me = await user();
      const s = await story();
      let v = await svc.create(me, base(s.id, { mode: 'solo', skipReading: true }));
      v = await svc.answer(v.id, me, 0, 0, Date.now());
      v = await svc.continueAfter(v.id, me, 0);
      v = await svc.answer(v.id, me, 1, 0, Date.now());
      v = await svc.continueAfter(v.id, me, 1);
      // those two were yesterday
      await pool.query(`UPDATE story_game_answers SET answered_at = now() - interval '2 days' WHERE game_id = $1`, [v.id]);
      v = await svc.answer(v.id, me, 2, 0, Date.now());
      expect(v.results!.me).toMatchObject({ learningCounted: false, xp: 0, answered: 3 });
    });
  });

  describe('joining at once', () => {
    it('seats concurrent joiners one by one and turns away those past the last seat', async () => {
      const { svc } = instance();
      const host = await user();
      const s = await story();
      const g = await svc.create(host, base(s.id));
      const friends: string[] = [];
      for (let i = 0; i < 9; i++) {
        const u = await user();
        await befriend(host, u);
        friends.push(u);
      }
      const results = await Promise.allSettled(friends.map((u) => svc.join(u, { id: g.id })));
      const ok = results.filter((r) => r.status === 'fulfilled');
      const full = results.filter((r) => r.status === 'rejected' && (r.reason as AppError).code === 'GAME_FULL');
      expect(ok).toHaveLength(7);
      expect(full).toHaveLength(2);
      const seats = await pool.query<{ seat: number }>(`SELECT seat FROM story_game_players WHERE game_id = $1 ORDER BY seat`, [g.id]);
      expect(seats.rows.map((r) => r.seat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  describe('the sweep', () => {
    it('closes idle lobbies, finishes abandoned questions, clears old games’ answers and deletes very old ones', async () => {
      const { svc } = instance();
      const idle = await groupLobby(svc, 2);
      const fresh = await groupLobby(svc, 2);
      const stuck = await groupLobby(svc, 2, { timerSeconds: 0 });
      await svc.start(stuck.gameId, stuck.host);
      for (const u of stuck.all) await svc.doneReading(stuck.gameId, u);
      for (const u of stuck.all) await svc.answer(stuck.gameId, u, 0, 0, Date.now());
      for (const u of stuck.all) await svc.continueAfter(stuck.gameId, u, 0);
      await svc.answer(stuck.gameId, stuck.host, 1, 0, Date.now());
      await pool.query(`UPDATE story_games SET updated_at = now() - interval '7 hours' WHERE id = ANY($1::uuid[])`, [
        [idle.gameId, stuck.gameId],
      ]);

      const me = await user();
      const s = await story();
      let old = await svc.create(me, base(s.id, { mode: 'solo', skipReading: true }));
      for (let i = 0; i < 3; i++) {
        old = await svc.answer(old.id, me, i, 0, Date.now());
        old = await svc.continueAfter(old.id, me, i);
      }
      expect(old.status).toBe('finished');
      expect(old.results!.review).toHaveLength(3);
      const ancient = await svc.create(me, base(s.id, { mode: 'solo', skipReading: true }));
      await pool.query(
        `UPDATE story_games SET status = 'finished', finished_at = now() - interval '401 days' WHERE id = $1`,
        [ancient.id],
      );
      await pool.query(`UPDATE story_games SET finished_at = now() - interval '49 hours' WHERE id = $1`, [old.id]);

      const stats = await svc.housekeeping();
      expect(stats.closed).toBeGreaterThanOrEqual(1);
      expect(stats.finished).toBeGreaterThanOrEqual(1);

      const idleView = await svc.view(idle.gameId, idle.host);
      expect(idleView.status).toBe('cancelled');
      expect(idleView.code).toBeNull();
      expect((await svc.view(fresh.gameId, fresh.host)).status).toBe('lobby');
      // the abandoned game went the normal way: question closed, finished, totals moved
      const stuckView = await svc.view(stuck.gameId, stuck.host);
      expect(stuckView.status).toBe('finished');
      expect(stuckView.results!.me!.answered).toBe(2);
      // two days on: no plan, no text, no answers — the totals stay
      const cleared = await pool.query(`SELECT plan, story_snapshot FROM story_games WHERE id = $1`, [old.id]);
      expect(cleared.rows[0]).toEqual({ plan: null, story_snapshot: null });
      expect((await pool.query(`SELECT 1 FROM story_game_answers WHERE game_id = $1`, [old.id])).rowCount).toBe(0);
      const oldView = await svc.view(old.id, me);
      expect(oldView.results!.review).toEqual([]);
      expect(oldView.results!.me!.correct).toBeGreaterThanOrEqual(0);
      // 400 days on: gone
      expect((await pool.query(`SELECT 1 FROM story_games WHERE id = $1`, [ancient.id])).rowCount).toBe(0);
    });
  });

  describe('for the play module', () => {
    it('opens the next round with the host alone in it; the others join it like any game', async () => {
      const { svc } = instance();
      const g = await groupLobby(svc, 3, { timerSeconds: 0 });
      await svc.start(g.gameId, g.host);
      for (const u of g.all) await svc.doneReading(g.gameId, u);
      for (let i = 0; i < 3; i++) {
        for (const u of g.all) await svc.answer(g.gameId, u, i, 0, Date.now());
        if (i < 2) for (const u of g.all) await svc.continueAfter(g.gameId, u, i);
      }
      await expect(svc.openNextRound(g.others[0]!, g.gameId)).rejects.toMatchObject({ code: 'NOT_HOST' });
      const { gameId: next } = await svc.openNextRound(g.host, g.gameId);
      // asking again: the same round
      expect((await svc.openNextRound(g.host, g.gameId)).gameId).toBe(next);
      const nv = await svc.view(next, g.host);
      expect(nv.status).toBe('lobby');
      expect(nv.players).toHaveLength(1);
      expect(nv.settings.questionCount).toBe(3);
      expect((await svc.view(g.gameId, g.others[0]!)).nextGameId).toBe(next);
      // others get in only by joining
      await expect(svc.view(next, g.others[0]!)).rejects.toMatchObject({ code: 'GAME_NOT_FOUND' });
      expect((await svc.join(g.others[0]!, { id: next })).players).toHaveLength(2);
    });

    it('a pair rematch starts at once with both players, on a story the host has not finished', async () => {
      const { svc } = instance();
      const g = await groupLobby(svc, 2, { timerSeconds: 0 });
      const other = await story();
      await svc.start(g.gameId, g.host);
      for (const u of g.all) await svc.doneReading(g.gameId, u);
      for (let i = 0; i < 3; i++) {
        for (const u of g.all) await svc.answer(g.gameId, u, i, 0, Date.now());
        if (i < 2) for (const u of g.all) await svc.continueAfter(g.gameId, u, i);
      }
      await pool.query(`UPDATE stories SET dialect = 'sorani', level = 2 WHERE id = ANY($1::uuid[])`, [[g.storyId, other.id]]);
      await pool.query(`UPDATE story_games SET dialect = 'sorani' WHERE id = $1`, [g.gameId]);
      const { gameId: next } = await svc.startPairRematch(g.gameId);
      expect((await svc.startPairRematch(g.gameId)).gameId).toBe(next);
      const v = await svc.view(next, g.others[0]!);
      expect(v.status).toBe('reading');
      expect(v.players.map((p) => p.seat)).toEqual([1, 2]);
      expect(v.players.find((p) => p.seat === 1)!.isMe).toBe(false);
      // the host just finished the first story, so the next one is another
      expect(v.settings.storyId).not.toBe(g.storyId);
    });

    it('refuses a rematch between two people one of whom has blocked the other', async () => {
      const { svc } = instance();
      const g = await groupLobby(svc, 2, { timerSeconds: 0 });
      await svc.start(g.gameId, g.host);
      for (const u of g.all) await svc.doneReading(g.gameId, u);
      for (let i = 0; i < 3; i++) {
        for (const u of g.all) await svc.answer(g.gameId, u, i, 0, Date.now());
        if (i < 2) for (const u of g.all) await svc.continueAfter(g.gameId, u, i);
      }
      await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [g.others[0], g.host]);
      await expect(svc.startPairRematch(g.gameId)).rejects.toMatchObject({ code: 'GAME_NOT_FOUND' });
    });

    it('describes a lobby for a card and a banner, to the people who may see it', async () => {
      const { svc } = instance();
      const g = await groupLobby(svc, 2, { mode: 'group' });
      const friend = await user();
      await befriend(g.host, friend);
      const stranger = await user();
      const summary = await svc.summary(g.gameId);
      expect(summary).toMatchObject({ mode: 'group', dialect: 'kurmanci', length: 'short', questionCount: 3 });
      expect(summary.storyTitle).toMatch(/^Bazar /);
      expect(await svc.card(g.host, g.gameId)).toMatchObject({ status: 'open', players: 2, maxPlayers: 8, isMember: true, canJoin: false });
      expect(await svc.card(friend, g.gameId)).toMatchObject({ status: 'open', isMember: false, canJoin: true });
      expect(await svc.card(stranger, g.gameId)).toMatchObject({ status: 'unavailable', players: 0, canJoin: false });
      expect(await svc.card(friend, '00000000-0000-4000-8000-000000000000')).toMatchObject({ status: 'unavailable' });
      // shared into a group chat: an invite-only group's members may see it and
      // join; an open group's are strangers to everyone in it, and may not
      const inGroup = async (privacy: 'invite' | 'open') => {
        const member = await user();
        const grp = await pool.query<{ id: string }>(
          `INSERT INTO groups (name, privacy, owner_id) VALUES ($1, $2, $3) RETURNING id`,
          [`sge ${privacy} ${suffix}`, privacy, g.host],
        );
        await pool.query(
          `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
          [grp.rows[0]!.id, g.host, member],
        );
        await pool.query(`UPDATE story_games SET chat_group_id = $2 WHERE id = $1`, [g.gameId, grp.rows[0]!.id]);
        return { member, groupId: grp.rows[0]!.id };
      };
      const openGroup = await inGroup('open');
      expect(await svc.card(openGroup.member, g.gameId)).toMatchObject({ status: 'unavailable', canJoin: false });
      await expect(svc.join(openGroup.member, { id: g.gameId })).rejects.toMatchObject({ code: 'GAME_NOT_FOUND' });
      const inviteGroup = await inGroup('invite');
      expect(await svc.card(inviteGroup.member, g.gameId)).toMatchObject({ status: 'open', canJoin: true });
      await pool.query(`UPDATE story_games SET chat_group_id = NULL WHERE id = $1`, [g.gameId]);
      await pool.query(`DELETE FROM groups WHERE id = ANY($1::uuid[])`, [[openGroup.groupId, inviteGroup.groupId]]);
      await svc.start(g.gameId, g.host);
      for (const u of g.all) await svc.doneReading(g.gameId, u);
      expect(await svc.card(friend, g.gameId)).toMatchObject({ status: 'started', canJoin: false });
      expect((await svc.memberIds(g.gameId)).sort()).toEqual([...g.all].sort());
      await expect(svc.createFromInvite(g.host, base(g.storyId, { mode: 'solo' }))).rejects.toMatchObject({ code: 'BAD_SETTINGS' });
      const { gameId } = await svc.createFromInvite(g.host, base(g.storyId, { mode: 'duo' }));
      expect((await svc.view(gameId, g.host)).status).toBe('lobby');
    });
  });

  describe('account deletion', () => {
    it('takes someone out of their unfinished games through the leave path', async () => {
      const { svc } = instance();
      const hosted = await groupLobby(svc, 3);
      const playing = await groupLobby(svc, 3, { timerSeconds: 0 });
      const leaver = hosted.host;
      await befriend(playing.host, leaver);
      await svc.join(leaver, { id: playing.gameId });
      await svc.start(playing.gameId, playing.host);
      await svc.leaveAll(leaver);
      expect((await svc.view(hosted.gameId, hosted.others[0]!)).status).toBe('cancelled');
      const pv = await svc.view(playing.gameId, playing.host);
      expect(pv.status).toBe('reading');
      expect(pv.players.find((p) => p.seat === 4)).toMatchObject({ gone: true });
      // and the reading no longer waits for them
      for (const u of playing.all) await svc.doneReading(playing.gameId, u);
      expect((await svc.view(playing.gameId, playing.host)).status).toBe('question');
    });
  });
});
