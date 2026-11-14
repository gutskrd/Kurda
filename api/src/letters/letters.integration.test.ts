/**
 * Letters by bird against real Postgres: a bird out until somebody calls it,
 * answered with the same bird or sent on, the day's calls, pen pals writing
 * in turn, the bands that never mix, blocks and goodbyes, what a letter may
 * not hold, a report on a letter, a closed account taking its letters, and
 * choosing a bird: free the first time, paid for in Zêr after.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import {
  BIRD_CALLS_PER_DAY,
  LETTER_BIRD_PRICE,
  letterBirdOf,
  type BirdOutResult,
  type LetterThread,
  type LetterVisitor,
  type LettersHome,
  type VisitorAnswer,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { bornYearsAgo } from '../test/age.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { eraseAccountData } from '../gdpr/service.js';
import { WalletService } from '../wallet/service.js';
import { LETTER_BIRD_REASON } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('letters by bird (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'lt', 149);
  const { call } = kit;
  const people: Person[] = [];
  const adult = async (tag: string): Promise<Person> => {
    const p = await kit.person(tag, bornYearsAgo(30));
    people.push(p);
    return p;
  };
  const teen = async (tag: string, years: number): Promise<Person> => {
    const p = await kit.person(tag, bornYearsAgo(years));
    people.push(p);
    return p;
  };
  const letter = 'Silav! Navê min Rojda ye. Tu çawa yî? Ez Kurdî hîn dibim.';
  const out = async (p: Person, body = letter): Promise<BirdOutResult> => {
    const res = await call('POST', '/letters/out', p.token, { body });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as BirdOutResult;
  };
  const home = async (p: Person): Promise<LettersHome> => (await call('GET', '/letters', p.token)).json() as LettersHome;
  const callBird = (p: Person) => call('POST', '/letters/call', p.token);
  const answer = (p: Person, body = 'Silav! Ez jî kurdî hîn dibim.') => call('POST', '/letters/visitor', p.token, { body });
  /** One sends a bird out, the other calls it and answers: the two are pen pals. */
  const meet = async (writer: Person, caller: Person): Promise<VisitorAnswer> => {
    await out(writer);
    const called = await callBird(caller);
    expect(called.statusCode, called.body).toBe(200);
    const res = await answer(caller);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as VisitorAnswer;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  // every scenario starts with no bird out anywhere and none at a window, so the bird called is the one the test sent
  beforeEach(async () => {
    await pool.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE ended_at IS NULL`);
    await pool.query(`UPDATE letters SET status = 'recalled' WHERE status = 'flying'`);
  });

  afterAll(async () => {
    // a bird paid for leaves a line in the ledger, which only the ledger's keeper may take away
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [people.map((p) => p.id)]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('keeps a bird out until somebody calls it, who answers with the same bird, and the two are pen pals', async () => {
    const [rojda, baran] = [await adult('rojda'), await adult('baran')];
    expect((await out(rojda)).kind).toBe('waiting');
    expect((await home(rojda)).out).toMatchObject({ visiting: false });

    // he sees her bird out there, and calls it
    const sky = await home(baran);
    expect(sky).toMatchObject({ birdsOut: 1, sky: [letterBirdOf(rojda.id)], callsLeft: BIRD_CALLS_PER_DAY, visitor: null });
    const called = await callBird(baran);
    expect(called.statusCode, called.body).toBe(200);
    const { visitor } = called.json() as { visitor: LetterVisitor };
    expect(visitor.person.id).toBe(rojda.id);
    expect(visitor.letter).toMatchObject({ body: letter, mine: false });
    expect(Date.parse(visitor.leavesAt) - Date.parse(visitor.since)).toBe(24 * 3_600_000);
    expect((await home(rojda)).out).toMatchObject({ visiting: true });
    const his = await home(baran);
    expect(his).toMatchObject({ birdsOut: 0, callsLeft: BIRD_CALLS_PER_DAY - 1, visitor: { person: { id: rojda.id } } });

    // with her bird on his sill, his own stays home until he answers or sends it on
    expect((await call('POST', '/letters/out', baran.token, { body: letter })).json()).toMatchObject({ code: 'VISITOR_HERE' });
    expect((await callBird(baran)).json()).toMatchObject({ code: 'VISITOR_HERE' });

    // a single word is a letter
    const answered = await answer(baran, 'Silav!');
    expect(answered.statusCode, answered.body).toBe(200);
    const opened = answered.json() as VisitorAnswer;
    expect(opened).toMatchObject({ person: { id: rojda.id }, letter: { body: 'Silav!', mine: true } });
    expect((await home(baran)).visitor).toBeNull();
    expect((await home(baran)).penPals[0]).toMatchObject({ threadId: opened.threadId, yourTurn: false });

    // her bird is home with his answer, and it is her turn
    const hers = await home(rojda);
    expect(hers.out).toBeNull();
    expect(hers.homecoming).toMatchObject({ threadId: opened.threadId, person: { id: baran.id } });
    expect(hers.penPals[0]).toMatchObject({ threadId: opened.threadId, yourTurn: true, unread: 1, person: { id: baran.id } });
    const told = await pool.query(`SELECT title, data FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [rojda.id]);
    expect(told.rows[0]).toMatchObject({ title: 'Your bird came home', data: { kind: 'letter', threadId: opened.threadId } });

    const thread = (await call('GET', `/letters/threads/${opened.threadId}`, rojda.token)).json() as LetterThread;
    expect(thread.letters.map((l) => [l.mine, l.body])).toEqual([
      [true, letter],
      [false, 'Silav!'],
    ]);
    expect(thread.yourTurn).toBe(true);
    expect((await home(rojda)).homecoming).toBeNull();
  });

  it('writes one letter each in turn once a correspondence is open', async () => {
    const [a, b] = [await adult('turna'), await adult('turnb')];
    const met = await meet(a, b);
    const write = (p: Person) => call('POST', `/letters/threads/${met.threadId}`, p.token, { body: 'Spas ji bo nameya te, hevalê min!' });
    // he answered her bird: it is hers to write now, not his again
    expect((await write(b)).json()).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect((await write(a)).statusCode).toBe(200);
    expect((await write(a)).json()).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect((await write(b)).statusCode).toBe(200);
  });

  it('sends a bird on its way, back out for somebody else, and never to the same window twice', async () => {
    const [a, b, c] = [await adult('ona'), await adult('onb'), await adult('onc')];
    await out(a);
    expect((await callBird(b)).statusCode).toBe(200);
    expect((await call('DELETE', '/letters/visitor', b.token)).statusCode).toBe(204);
    expect((await call('DELETE', '/letters/visitor', b.token)).statusCode).toBe(404);
    expect((await home(a)).out).toMatchObject({ visiting: false });
    // it does not come back to him, but it goes to her
    expect((await home(b)).birdsOut).toBe(0);
    expect((await callBird(b)).json()).toMatchObject({ code: 'NO_BIRDS_OUT' });
    expect(((await callBird(c)).json() as { visitor: LetterVisitor }).visitor.person.id).toBe(a.id);
  });

  it('lets a bird wait a day at a window, and then it flies on', async () => {
    const [a, b, c] = [await adult('daya'), await adult('dayb'), await adult('dayc')];
    await out(a);
    await callBird(b);
    await pool.query(`UPDATE letter_visits SET called_at = now() - interval '25 hours' WHERE visitor_id = $1 AND ended_at IS NULL`, [b.id]);
    expect((await home(b)).visitor).toBeNull();
    expect((await answer(b)).json()).toMatchObject({ code: 'NO_VISITOR' });
    expect(((await callBird(c)).json() as { visitor: LetterVisitor }).visitor.person.id).toBe(a.id);
  });

  it('calls only a few birds a day, so nobody leafs through everybody’s letters', async () => {
    const caller = await adult('calls');
    for (let i = 0; i < BIRD_CALLS_PER_DAY; i++) {
      await out(await adult(`writer${i}`));
      expect((await callBird(caller)).statusCode).toBe(200);
      expect((await call('DELETE', '/letters/visitor', caller.token)).statusCode).toBe(204);
    }
    await out(await adult('writerlast'));
    expect((await home(caller)).callsLeft).toBe(0);
    expect((await callBird(caller)).json()).toMatchObject({ code: 'CALLS_TODAY' });
  });

  it('never brings a letter across age bands', async () => {
    const [young, older, grown, peer] = [await teen('young', 14), await teen('older', 16), await adult('grown'), await teen('peer', 15)];
    await out(young);
    // neither a sixteen-year-old nor an adult sees or calls a fourteen-year-old's bird
    expect((await home(older)).birdsOut).toBe(0);
    expect((await callBird(older)).json()).toMatchObject({ code: 'NO_BIRDS_OUT' });
    expect((await callBird(grown)).json()).toMatchObject({ code: 'NO_BIRDS_OUT' });
    // another fourteen-year-old does
    expect(((await callBird(peer)).json() as { visitor: LetterVisitor }).visitor.person.id).toBe(young.id);
  });

  it('never brings a bird across a block, whoever placed it, and takes it off the sill when one comes', async () => {
    const [a, b, c, d] = [await adult('blocka'), await adult('blockb'), await adult('blockc'), await adult('blockd')];
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [b.id, a.id]);
    await out(a);
    expect((await callBird(b)).json()).toMatchObject({ code: 'NO_BIRDS_OUT' });
    await pool.query(`UPDATE letters SET status = 'recalled' WHERE sender_id = $1`, [a.id]);
    await out(c);
    await callBird(d);
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [d.id, c.id]);
    expect((await home(d)).visitor).toBeNull();
    expect((await home(c)).out).toMatchObject({ visiting: false });
  });

  it('ends a correspondence for both at a goodbye, and never brings the two together again', async () => {
    const [a, b] = [await adult('byea'), await adult('byeb')];
    const met = await meet(a, b);
    expect((await call('POST', `/letters/threads/${met.threadId}/end`, b.token)).statusCode).toBe(204);
    expect((await home(a)).penPals).toHaveLength(0);
    const closed = (await call('GET', `/letters/threads/${met.threadId}`, a.token)).json() as LetterThread;
    expect(closed).toMatchObject({ closed: true, yourTurn: false });
    expect((await call('POST', `/letters/threads/${met.threadId}`, a.token, { body: 'Tu çima çûyî? Ez xemgîn im.' })).json()).toMatchObject({ code: 'LETTERS_ENDED' });
    // her bird out again does not come to his window a second time
    await out(a);
    expect((await callBird(b)).json()).toMatchObject({ code: 'NO_BIRDS_OUT' });
  });

  it('closes a correspondence to anybody outside it, and across a block that comes later', async () => {
    const [a, b, c] = [await adult('pria'), await adult('prib'), await adult('pric')];
    const met = await meet(a, b);
    expect((await call('GET', `/letters/threads/${met.threadId}`, c.token)).statusCode).toBe(404);
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [a.id, b.id]);
    expect((await call('GET', `/letters/threads/${met.threadId}`, b.token)).statusCode).toBe(404);
    expect((await home(b)).penPals).toHaveLength(0);
  });

  it('sends one bird out at a time, and calls it home, from a window too', async () => {
    const [a, b] = [await adult('one'), await adult('oneb')];
    await out(a);
    expect((await call('POST', '/letters/out', a.token, { body: letter })).json()).toMatchObject({ code: 'BIRD_OUT' });
    await callBird(b);
    expect((await call('DELETE', '/letters/out', a.token)).statusCode).toBe(204);
    expect((await home(a)).out).toBeNull();
    expect((await home(b)).visitor).toBeNull();
    expect((await answer(b)).json()).toMatchObject({ code: 'NO_VISITOR' });
    expect((await call('DELETE', '/letters/out', a.token)).statusCode).toBe(404);
  });

  it('takes a single word, and refuses a link or a way to be reached', async () => {
    const a = await adult('rules');
    const send = async (body: string) => (await call('POST', '/letters/out', a.token, { body })).json() as { code?: string; kind?: string };
    expect(await send(`${letter} www.example.org`)).toMatchObject({ code: 'LETTER_LINK' });
    expect(await send(`${letter} 0750 123 4567`)).toMatchObject({ code: 'LETTER_CONTACT' });
    expect(await send(`${letter} @rojda_99`)).toMatchObject({ code: 'LETTER_CONTACT' });
    expect((await home(a)).out).toBeNull();
    expect(await send('Silav!')).toMatchObject({ kind: 'waiting' });
  });

  it('lets a letter be reported by whoever read it, at the window or in the correspondence, and by nobody outside', async () => {
    const [a, b, c, d] = [await adult('repa'), await adult('repb'), await adult('repc'), await adult('repd')];
    await out(a);
    const { visitor } = (await callBird(b)).json() as { visitor: LetterVisitor };
    const report = (p: Person, id: string) => call('POST', '/reports', p.token, { targetType: 'letter', targetId: id, category: 'harassment' });
    // the bird at his window: he read it, so he may report it; she never saw it
    expect((await report(c, visitor.letter.id)).statusCode).toBe(404);
    const atWindow = await report(b, visitor.letter.id);
    expect(atWindow.statusCode, atWindow.body).toBe(201);
    // a letter in a correspondence is kept with the letters round it
    const met = await meet(c, d);
    const thread = (await call('GET', `/letters/threads/${met.threadId}`, d.token)).json() as LetterThread;
    const theirs = thread.letters.find((l) => !l.mine)!;
    expect((await report(a, theirs.id)).statusCode).toBe(404);
    expect((await report(c, theirs.id)).statusCode).not.toBe(201);
    const filed = await report(d, theirs.id);
    expect(filed.statusCode, filed.body).toBe(201);
    const evidence = await pool.query<{ target_id: string; evidence: { text: string; context: unknown[] } }>(
      `SELECT target_id, evidence FROM reports WHERE target_type = 'letter' AND target_id = ANY($1::text[])`,
      [[visitor.letter.id, theirs.id]],
    );
    const of = (id: string) => evidence.rows.find((r) => r.target_id === id)!.evidence;
    expect(of(visitor.letter.id)).toMatchObject({ text: letter });
    expect(of(visitor.letter.id).context.length).toBe(1);
    expect(of(theirs.id).context.length).toBe(2);
  });

  it('takes a closed account’s letters and calls with it, both sides of every correspondence', async () => {
    const [a, b, c] = [await adult('gonea'), await adult('goneb'), await adult('gonec')];
    const met = await meet(a, b);
    await out(c);
    await callBird(a);
    await eraseAccountData(pool, a.id);
    const left = await pool.query(`SELECT 1 FROM letters WHERE thread_id = $1`, [met.threadId]);
    expect(left.rowCount).toBe(0);
    expect((await pool.query(`SELECT 1 FROM letter_visits WHERE visitor_id = $1`, [a.id])).rowCount).toBe(0);
    expect((await home(b)).penPals).toHaveLength(0);
    expect((await home(c)).out).toMatchObject({ visiting: false });
  });

  it('lets a bird be chosen once for free, shows it to pen pals, and asks Zêr for another', async () => {
    const [a, b] = [await adult('birda'), await adult('birdb')];
    const choose = (p: Person, bird: number) => call('POST', '/letters/bird', p.token, { bird });
    const before = await home(a);
    expect(before).toMatchObject({ bird: letterBirdOf(a.id), birdChosen: false, zer: 0 });

    // the first choice costs nothing, even with no Zêr at all
    const mine = (letterBirdOf(a.id) + 3) % 8;
    const chosen = await choose(a, mine);
    expect(chosen.statusCode, chosen.body).toBe(200);
    expect(chosen.json()).toMatchObject({ bird: mine, birdChosen: true, zer: 0 });

    // the bird chosen is the one seen out there, at a window, and by a pen pal after
    await out(a);
    expect((await home(b)).sky).toEqual([mine]);
    expect(((await callBird(b)).json() as { visitor: LetterVisitor }).visitor.person.bird).toBe(mine);
    expect((await answer(b)).statusCode).toBe(200);
    expect((await home(b)).penPals[0]!.person.bird).toBe(mine);

    // the same bird again is no change, and another is paid for
    expect((await choose(a, mine)).statusCode).toBe(409);
    const other = (mine + 1) % 8;
    const short = await choose(a, other);
    expect(short.statusCode).toBe(402);
    expect((await home(a)).bird).toBe(mine);
    const wallet = new WalletService(pool);
    await wallet.credit({ userId: a.id, currency: 'zer', amount: LETTER_BIRD_PRICE + 40, reason: 'test_grant', idempotencyKey: `lt-bird-${a.id}` });
    const changed = await choose(a, other);
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json()).toMatchObject({ bird: other, birdChosen: true, zer: 40 });
    const ledger = await pool.query(`SELECT amount FROM wallet_ledger WHERE user_id = $1 AND reason = $2`, [a.id, LETTER_BIRD_REASON]);
    expect(ledger.rows.map((r) => Number(r.amount))).toEqual([-LETTER_BIRD_PRICE]);

    // no such bird, and the bird goes with a closed account
    expect((await choose(a, 8)).statusCode).toBe(404);
    await eraseAccountData(pool, a.id);
    expect((await pool.query(`SELECT 1 FROM letter_birds WHERE user_id = $1`, [a.id])).rowCount).toBe(0);
  });
});
