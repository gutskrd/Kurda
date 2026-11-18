/**
 * Letters that no concurrent actions can lose, and birds never stuck where nobody can answer them, against real
 * Postgres: crossing answers (in turn and at once), two windows calling at once, a recall or the fourteenth day
 * racing a call, a resend after a lost reply, suspensions, a mute, a birthday into another band, and a visiting bird
 * holding a pen pal place.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { BIRD_CALLS_PER_DAY, LETTERS_PER_DAY, PEN_PALS_MAX, type LetterThread, type LettersHome, type VisitorAnswer } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { bornYearsAgo } from '../test/age.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { canonicalPair } from '../friends/pair.js';
import { LetterService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('letters held and raced (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let letters: LetterService;
  const kit = moderationKit(() => app, () => pool, 'lh', 152);
  const { call } = kit;
  const people: Person[] = [];
  const person = async (tag: string, years = 30): Promise<Person> => {
    const p = await kit.person(tag, bornYearsAgo(years));
    people.push(p);
    return p;
  };
  const letter = 'Silav! Ez ji Qamişloyê me. Tu çawa yî?';
  const out = async (p: Person, body = letter) => {
    const res = await call('POST', '/letters/out', p.token, { body });
    expect(res.statusCode, res.body).toBe(200);
  };
  const home = async (p: Person): Promise<LettersHome> => (await call('GET', '/letters?landings=1', p.token)).json() as LettersHome;
  const callBird = (p: Person) => call('POST', '/letters/call', p.token);
  const answer = (p: Person, body = 'Silav! Ez baş im, tu?') => call('POST', '/letters/visitor', p.token, { body });
  const meet = async (writer: Person, caller: Person): Promise<VisitorAnswer> => {
    await out(writer);
    expect((await callBird(caller)).statusCode).toBe(200);
    const res = await answer(caller);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as VisitorAnswer;
  };
  /** Pen pals made straight in the table, for the place counts: correspondences open with each of `others`. */
  const penPals = async (p: Person, others: Person[]) => {
    for (const o of others) {
      const { lo, hi } = canonicalPair(p.id, o.id);
      await pool.query(`INSERT INTO letter_threads (user_lo, user_hi) VALUES ($1, $2)`, [lo, hi]);
    }
  };
  const withKey = (p: Person, url: string, body: object, key: string) =>
    app.inject({ method: 'POST', url, payload: body, headers: { authorization: `Bearer ${p.token}`, 'idempotency-key': key }, remoteAddress: kit.ip() });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 12 });
    letters = new LetterService(pool);
  });

  // Every scenario starts with no bird out or visiting, so the bird called is the one the test sent.
  beforeEach(async () => {
    await pool.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE ended_at IS NULL`);
    await pool.query(`UPDATE letters SET status = 'recalled', landed_at = COALESCE(landed_at, now()) WHERE status = 'flying'`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [people.map((p) => p.id)]);
    await pool.end();
    await app.close();
  });

  it('puts the second answer of two crossed birds into the correspondence the first opened', async () => {
    const [a, b] = [await person('crossa'), await person('crossb')];
    await out(a);
    await out(b, 'Silav! Ez Baran im, ji Wanê.');
    // each calls the other's bird: the only one out for them
    expect(((await callBird(a)).json() as { visitor: { person: { id: string } } }).visitor.person.id).toBe(b.id);
    expect(((await callBird(b)).json() as { visitor: { person: { id: string } } }).visitor.person.id).toBe(a.id);
    const first = await answer(a, 'Silav Baran, ez Rojda me.');
    expect(first.statusCode, first.body).toBe(200);
    const second = await answer(b, 'Silav Rojda! Bersiva min ji bo nameya te.');
    expect(second.statusCode, second.body).toBe(200);
    const threadId = (first.json() as VisitorAnswer).threadId;
    expect((second.json() as VisitorAnswer).threadId).toBe(threadId);

    // her own bird came home with his answer, and it is her turn
    const hers = await home(a);
    expect(hers).toMatchObject({ out: null, visitor: null });
    expect(hers.landings).toEqual([expect.objectContaining({ how: 'home', person: expect.objectContaining({ id: b.id }) })]);
    const thread = (await call('GET', `/letters/threads/${threadId}`, a.token)).json() as LetterThread;
    expect(thread.letters).toHaveLength(4);
    expect(thread.yourTurn).toBe(true);
    // his bird came home with her answer too, still to land
    expect((await home(b)).landings).toEqual([expect.objectContaining({ how: 'home', person: expect.objectContaining({ id: a.id }) })]);
  });

  it('lets two crossed birds be answered at the same moment, both answers kept', async () => {
    const [a, b] = [await person('samea'), await person('sameb')];
    await letters.sendOut(a.id, letter);
    await letters.sendOut(b.id, 'Silav! Ez ji Dihokê me.');
    expect((await letters.call(a.id)).person.id).toBe(b.id);
    expect((await letters.call(b.id)).person.id).toBe(a.id);
    const [ra, rb] = await Promise.allSettled([letters.answer(a.id, 'Silav, ez A me.'), letters.answer(b.id, 'Silav, ez B me.')]);
    expect(ra.status, String((ra as PromiseRejectedResult).reason)).toBe('fulfilled');
    expect(rb.status, String((rb as PromiseRejectedResult).reason)).toBe('fulfilled');
    const threads = await pool.query(`SELECT id FROM letter_threads WHERE user_lo = least($1::uuid, $2::uuid) AND user_hi = greatest($1::uuid, $2::uuid)`, [
      a.id,
      b.id,
    ]);
    expect(threads.rowCount).toBe(1);
    const count = await pool.query(`SELECT count(*)::int AS n FROM letters WHERE thread_id = $1 AND status = 'delivered'`, [threads.rows[0].id]);
    expect(count.rows[0].n).toBe(4);
  });

  it('gives two windows calling at the same moment two different birds', async () => {
    for (let round = 0; round < 4; round++) {
      const [x, y, b, c] = [await person(`twx${round}`), await person(`twy${round}`), await person(`twb${round}`), await person(`twc${round}`)];
      await letters.sendOut(x.id, letter);
      await letters.sendOut(y.id, letter);
      const [rb, rc] = await Promise.allSettled([letters.call(b.id), letters.call(c.id)]);
      expect(rb.status, String((rb as PromiseRejectedResult).reason)).toBe('fulfilled');
      expect(rc.status, String((rc as PromiseRejectedResult).reason)).toBe('fulfilled');
      const whose = (r: PromiseSettledResult<{ person: { id: string } }>) => (r as PromiseFulfilledResult<{ person: { id: string } }>).value.person.id;
      const got = [whose(rb), whose(rc)];
      expect(new Set(got)).toEqual(new Set([x.id, y.id]));
      await pool.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE ended_at IS NULL`);
      await pool.query(`UPDATE letters SET status = 'recalled', landed_at = now() WHERE status = 'flying'`);
    }
  }, 30_000);

  it('waits for a call in flight before calling a bird home, and takes it off that sill', async () => {
    const [a, c] = [await person('rcwa'), await person('rcwc')];
    await letters.sendOut(a.id, letter);
    const bird = (await pool.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND status = 'flying'`, [a.id])).rows[0]!.id;
    // a call that has claimed the bird and not yet committed
    const inFlight = await pool.connect();
    try {
      await inFlight.query('BEGIN');
      await inFlight.query(`SELECT 1 FROM letters WHERE id = $1 FOR UPDATE`, [bird]);
      await inFlight.query(`INSERT INTO letter_visits (letter_id, visitor_id) VALUES ($1, $2)`, [bird, c.id]);
      const recalling = letters.recall(a.id);
      await new Promise((r) => setTimeout(r, 150));
      await inFlight.query('COMMIT');
      expect(await recalling).toEqual({ recalled: true });
    } finally {
      inFlight.release();
    }
    const open = await pool.query(`SELECT 1 FROM letter_visits WHERE letter_id = $1 AND ended_at IS NULL`, [bird]);
    expect(open.rowCount).toBe(0);
    expect((await home(c)).visitor).toBeNull();
  });

  it('keeps a bird out on its fourteenth day when a call reaches it in the same moment', async () => {
    const [a, c] = [await person('lasta'), await person('lastc')];
    await letters.sendOut(a.id, letter);
    const bird = (await pool.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND status = 'flying'`, [a.id])).rows[0]!.id;
    await pool.query(`UPDATE letters SET created_at = now() - interval '14 days 1 minute' WHERE id = $1`, [bird]);
    // A call that reached the bird just before its time ran out and has not committed yet.
    const inFlight = await pool.connect();
    let page: Promise<LettersHome> | null = null;
    try {
      await inFlight.query('BEGIN');
      await inFlight.query(`SELECT 1 FROM letters WHERE id = $1 FOR UPDATE`, [bird]);
      await inFlight.query(`INSERT INTO letter_visits (letter_id, visitor_id) VALUES ($1, $2)`, [bird, c.id]);
      page = letters.home(a.id);
      await new Promise((r) => setTimeout(r, 150));
      await inFlight.query('COMMIT');
    } finally {
      inFlight.release();
    }
    expect((await page!).out).toMatchObject({ visiting: true });
    expect((await home(c)).visitor).toMatchObject({ person: { id: a.id } });
  });

  it('answers a repeated answer, reply or send with the letter already sent', async () => {
    const [a, b] = [await person('againa'), await person('againb')];
    await out(a);
    expect((await callBird(b)).statusCode).toBe(200);
    const body = { body: 'Silav! Bersiva min a yekem.' };
    const once = await withKey(b, '/letters/visitor', body, 'answer-key-1');
    expect(once.statusCode, once.body).toBe(200);
    const twice = await withKey(b, '/letters/visitor', body, 'answer-key-1');
    expect(twice.statusCode, twice.body).toBe(200);
    expect((twice.json() as VisitorAnswer).letter.id).toBe((once.json() as VisitorAnswer).letter.id);
    // the same words from the other device, under another key: still that answer, and told once
    const other = await withKey(b, '/letters/visitor', body, 'answer-key-2');
    expect((other.json() as VisitorAnswer).letter.id).toBe((once.json() as VisitorAnswer).letter.id);
    expect((await answer(b, 'Tiştekî din.')).json()).toMatchObject({ code: 'NO_VISITOR' });
    const told = await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND data->>'kind' = 'letter'`, [a.id]);
    expect(told.rows[0].n).toBe(1);

    const threadId = (once.json() as VisitorAnswer).threadId;
    const reply = { body: 'Silav dîsa, ev nameya min e.' };
    const r1 = await withKey(a, `/letters/threads/${threadId}`, reply, 'reply-key-1');
    expect(r1.statusCode, r1.body).toBe(200);
    const r2 = await withKey(a, `/letters/threads/${threadId}`, reply, 'reply-key-1');
    const r3 = await withKey(a, `/letters/threads/${threadId}`, reply, 'reply-key-2');
    const id = (r1.json() as { letter: { id: string } }).letter.id;
    expect((r2.json() as { letter: { id: string } }).letter.id).toBe(id);
    expect((r3.json() as { letter: { id: string } }).letter.id).toBe(id);
    expect((await call('POST', `/letters/threads/${threadId}`, a.token, { body: 'Û nameyeke din.' })).json()).toMatchObject({ code: 'NOT_YOUR_TURN' });

    const s1 = await withKey(a, '/letters/out', { body: letter }, 'out-key-1');
    const s2 = await withKey(a, '/letters/out', { body: letter }, 'out-key-1');
    expect(s1.statusCode, s1.body).toBe(200);
    expect(s2.json()).toEqual(s1.json());
    const flying = await pool.query(`SELECT count(*)::int AS n FROM letters WHERE sender_id = $1 AND status = 'flying'`, [a.id]);
    expect(flying.rows[0].n).toBe(1);
  });

  it('lets letters flow again once a suspension is over, and frees a sill while one is in force', async () => {
    const [k, l, m] = [await person('susk'), await person('susl'), await person('susm')];
    const met = await meet(k, l);
    await pool.query(`UPDATE users SET banned_at = now() - interval '2 hours', banned_until = now() - interval '1 hour' WHERE id = $1`, [k.id]);
    expect((await call('GET', '/letters?landings=1', k.token)).statusCode).toBe(200);
    expect((await call('POST', `/letters/threads/${met.threadId}`, k.token, { body: 'Ez vegeriyam!' })).statusCode).toBe(200);
    await out(k);
    expect((await home(m)).birdsOut).toBe(1);

    // suspended again while the bird is on a sill: it leaves, and the sill is free to call another
    expect((await callBird(m)).statusCode).toBe(200);
    await pool.query(`UPDATE users SET banned_at = now(), banned_until = now() + interval '1 day' WHERE id = $1`, [k.id]);
    expect((await home(m)).visitor).toBeNull();
    expect((await answer(m)).json()).toMatchObject({ code: 'NO_VISITOR' });
  });

  it('keeps a muted writer’s bird out of every window until the mute is over', async () => {
    const [w, b, c] = [await person('mutw'), await person('mutb'), await person('mutc')];
    await out(w);
    expect((await callBird(b)).statusCode).toBe(200);
    await pool.query(`UPDATE users SET muted_until = now() + interval '1 hour' WHERE id = $1`, [w.id]);
    // It leaves the sill, and nobody else can call it.
    expect((await home(b)).visitor).toBeNull();
    expect((await callBird(c)).json()).toMatchObject({ code: 'NO_BIRDS_OUT' });
    expect((await home(w)).out).toMatchObject({ visiting: false });
    // the word filter's own mute holds it too, and once both are over it can be called again
    await pool.query(`UPDATE users SET muted_until = NULL WHERE id = $1`, [w.id]);
    await pool.query(`INSERT INTO chat_offenses (user_id, offense_count, muted_until) VALUES ($1, 3, now() + interval '1 hour')`, [w.id]);
    expect((await home(c)).birdsOut).toBe(0);
    await pool.query(`UPDATE chat_offenses SET muted_until = now() - interval '1 minute' WHERE user_id = $1`, [w.id]);
    expect(((await callBird(c)).json() as { visitor: { person: { id: string } } }).visitor.person.id).toBe(w.id);
  });

  it('sends a bird on from the sill of somebody muted after calling it', async () => {
    const [w, b, c] = [await person('vmw'), await person('vmb'), await person('vmc')];
    await out(w);
    expect((await callBird(b)).statusCode).toBe(200);
    await pool.query(`UPDATE users SET muted_until = now() + interval '1 hour' WHERE id = $1`, [b.id]);
    expect((await home(w)).out).toMatchObject({ visiting: false });
    expect(((await callBird(c)).json() as { visitor: { person: { id: string } } }).visitor.person.id).toBe(w.id);
  });

  it('sends a bird on from the sill of somebody closing their account, and calls none of theirs', async () => {
    const [w, b, c] = [await person('vdw'), await person('vdb'), await person('vdc')];
    await out(w);
    expect((await callBird(b)).statusCode).toBe(200);
    await pool.query(`UPDATE users SET deletion_requested_at = now() WHERE id = $1`, [b.id]);
    expect((await home(w)).out).toMatchObject({ visiting: false });
    expect(((await callBird(c)).json() as { visitor: { person: { id: string } } }).visitor.person.id).toBe(w.id);
    // and a bird of somebody closing their account is not called either
    expect((await call('POST', '/letters/visitor', c.token, { body: 'Silav, ez C me.' })).statusCode).toBe(200);
    await pool.query(`UPDATE users SET deletion_requested_at = NULL WHERE id = $1`, [b.id]);
    await out(b, 'Silav! Ez B me.');
    await pool.query(`UPDATE users SET deletion_requested_at = now() WHERE id = $1`, [b.id]);
    expect((await callBird(w)).json()).toMatchObject({ code: 'NO_BIRDS_OUT' });
  });

  it('keeps the place of the answer to a bird at the window among the day’s letters', async () => {
    const [w, b, p] = [await person('dpw'), await person('dpb'), await person('dpp')];
    // a pen pal of his has written back, so it is his turn there
    const met = await meet(p, b);
    expect((await call('POST', `/letters/threads/${met.threadId}`, p.token, { body: 'Silav dîsa!' })).statusCode).toBe(200);
    await out(w);
    expect((await callBird(b)).statusCode).toBe(200);
    // all of the day's letters written but the one the bird at his window waits for
    const sent = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM letters WHERE sender_id = $1 AND created_at > now() - interval '1 day' AND status <> 'recalled'`,
      [b.id],
    );
    await pool.query(
      `INSERT INTO letters (sender_id, body, age_band, status) SELECT $1, 'Silav', '18+', 'removed' FROM generate_series(1, $2)`,
      [b.id, LETTERS_PER_DAY - 1 - sent.rows[0]!.n],
    );
    // a reply cannot take that place, so the bird is never left with an answer that could not go
    expect((await call('POST', `/letters/threads/${met.threadId}`, b.token, { body: 'Bersiva min.' })).json()).toMatchObject({ code: 'LETTERS_TODAY' });
    const answered = await answer(b, 'Silav! Bersiva min ji bo teyrê te.');
    expect(answered.statusCode, answered.body).toBe(200);
  });

  it('keeps a place for the answer your bird will bring, and brings it home when the places fill', { timeout: 20_000 }, async () => {
    const [w, v, x] = [await person('fullw'), await person('fullv'), await person('fullx')];
    const others = await Promise.all([1, 2, 3, 4].map((i) => person(`fullo${i}`)));
    await penPals(w, others.slice(0, PEN_PALS_MAX - 1));
    await out(w);
    await out(x, 'Silav! Ez X me.');
    // Her bird at his window holds her fifth place, so answering another bird would leave no room for its answer.
    expect(((await callBird(w)).json() as { visitor: { person: { id: string } } }).visitor.person.id).toBe(x.id);
    expect(((await callBird(v)).json() as { visitor: { person: { id: string } } }).visitor.person.id).toBe(w.id);
    expect((await answer(w)).json()).toMatchObject({ code: 'PEN_PALS_FULL' });
    expect((await answer(v)).statusCode).toBe(200);

    // a bird flying while the places fill another way comes home, and says why
    const [y, z] = [await person('fully'), await person('fullz')];
    await penPals(y, others.slice(0, PEN_PALS_MAX - 1));
    await out(y);
    await penPals(y, [z]);
    expect(await home(y)).toMatchObject({ out: null, flight: 'homeward', returned: { why: 'full' } });
  });

  it('brings a bird home when its writer turns sixteen, and frees a sill when its reader does', async () => {
    const [writer, reader, other] = [await person('bdw', 15), await person('bdr', 15), await person('bdo', 15)];
    await out(writer);
    // The writer's birthday: nobody in the old band can be written back to.
    await pool.query(`UPDATE users SET birth_year = birth_year - 1 WHERE id = $1`, [writer.id]);
    expect(await home(writer)).toMatchObject({ out: null, returned: { why: 'band' } });

    await out(other);
    expect((await callBird(reader)).statusCode).toBe(200);
    await pool.query(`UPDATE users SET birth_year = birth_year - 1 WHERE id = $1`, [reader.id]);
    expect((await home(other)).out).toMatchObject({ visiting: false });
    expect((await home(reader)).visitor).toBeNull();
  });

  it('refuses a call whose answer the day’s letters could not carry, and does not count a bird called home at once', async () => {
    const [a, b, c] = [await person('daya'), await person('dayb'), await person('dayc')];
    await out(a);
    expect((await callBird(b)).statusCode).toBe(200);
    expect((await call('DELETE', '/letters/out', a.token)).statusCode).toBe(204);
    expect((await home(b)).callsLeft).toBe(BIRD_CALLS_PER_DAY);

    // letters called home were never sent, so they do not use up the day
    for (let i = 0; i < LETTERS_PER_DAY; i++) {
      await letters.sendOut(c.id, `Silav, ev nameya ${i + 1} e.`);
      await letters.recall(c.id);
    }
    await letters.sendOut(c.id, 'Silav, ev nameya dawî ye.');
    await letters.recall(c.id);
    await pool.query(
      `INSERT INTO letters (sender_id, body, age_band, status) SELECT $1, 'Silav', '18+', 'removed' FROM generate_series(1, $2)`,
      [c.id, LETTERS_PER_DAY],
    );
    await out(a);
    expect((await callBird(c)).json()).toMatchObject({ code: 'LETTERS_TODAY' });
    expect((await home(c)).callsLeft).toBe(BIRD_CALLS_PER_DAY);
  });
});
