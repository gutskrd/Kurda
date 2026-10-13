/**
 * Story games over HTTP, against real Postgres: solo, duo and group from
 * creation to results, the join rule and its order, the identity rule, the
 * host controls, and the reads around a game (active, history, its story).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { StoryGameView } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { canonicalPair } from '../friends/pair.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Account {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('story games (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const storyIds: string[] = [];
  let n = 0;
  const ip = () => `10.151.${Math.floor(++n / 250)}.${(n % 250) + 1}`;

  const signUp = async (tag: string, age = 30): Promise<Account> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `sg_${tag}_${suffix}@it.kurda.app`,
        username: `sg_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(age),
      },
      remoteAddress: ip(),
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };

  const befriend = async (a: Account, b: Account) => {
    const { lo, hi } = canonicalPair(a.id, b.id);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, responded_at, requested_by) VALUES ($1, $2, 'accepted', now(), $1)
       ON CONFLICT (user_lo, user_hi) DO UPDATE SET status = 'accepted', responded_at = now()`,
      [lo, hi],
    );
  };

  const call = (who: Account, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, payload, remoteAddress: ip() });

  const story = async (tag: string, opts: Parameters<typeof insertStory>[1] extends infer O ? Partial<O> : never = {}) => {
    const s = await insertStory(pool, { slug: `sg-${tag}-${suffix}`, ...opts });
    storyIds.push(s.id);
    return s;
  };

  /** The index of the right option in the view's (shuffled) question: the fixture's right answers start with "rast". */
  const rightChoice = (v: StoryGameView) => v.question!.options.findIndex((o) => o.startsWith('rast'));
  const wrongChoice = (v: StoryGameView) => v.question!.options.findIndex((o) => !o.startsWith('rast'));

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await deleteStories(pool, storyIds);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  describe('solo', () => {
    it('quiz yourself: straight to the questions, every answer revealed, paid once at the last', async () => {
      const me = await signUp('solo1');
      const s = await story('solo1');
      const created = await call(me, 'POST', '/story-games', {
        mode: 'solo',
        storyId: s.id,
        questionCount: 3,
        timerSeconds: 0,
        textDuring: 'visible',
        access: 'friends',
        skipReading: true,
      });
      expect(created.statusCode).toBe(201);
      let view = created.json() as StoryGameView;
      expect(view.status).toBe('question');
      expect(view.code).toBeNull();
      expect(view.question!.index).toBe(0);
      expect(view.question!.total).toBe(3);
      // the answer is not in the question
      expect(JSON.stringify(view.question)).not.toContain('correctIndex');
      expect(view.phaseEndsAt).toBeNull();

      for (let i = 0; i < 3; i++) {
        const choice = i === 1 ? wrongChoice(view) : rightChoice(view);
        const answered = await call(me, 'POST', `/story-games/${view.id}/answers`, { index: i, choice });
        expect(answered.statusCode).toBe(200);
        view = answered.json();
        // solo: answering reveals at once
        expect(view.status).toBe('reveal');
        expect(view.reveal!.index).toBe(i);
        expect(view.reveal!.myChoice).toBe(choice);
        expect(view.reveal!.myCorrect).toBe(i !== 1);
        if (i < 2) {
          expect(view.results).toBeNull();
          view = (await call(me, 'POST', `/story-games/${view.id}/continue`, { index: i })).json();
          expect(view.status).toBe('question');
        }
      }
      // the last reveal carries the results: paid in the transaction that closed it
      expect(view.results!.me).toMatchObject({ score: 200, correct: 2, answered: 3, total: 3, learningCounted: true });
      expect(view.results!.me!.xp).toBeGreaterThan(0);
      expect(view.results!.review).toHaveLength(3);
      const xp = await pool.query(`SELECT amount FROM xp_ledger WHERE user_id = $1 AND source = 'story'`, [me.id]);
      expect(xp.rows).toHaveLength(1);

      const done = (await call(me, 'POST', `/story-games/${view.id}/continue`, { index: 2 })).json() as StoryGameView;
      expect(done.status).toBe('finished');
      expect(done.results!.me!.xp).toBe(view.results!.me!.xp);

      // history: best right answers out of the questions
      const history = (await call(me, 'GET', '/story-games/history')).json();
      expect(history.progress).toEqual([
        expect.objectContaining({ storyId: s.id, bestCorrect: 2, total: 3 }),
      ]);
      // a second game on the same story pays a quarter: it is a repeat
      const again = (
        await call(me, 'POST', '/story-games', {
          mode: 'solo',
          storyId: s.id,
          questionCount: 3,
          timerSeconds: 0,
          textDuring: 'visible',
          access: 'friends',
          skipReading: true,
        })
      ).json() as StoryGameView;
      let v2 = again;
      for (let i = 0; i < 3; i++) {
        v2 = (await call(me, 'POST', `/story-games/${v2.id}/answers`, { index: i, choice: rightChoice(v2) })).json();
        if (i < 2) v2 = (await call(me, 'POST', `/story-games/${v2.id}/continue`, { index: i })).json();
      }
      expect(v2.results!.me!.learningCounted).toBe(true);
      // 10 + 10 for a perfect first game; a quarter of that, rounded, for a repeat
      expect(v2.results!.me!.xp).toBe(5);
    });

    it('a solo game with the reading phase starts the questions when the reader says so', async () => {
      const me = await signUp('solo2');
      const s = await story('solo2');
      const view = (
        await call(me, 'POST', '/story-games', {
          mode: 'solo',
          storyId: s.id,
          questionCount: 3,
          timerSeconds: 30,
          textDuring: 'visible',
          access: 'friends',
        })
      ).json() as StoryGameView;
      expect(view.status).toBe('reading');
      // no caps for a solo reader, no countdown while reading
      expect(view.readingSoftCapAt).toBeNull();
      expect(view.readingHardCapAt).toBeNull();
      expect(view.phaseEndsAt).toBeNull();
      const q = (await call(me, 'POST', `/story-games/${view.id}/done-reading`)).json() as StoryGameView;
      expect(q.status).toBe('question');
      // timed: the countdown is for this viewer
      expect(new Date(q.phaseEndsAt!).getTime() - new Date(q.serverNow).getTime()).toBeGreaterThan(25_000);
    });
  });

  /** A duo or group lobby by `host`, joined by `others` with its code. */
  const lobby = async (host: Account, others: Account[], opts: Record<string, unknown> = {}) => {
    const s = await story(`lobby${++n}`, { questions: 8 });
    const created = await call(host, 'POST', '/story-games', {
      mode: others.length > 1 ? 'group' : 'duo',
      storyId: s.id,
      questionCount: 3,
      timerSeconds: 60,
      textDuring: 'visible',
      access: 'friends',
      ...opts,
    });
    if (created.statusCode !== 201) throw new Error(`create: ${created.statusCode} ${created.body}`);
    const view = created.json() as StoryGameView;
    for (const o of others) {
      const joined = await call(o, 'POST', '/story-games/join', { code: view.code });
      if (joined.statusCode !== 200) throw new Error(`join: ${joined.statusCode} ${joined.body}`);
    }
    return { view, story: s };
  };

  const getView = async (who: Account, id: string) => (await call(who, 'GET', `/story-games/${id}`)).json() as StoryGameView;

  /** Every other member whose user id appears anywhere in a serialized view. */
  const foreignIds = (v: StoryGameView, viewer: Account, members: Account[]) => {
    const json = JSON.stringify(v);
    return members.filter((m) => m.id !== viewer.id && json.includes(m.id)).map((m) => m.id);
  };

  describe('duo and group', () => {
    it('plays a duo through: lobby, reading, questions with a long-poll, reveals, results', async () => {
      const host = await signUp('duoh');
      const mate = await signUp('duom');
      await befriend(host, mate);
      const { view: created } = await lobby(host, [mate]);
      expect(created.status).toBe('lobby');
      expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
      expect(created.isHost).toBe(true);

      let v = await getView(mate, created.id);
      expect(v.players.map((p) => p.seat)).toEqual([1, 2]);
      expect(v.isHost).toBe(false);
      // friends see each other's names
      expect(v.players.find((p) => !p.isMe)!.name).toBe(`sg_duoh_${suffix}`.slice(0, 30));

      // the mate waits on the lobby's version; the host's start wakes them
      const waiting = call(mate, 'GET', `/story-games/${v.id}?v=${v.version}`);
      await new Promise((r) => setTimeout(r, 100));
      const started = (await call(host, 'POST', `/story-games/${v.id}/start`)).json() as StoryGameView;
      expect(started.status).toBe('reading');
      // still joinable while reading: the code stays; caps, but no countdown
      expect(started.code).toBe(created.code);
      expect(started.readingSoftCapAt).not.toBeNull();
      expect(started.readingHardCapAt).not.toBeNull();
      expect(started.phaseEndsAt).toBeNull();
      const woke = (await waiting).json() as StoryGameView;
      expect(woke.status).toBe('reading');
      expect(woke.version).toBe(started.version);

      // the text is the game's own copy
      const text = await call(mate, 'GET', `/story-games/${v.id}/story`);
      expect(text.statusCode).toBe(200);
      expect(text.headers['cache-control']).toBe('private, max-age=3600');
      expect(text.json().paragraphs).toHaveLength(4);
      expect(text.json()).not.toHaveProperty('questions');

      // counts, never who
      let hv = (await call(host, 'POST', `/story-games/${v.id}/done-reading`)).json() as StoryGameView;
      expect(hv.readingDoneCount).toBe(1);
      expect(hv.activeCount).toBe(2);
      expect(hv.meDoneReading).toBe(true);
      // repeating it changes nothing
      const again = (await call(host, 'POST', `/story-games/${v.id}/done-reading`)).json() as StoryGameView;
      expect(again.version).toBe(hv.version);
      v = (await call(mate, 'POST', `/story-games/${v.id}/done-reading`)).json();
      expect(v.status).toBe('question');
      expect(v.code).toBeNull();

      for (let i = 0; i < 3; i++) {
        hv = await getView(host, v.id);
        const hostRight = rightChoice(hv);
        const a = (await call(host, 'POST', `/story-games/${v.id}/answers`, { index: i, choice: hostRight })).json() as StoryGameView;
        // the host's answer is locked; the question is still open, the scores as they were
        expect(a.status).toBe('question');
        expect(a.question!.myChoice).toBe(hostRight);
        expect(a.answeredCount).toBe(1);
        expect(a.reveal).toBeNull();
        expect(a.players.find((p) => p.isMe)!.score).toBe(i * 100);
        // answering twice is ALREADY_ANSWERED
        const twice = await call(host, 'POST', `/story-games/${v.id}/answers`, { index: i, choice: hostRight });
        expect(twice.statusCode).toBe(409);
        expect(twice.json().code).toBe('ALREADY_ANSWERED');
        // the wrong index is NOT_CURRENT
        const wrongIndex = await call(mate, 'POST', `/story-games/${v.id}/answers`, { index: i + 1, choice: 0 });
        expect(wrongIndex.json().code).toBe('NOT_CURRENT');

        const mv = await getView(mate, v.id);
        const r = (await call(mate, 'POST', `/story-games/${v.id}/answers`, { index: i, choice: wrongChoice(mv) })).json() as StoryGameView;
        // the last answer closes the question
        expect(r.status).toBe('reveal');
        expect(r.reveal!).toMatchObject({ index: i, answeredCount: 2, correctCount: 1, myCorrect: false });
        expect(r.question!.index).toBe(i);
        if (i < 2) {
          // a reveal waits for both to continue; the host cannot skip it
          const skip = await call(host, 'POST', `/story-games/${v.id}/advance`, { from: { status: 'reveal', index: i } });
          expect(skip.json().code).toBe('CANNOT_ADVANCE');
          const c1 = (await call(host, 'POST', `/story-games/${v.id}/continue`, { index: i })).json() as StoryGameView;
          expect(c1.status).toBe('reveal');
          expect(c1.continuedCount).toBe(1);
          expect(c1.meContinued).toBe(true);
          v = (await call(mate, 'POST', `/story-games/${v.id}/continue`, { index: i })).json();
          expect(v.status).toBe('question');
          expect(v.question!.index).toBe(i + 1);
        } else {
          v = r;
        }
      }
      // the final reveal is the finished game: results and rewards are there already
      expect(v.results!.standings.map((s) => [s.isMe, s.score, s.place])).toEqual([
        [false, 300, 1],
        [true, 0, 2],
      ]);
      expect(v.results!.me!.learningCounted).toBe(true);
      const paid = await pool.query(
        `SELECT user_id, xp_awarded, learning_counted FROM story_game_players WHERE game_id = $1 ORDER BY seat`,
        [v.id],
      );
      expect(paid.rows.map((r) => r.learning_counted)).toEqual([true, true]);
      expect(paid.rows[0].xp_awarded).toBe(20);
      expect(paid.rows[1].xp_awarded).toBe(10);
    });

    it('never puts another member’s user id in any view, in any phase', async () => {
      const host = await signUp('idh');
      const friend = await signUp('idf');
      const stranger = await signUp('ids');
      await befriend(host, friend);
      await befriend(host, stranger);
      const members = [host, friend, stranger];
      const { view } = await lobby(host, [friend, stranger], { timerSeconds: 0 });
      const check = async (phase: string) => {
        for (const m of members) {
          const v = await getView(m, view.id);
          expect(v.status, phase).toBe(phase);
          expect(foreignIds(v, m, members), `${phase} as ${m.id}`).toEqual([]);
        }
      };
      await check('lobby');
      await call(host, 'POST', `/story-games/${view.id}/start`);
      await check('reading');
      for (const m of members) await call(m, 'POST', `/story-games/${view.id}/done-reading`);
      await check('question');
      for (let i = 0; i < 3; i++) {
        for (const m of members) await call(m, 'POST', `/story-games/${view.id}/answers`, { index: i, choice: 0 });
        await check('reveal');
        if (i < 2) {
          for (const m of members) await call(m, 'POST', `/story-games/${view.id}/continue`, { index: i });
          await check('question');
        }
      }
      for (const m of members) await call(m, 'POST', `/story-games/${view.id}/continue`, { index: 2 });
      await check('finished');

      // and names: the friend and the stranger are not friends with each other
      const fv = await getView(friend, view.id);
      expect(fv.players.find((p) => p.seat === 1)!.name).not.toBeNull();
      expect(fv.players.find((p) => p.seat === 3)!.name).toBeNull();
      expect(fv.players.find((p) => p.seat === 3)!.avatarUrl).toBeNull();
      expect(fv.results!.standings.find((s) => s.seat === 3)!.name).toBeNull();
    });

    it('in an open game adults see each other’s names, unless one blocked the other', async () => {
      const host = await signUp('oph');
      const a = await signUp('opa');
      const b = await signUp('opb');
      const { view } = await lobby(host, [], { mode: 'group', access: 'open' });
      expect((await call(a, 'POST', '/story-games/join', { code: view.code })).statusCode).toBe(200);
      expect((await call(b, 'POST', '/story-games/join', { code: view.code })).statusCode).toBe(200);
      const av = await getView(a, view.id);
      expect(av.players.every((p) => p.name !== null)).toBe(true);
      await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [b.id, a.id]);
      const after = await getView(a, view.id);
      expect(after.players.find((p) => p.seat === 3)!.name).toBeNull();
      expect(after.players.find((p) => p.seat === 1)!.name).not.toBeNull();
    });
  });

  describe('joining', () => {
    it('answers every refusal that is about people with the same 404, before saying started or full', async () => {
      const host = await signUp('jh');
      const mate = await signUp('jm');
      const third = await signUp('jt');
      const outsider = await signUp('jo');
      await befriend(host, mate);
      await befriend(host, third);
      const { view } = await lobby(host, [mate]);

      const notFound = { statusCode: 404, code: 'GAME_NOT_FOUND' };
      const tryJoin = async (who: Account, body: object) => {
        const res = await call(who, 'POST', '/story-games/join', body);
        return { statusCode: res.statusCode, code: res.json().code as string | undefined };
      };
      // a code that does not exist, a game you may not join: the same answer
      expect(await tryJoin(outsider, { code: 'ZZZ 999' })).toEqual(notFound);
      expect(await tryJoin(outsider, { code: view.code })).toEqual(notFound);
      expect(await tryJoin(outsider, { id: view.id })).toEqual(notFound);
      // a duo with two in it is full — said only to someone who could join
      expect(await tryJoin(third, { code: view.code! })).toEqual({ statusCode: 409, code: 'GAME_FULL' });
      // the code is read the way people type it
      const typed = `${view.code!.slice(0, 3).toLowerCase()}-${view.code!.slice(3)}`;
      expect(await tryJoin(third, { code: typed })).toEqual({ statusCode: 409, code: 'GAME_FULL' });

      // a group: joining while people read is fine; once the questions start it is not
      const g = await lobby(host, [mate], { mode: 'group' });
      await call(host, 'POST', `/story-games/${g.view.id}/start`);
      expect((await tryJoin(third, { code: g.view.code! })).statusCode).toBe(200);
      for (const m of [host, mate, third]) await call(m, 'POST', `/story-games/${g.view.id}/done-reading`);
      expect((await getView(host, g.view.id)).status).toBe('question');
      // already in: a no-op
      expect((await tryJoin(third, { id: g.view.id })).statusCode).toBe(200);
      const late = await signUp('jl');
      await befriend(host, late);
      expect(await tryJoin(late, { id: g.view.id })).toEqual({ statusCode: 409, code: 'GAME_STARTED' });
      // but not to someone who could not have joined anyway
      expect(await tryJoin(outsider, { id: g.view.id })).toEqual(notFound);
    });

    it('keeps out the people the host removed and anyone with a block against a member', async () => {
      const host = await signUp('bh');
      const a = await signUp('ba');
      const b = await signUp('bb');
      const c = await signUp('bc');
      for (const x of [a, b, c]) await befriend(host, x);
      const { view } = await lobby(host, [a, b], { mode: 'group' });

      // removed by seat: gone from every route, and cannot come back
      const removed = (await call(host, 'POST', `/story-games/${view.id}/remove`, { seat: 3 })).json() as StoryGameView;
      expect(removed.players.map((p) => p.seat)).toEqual([1, 2]);
      expect((await call(b, 'GET', `/story-games/${view.id}`)).statusCode).toBe(404);
      expect((await call(b, 'GET', `/story-games/${view.id}/story`)).statusCode).toBe(404);
      expect((await call(b, 'POST', '/story-games/join', { id: view.id })).statusCode).toBe(404);
      // only the host removes; nobody removes themselves
      expect((await call(a, 'POST', `/story-games/${view.id}/remove`, { seat: 1 })).json().code).toBe('NOT_HOST');
      expect((await call(host, 'POST', `/story-games/${view.id}/remove`, { seat: 1 })).json().code).toBe('CANNOT_REMOVE_SELF');

      // c blocked a (who is in it): c cannot join, though a friend of the host
      await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [c.id, a.id]);
      expect((await call(c, 'POST', '/story-games/join', { id: view.id })).statusCode).toBe(404);
    });

    it('takes only known adults into an open game, and lets only an adult host open one', async () => {
      const host = await signUp('oh');
      const teen = await signUp('ot', 15);
      const adult = await signUp('oa');
      await befriend(host, teen);
      expect((await call(teen, 'GET', '/story-games/options')).json()).toEqual({ canHostOpen: false });
      expect((await call(host, 'GET', '/story-games/options')).json()).toEqual({ canHostOpen: true });
      const s = await story('open1');
      const refused = await call(teen, 'POST', '/story-games', {
        mode: 'group',
        storyId: s.id,
        questionCount: 3,
        timerSeconds: 60,
        textDuring: 'visible',
        access: 'open',
      });
      expect(refused.statusCode).toBe(403);
      expect(refused.json().code).toBe('OPEN_NOT_ALLOWED');

      const { view } = await lobby(host, [], { mode: 'group', access: 'open' });
      // a stranger who is an adult may join; the host's own teenage friend may not
      expect((await call(adult, 'POST', '/story-games/join', { code: view.code })).statusCode).toBe(200);
      expect((await call(teen, 'POST', '/story-games/join', { code: view.code })).statusCode).toBe(404);

      // a friends lobby with someone else in it cannot be opened afterwards
      const f = await lobby(host, [teen], { mode: 'group' });
      const opened = await call(host, 'PATCH', `/story-games/${f.view.id}/settings`, { access: 'open' });
      expect(opened.statusCode).toBe(403);
    });

    it('lets the members of an invite-only group chat the game was shared into join, and nobody from an open one', async () => {
      const host = await signUp('gh');
      const member = await signUp('gm');
      const stranger = await signUp('gs');
      const teen = await signUp('gt', 15);
      await befriend(host, teen);
      const group = async (privacy: 'invite' | 'open', memberId: string) => {
        const g = await pool.query<{ id: string }>(
          `INSERT INTO groups (name, privacy, owner_id) VALUES ($1, $2, $3) RETURNING id`,
          [`sg ${privacy} group ${suffix}`, privacy, host.id],
        );
        await pool.query(
          `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
          [g.rows[0]!.id, host.id, memberId],
        );
        return g.rows[0]!.id;
      };
      const invite = await group('invite', member.id);
      const open = await group('open', stranger.id);

      const { view } = await lobby(host, [], { mode: 'group' });
      expect((await call(member, 'POST', '/story-games/join', { id: view.id })).statusCode).toBe(404);
      await pool.query(`UPDATE story_games SET chat_group_id = $2 WHERE id = $1`, [view.id, invite]);
      expect((await call(member, 'POST', '/story-games/join', { id: view.id })).statusCode).toBe(200);

      // An open group is strangers by design, and this friends lobby holds the
      // host's fifteen-year-old friend: sharing it there lets nobody in.
      const shared = await lobby(host, [teen], { mode: 'group' });
      await pool.query(`UPDATE story_games SET chat_group_id = $2 WHERE id = $1`, [shared.view.id, open]);
      const refused = await call(stranger, 'POST', '/story-games/join', { id: shared.view.id });
      expect({ statusCode: refused.statusCode, code: refused.json().code }).toEqual({ statusCode: 404, code: 'GAME_NOT_FOUND' });
      expect((await call(stranger, 'POST', '/story-games/join', { code: shared.view.code })).statusCode).toBe(404);
      expect((await getView(teen, shared.view.id)).players).toHaveLength(2);
      await pool.query(`DELETE FROM groups WHERE id = ANY($1::uuid[])`, [[invite, open]]);
    });

    it('a solo game is nobody else’s', async () => {
      const me = await signUp('so');
      const friend = await signUp('sf');
      await befriend(me, friend);
      const s = await story('solo3');
      const v = (
        await call(me, 'POST', '/story-games', {
          mode: 'solo',
          storyId: s.id,
          questionCount: 3,
          timerSeconds: 0,
          textDuring: 'visible',
          access: 'friends',
        })
      ).json() as StoryGameView;
      expect((await call(friend, 'POST', '/story-games/join', { id: v.id })).statusCode).toBe(404);
      expect((await call(friend, 'GET', `/story-games/${v.id}`)).statusCode).toBe(404);
    });
  });

  describe('host controls', () => {
    it('changes settings in the lobby only, from the presets, by the host', async () => {
      const host = await signUp('sh');
      const mate = await signUp('sm');
      await befriend(host, mate);
      const { view } = await lobby(host, [mate]);
      const long = await story('long1', { length: 'long', questions: 15 });

      expect((await call(mate, 'PATCH', `/story-games/${view.id}/settings`, { timerSeconds: 30 })).json().code).toBe('NOT_HOST');
      // a count the length does not offer is refused; a new story falls back to its length's default
      expect((await call(host, 'PATCH', `/story-games/${view.id}/settings`, { questionCount: 10 })).statusCode).toBe(400);
      const changed = (
        await call(host, 'PATCH', `/story-games/${view.id}/settings`, { storyId: long.id, timerSeconds: 0, textDuring: 'hidden' })
      ).json() as StoryGameView;
      expect(changed.settings).toMatchObject({ storyId: long.id, length: 'long', questionCount: 5, timerSeconds: 0, textDuring: 'hidden' });
      // an unpublished story cannot be picked
      const draft = await story('draft1', { status: 'draft' });
      expect((await call(host, 'PATCH', `/story-games/${view.id}/settings`, { storyId: draft.id })).json().code).toBe('NO_STORY');

      await call(host, 'POST', `/story-games/${view.id}/start`);
      expect((await call(host, 'PATCH', `/story-games/${view.id}/settings`, { timerSeconds: 30 })).json().code).toBe('GAME_STARTED');
    });

    it('refuses to start a story that was unpublished since, and keeps the lobby', async () => {
      const host = await signUp('uh');
      const mate = await signUp('um');
      await befriend(host, mate);
      const { view, story: s } = await lobby(host, [mate]);
      await pool.query(`UPDATE stories SET status = 'draft' WHERE id = $1`, [s.id]);
      const res = await call(host, 'POST', `/story-games/${view.id}/start`);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('STORY_UNAVAILABLE');
      expect((await getView(host, view.id)).status).toBe('lobby');
      // a game past its start keeps its own copy of the text whatever happens to the story
      await pool.query(`UPDATE stories SET status = 'published' WHERE id = $1`, [s.id]);
      await call(host, 'POST', `/story-games/${view.id}/start`);
      await pool.query(`UPDATE stories SET status = 'draft' WHERE id = $1`, [s.id]);
      expect((await call(mate, 'GET', `/story-games/${view.id}/story`)).statusCode).toBe(200);
    });

    it('advances only from the state it was pressed on, and not before the soft cap', async () => {
      const host = await signUp('ah');
      const mate = await signUp('am');
      await befriend(host, mate);
      const { view } = await lobby(host, [mate], { timerSeconds: 0 });
      const reading = (await call(host, 'POST', `/story-games/${view.id}/start`)).json() as StoryGameView;
      const early = await call(host, 'POST', `/story-games/${view.id}/advance`, { from: { status: 'reading', index: 0 } });
      expect(early.json().code).toBe('TOO_EARLY');
      await pool.query(`UPDATE story_games SET reading_soft_cap_at = now() - interval '1 second' WHERE id = $1`, [view.id]);
      // a control pressed on a state the game has left does nothing
      const stale = (await call(host, 'POST', `/story-games/${view.id}/advance`, { from: { status: 'reveal', index: 0 } })).json() as StoryGameView;
      expect(stale.version).toBe(reading.version);
      expect(stale.status).toBe('reading');
      const q = (await call(host, 'POST', `/story-games/${view.id}/advance`, { from: { status: 'reading', index: 0 } })).json() as StoryGameView;
      expect(q.status).toBe('question');
      // an untimed question: the host may reveal it now
      const notHost = await call(mate, 'POST', `/story-games/${view.id}/advance`, { from: { status: 'question', index: 0 } });
      expect(notHost.json().code).toBe('NOT_HOST');
      const revealed = (await call(host, 'POST', `/story-games/${view.id}/advance`, { from: { status: 'question', index: 0 } })).json() as StoryGameView;
      expect(revealed.status).toBe('reveal');
      expect(revealed.reveal!.answeredCount).toBe(0);
      // pressed twice (the second tap lands after the first moved it on): nothing
      const twice = (await call(host, 'POST', `/story-games/${view.id}/advance`, { from: { status: 'question', index: 0 } })).json() as StoryGameView;
      expect(twice.version).toBe(revealed.version);
    });

    it('a timed question is not the host’s to close', async () => {
      const host = await signUp('th');
      const mate = await signUp('tm');
      await befriend(host, mate);
      const { view } = await lobby(host, [mate], { timerSeconds: 30 });
      await call(host, 'POST', `/story-games/${view.id}/start`);
      await call(host, 'POST', `/story-games/${view.id}/done-reading`);
      await call(mate, 'POST', `/story-games/${view.id}/done-reading`);
      const res = await call(host, 'POST', `/story-games/${view.id}/advance`, { from: { status: 'question', index: 0 } });
      expect(res.json().code).toBe('CANNOT_ADVANCE');
    });

    it('extra time doubles one player’s clock, and only theirs', async () => {
      const host = await signUp('xh');
      const mate = await signUp('xm');
      await befriend(host, mate);
      const { view } = await lobby(host, [mate], { timerSeconds: 30 });
      const on = (await call(mate, 'POST', `/story-games/${view.id}/extra-time`, { on: true })).json() as StoryGameView;
      expect(on.extraTime).toBe(true);
      await call(host, 'POST', `/story-games/${view.id}/start`);
      await call(host, 'POST', `/story-games/${view.id}/done-reading`);
      await call(mate, 'POST', `/story-games/${view.id}/done-reading`);
      const hv = await getView(host, view.id);
      const mv = await getView(mate, view.id);
      const left = (v: StoryGameView) => new Date(v.phaseEndsAt!).getTime() - new Date(v.serverNow).getTime();
      expect(left(hv)).toBeLessThanOrEqual(30_000);
      expect(left(mv)).toBeGreaterThan(55_000);
      // nobody else is told
      expect(JSON.stringify(hv)).not.toContain('"extraTime":true');
    });
  });

  describe('blocks', () => {
    it('in a lobby both are in, the blocked one is taken out — the blocker, when the blocked one hosts', async () => {
      const host = await signUp('blh');
      const a = await signUp('bla');
      const b = await signUp('blb');
      for (const x of [a, b]) await befriend(host, x);
      const { view } = await lobby(host, [a, b], { mode: 'group' });
      expect((await call(a, 'POST', `/friends/${b.id}/block`)).statusCode).toBeLessThan(300);
      // b sees exactly what a host's removal looks like
      expect((await call(b, 'GET', `/story-games/${view.id}`)).statusCode).toBe(404);
      expect((await getView(a, view.id)).players.map((p) => p.seat)).toEqual([1, 2]);
      // and cannot come back while a is in it
      expect((await call(b, 'POST', '/story-games/join', { id: view.id })).statusCode).toBe(404);

      // b hosts, a is in it, a blocks b: a is the one taken out
      const c = await signUp('blc');
      await befriend(b, c);
      await befriend(b, host);
      const other = await lobby(b, [host, c], { mode: 'group' });
      await pool.query(`DELETE FROM blocks WHERE blocker_id = $1`, [a.id]);
      await befriend(a, b);
      await call(a, 'POST', '/story-games/join', { id: other.view.id });
      expect((await getView(a, other.view.id)).status).toBe('lobby');
      await call(a, 'POST', `/friends/${b.id}/block`);
      expect((await call(a, 'GET', `/story-games/${other.view.id}`)).statusCode).toBe(404);
      expect((await getView(b, other.view.id)).players).toHaveLength(3);
    });

    it('in a started game nobody is taken out; the two stop seeing each other’s names', async () => {
      const host = await signUp('bsh');
      const a = await signUp('bsa');
      const b = await signUp('bsb');
      for (const x of [a, b]) await befriend(host, x);
      await befriend(a, b);
      const { view } = await lobby(host, [a, b], { mode: 'group' });
      await call(host, 'POST', `/story-games/${view.id}/start`);
      expect((await getView(a, view.id)).players.find((p) => p.seat === 3)!.name).not.toBeNull();
      await call(b, 'POST', `/friends/${a.id}/block`);
      const av = await getView(a, view.id);
      expect(av.players).toHaveLength(3);
      expect(av.players.find((p) => p.seat === 3)!.name).toBeNull();
      expect((await getView(b, view.id)).players.find((p) => p.seat === 2)!.name).toBeNull();
      // the host still sees both
      expect((await getView(host, view.id)).players.every((p) => p.name !== null)).toBe(true);
    });
  });

  describe('reading around a game', () => {
    it('serves the game’s story to its members, with the recordings it has', async () => {
      const host = await signUp('rh');
      const s = await story('rd1');
      const v = (
        await call(host, 'POST', '/story-games', {
          mode: 'solo',
          storyId: s.id,
          questionCount: 3,
          timerSeconds: 0,
          textDuring: 'visible',
          access: 'friends',
        })
      ).json() as StoryGameView;
      const key = 'rojîn û azad diçin bazarê';
      await pool.query(
        `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms)
         VALUES ($1, 'Rojîn û Azad diçin bazarê.', $2, $3, 'audio/wav', 2000) ON CONFLICT (key) DO NOTHING`,
        [key, `lesson-audio/${suffix}.wav`, `https://media.example/${suffix}.wav`],
      );
      try {
        const detail = (await call(host, 'GET', `/story-games/${v.id}/story`)).json();
        expect(detail).toMatchObject({ id: s.id, slug: s.slug, dialect: 'kurmanci', length: 'short', fullyNarrated: false });
        expect(detail.paragraphs[0]).toContain('Rojîn û Azad');
        expect(detail.glossary[0].term).toBe('bazarê');
        expect(Object.keys(detail.audio)).toContain(key);
      } finally {
        await pool.query(`DELETE FROM lesson_audio WHERE key = $1 AND url = $2`, [key, `https://media.example/${suffix}.wav`]);
      }
      const stranger = await signUp('rs');
      expect((await call(stranger, 'GET', `/story-games/${v.id}/story`)).statusCode).toBe(404);
    });

    it('lists the games to go back to', async () => {
      const me = await signUp('ac');
      const s = await story('ac1');
      const v = (
        await call(me, 'POST', '/story-games', {
          mode: 'solo',
          storyId: s.id,
          questionCount: 3,
          timerSeconds: 0,
          textDuring: 'visible',
          access: 'friends',
          skipReading: true,
        })
      ).json() as StoryGameView;
      const active = (await call(me, 'GET', '/story-games/active')).json();
      expect(active.games).toEqual([
        { id: v.id, mode: 'solo', status: 'question', storyTitle: s.title, dialect: 'kurmanci', currentIndex: 0, total: 3 },
      ]);
    });
  });

  describe('leaving', () => {
    it('leaving a lobby takes you out; the host leaving closes it', async () => {
      const host = await signUp('lh');
      const a = await signUp('la');
      const b = await signUp('lb');
      await befriend(host, a);
      await befriend(host, b);
      const { view } = await lobby(host, [a, b], { mode: 'group' });
      expect((await call(a, 'POST', `/story-games/${view.id}/leave`)).json()).toEqual({ ok: true });
      expect((await call(a, 'GET', `/story-games/${view.id}`)).statusCode).toBe(404);
      const rows = await pool.query(`SELECT user_id FROM story_game_players WHERE game_id = $1`, [view.id]);
      expect(rows.rows.map((r) => r.user_id).sort()).toEqual([host.id, b.id].sort());
      await call(host, 'POST', `/story-games/${view.id}/leave`);
      const after = await getView(b, view.id);
      expect(after.status).toBe('cancelled');
      expect(after.code).toBeNull();
    });

    it('leaving a started game keeps your seat as gone, and the game goes on without you', async () => {
      const host = await signUp('gh2');
      const mate = await signUp('gm2');
      await befriend(host, mate);
      const { view } = await lobby(host, [mate], { timerSeconds: 0 });
      await call(host, 'POST', `/story-games/${view.id}/start`);
      await call(host, 'POST', `/story-games/${view.id}/done-reading`);
      await call(mate, 'POST', `/story-games/${view.id}/done-reading`);
      await call(host, 'POST', `/story-games/${view.id}/answers`, { index: 0, choice: 0 });
      // the mate leaves without answering: the question no longer waits for them
      await call(mate, 'POST', `/story-games/${view.id}/leave`);
      const hv = await getView(host, view.id);
      expect(hv.status).toBe('reveal');
      expect(hv.players.find((p) => p.seat === 2)).toMatchObject({ gone: true });
      // they can still read it
      expect((await getView(mate, view.id)).status).toBe('reveal');
      // nobody left: the game ends
      await call(host, 'POST', `/story-games/${view.id}/leave`);
      expect((await getView(host, view.id)).status).toBe('cancelled');
    });
  });

  describe('creating', () => {
    it('picks a story for "Surprise me", one you have not finished first', async () => {
      const me = await signUp('sp');
      const seen = await story('sp-seen', { dialect: 'sorani', level: 3 });
      // one not finished yet, so there is always one to prefer
      await story('sp-fresh', { dialect: 'sorani', level: 3 });
      await pool.query(`INSERT INTO story_completions (user_id, story_id) VALUES ($1, $2)`, [me.id, seen.id]);
      // (another suite's story of the same kind may be picked too — never the one already finished)
      for (let i = 0; i < 4; i++) {
        const v = (
          await call(me, 'POST', '/story-games', {
            mode: 'solo',
            dialect: 'sorani',
            length: 'short',
            level: 3,
            questionCount: 3,
            timerSeconds: 0,
            textDuring: 'visible',
            access: 'friends',
          })
        ).json() as StoryGameView;
        expect(v.settings.storyId).not.toBe(seen.id);
        expect(v.status).toBe('reading');
      }
      // nothing of that kind: NO_STORY
      const longOnes = await pool.query(
        `SELECT 1 FROM stories WHERE status = 'published' AND dialect = 'sorani' AND length = 'long' AND level = 3`,
      );
      expect(longOnes.rowCount).toBe(0);
      const none = await call(me, 'POST', '/story-games', {
        mode: 'solo',
        dialect: 'sorani',
        length: 'long',
        level: 3,
        questionCount: 5,
        timerSeconds: 0,
        textDuring: 'visible',
        access: 'friends',
      });
      expect(none.statusCode).toBe(404);
      expect(none.json().code).toBe('NO_STORY');
      // a count the length does not offer
      const bad = await call(me, 'POST', '/story-games', {
        mode: 'solo',
        dialect: 'sorani',
        length: 'short',
        questionCount: 10,
        timerSeconds: 0,
      });
      expect(bad.statusCode).toBe(400);
    });

    it('refuses an unpublished story, and a solo quiz on a story you are in a group game on', async () => {
      const me = await signUp('cr');
      const mate = await signUp('cm');
      await befriend(me, mate);
      const draft = await story('cr-draft', { status: 'in_review' });
      const res = await call(me, 'POST', '/story-games', {
        mode: 'solo',
        storyId: draft.id,
        questionCount: 3,
        timerSeconds: 0,
        textDuring: 'visible',
        access: 'friends',
      });
      expect(res.json().code).toBe('NO_STORY');

      const { story: s } = await lobby(mate, [me]);
      const solo = await call(me, 'POST', '/story-games', {
        mode: 'solo',
        storyId: s.id,
        questionCount: 3,
        timerSeconds: 0,
        textDuring: 'visible',
        access: 'friends',
      });
      expect(solo.statusCode).toBe(409);
      expect(solo.json().code).toBe('IN_GAME');
    });

    it('starting again on a story ends the unfinished solo game on it, keeping a finished one’s results', async () => {
      const me = await signUp('ag');
      const s = await story('ag1');
      const body = {
        mode: 'solo',
        storyId: s.id,
        questionCount: 3,
        timerSeconds: 0,
        textDuring: 'visible',
        access: 'friends',
        skipReading: true,
      };
      const first = (await call(me, 'POST', '/story-games', body)).json() as StoryGameView;
      const second = (await call(me, 'POST', '/story-games', body)).json() as StoryGameView;
      expect((await getView(me, first.id)).status).toBe('cancelled');
      // the second gets to its last reveal (paid), then a third replaces it: finished, not cancelled
      let v = second;
      for (let i = 0; i < 3; i++) {
        v = (await call(me, 'POST', `/story-games/${v.id}/answers`, { index: i, choice: 0 })).json();
        if (i < 2) v = (await call(me, 'POST', `/story-games/${v.id}/continue`, { index: i })).json();
      }
      expect(v.status).toBe('reveal');
      const ids = async () => ((await call(me, 'GET', '/story-games/active')).json().games as Array<{ id: string }>).map((g) => g.id);
      expect(await ids()).toContain(second.id);
      await call(me, 'POST', '/story-games', body);
      expect((await getView(me, second.id)).status).toBe('finished');
      expect(await ids()).not.toContain(second.id);
      expect(await ids()).not.toContain(first.id);
    });

    it('hosts at most three duo or group games: a fourth closes the oldest lobby, or is refused', async () => {
      const host = await signUp('hl');
      const s = await story('hl1');
      const make = () =>
        call(host, 'POST', '/story-games', {
          mode: 'group',
          storyId: s.id,
          questionCount: 3,
          timerSeconds: 60,
          textDuring: 'visible',
          access: 'friends',
        });
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) ids.push((await make()).json().id);
      const fourth = await make();
      expect(fourth.statusCode).toBe(201);
      expect((await getView(host, ids[0]!)).status).toBe('cancelled');
      // three running games and no lobby among them: refused
      await pool.query(`UPDATE story_games SET status = 'reading' WHERE id = ANY($1::uuid[])`, [[ids[1], ids[2], fourth.json().id]]);
      const fifth = await make();
      expect(fifth.statusCode).toBe(409);
      expect(fifth.json().code).toBe('TOO_MANY_GAMES');
      // a game idle for over six hours does not count
      await pool.query(`UPDATE story_games SET updated_at = now() - interval '7 hours' WHERE id = $1`, [ids[1]]);
      expect((await make()).statusCode).toBe(201);
    });

    it('needs an account with a birth month', async () => {
      const s = await story('nb1');
      const res = await app.inject({
        method: 'POST',
        url: '/story-games',
        payload: { mode: 'solo', storyId: s.id, questionCount: 3, timerSeconds: 0 },
        remoteAddress: ip(),
      });
      expect(res.statusCode).toBe(401);
      const noBirth = await signUp('nb');
      await pool.query(`UPDATE users SET birth_year = NULL, birth_month = NULL WHERE id = $1`, [noBirth.id]);
      const res2 = await call(noBirth, 'POST', '/story-games', { mode: 'solo', storyId: s.id, questionCount: 3, timerSeconds: 0 });
      expect(res2.statusCode).toBe(428);
      expect((await call(noBirth, 'POST', '/story-games/join', { code: 'ABC234' })).statusCode).toBe(428);
    });
  });
});
