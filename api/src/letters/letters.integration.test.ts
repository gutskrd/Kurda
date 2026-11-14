/**
 * Letters by bird against real Postgres: two birds meeting, pen pals writing
 * in turn, the bands that never mix, blocks and goodbyes, what a letter may
 * not hold, a report on a letter, a closed account taking its letters, and
 * choosing a bird: free the first time, paid for in Zêr after.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { LETTER_BIRD_PRICE, letterBirdOf, type BirdOutResult, type LetterThread, type LettersHome } from '@kurda/shared';
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

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  // every scenario starts with no bird out anywhere, so the one a bird meets is the one the test sent
  beforeEach(async () => {
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

  it('keeps a bird out until somebody else sends one, then the two letters cross and a correspondence opens', async () => {
    const [rojda, baran] = [await adult('rojda'), await adult('baran')];
    const first = await out(rojda);
    expect(first.kind).toBe('waiting');
    expect((await home(rojda)).out).not.toBeNull();

    const second = await out(baran, 'Silav Rojda! Ez Baran im, ji Hewlêrê. Kêfa min ji nameya te re hat.');
    if (second.kind !== 'met') throw new Error('the birds did not meet');
    // her letter has come to his window
    expect(second.letter.body).toBe(letter);
    expect(second.letter.mine).toBe(false);
    expect(second.person.id).toBe(rojda.id);

    // her bird is home again, and he is her pen pal, with his letter waiting for her
    const hers = await home(rojda);
    expect(hers.out).toBeNull();
    expect(hers.penPals).toHaveLength(1);
    expect(hers.penPals[0]).toMatchObject({ threadId: second.threadId, yourTurn: true, unread: 1, person: { id: baran.id } });
    // and she is told
    const told = await pool.query(`SELECT title, data FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [rojda.id]);
    expect(told.rows[0]).toMatchObject({ title: 'A bird came to your window', data: { kind: 'letter', threadId: second.threadId } });

    const thread = (await call('GET', `/letters/threads/${second.threadId}`, rojda.token)).json() as LetterThread;
    expect(thread.letters.map((l) => l.mine)).toEqual([true, false]);
    expect(thread.yourTurn).toBe(true);
    expect((await home(rojda)).penPals[0]!.unread).toBe(0);
  });

  it('lets either answer first after the meeting, and then one letter each in turn', async () => {
    const [a, b] = [await adult('turna'), await adult('turnb')];
    await out(a);
    const met = await out(b);
    if (met.kind !== 'met') throw new Error('the birds did not meet');
    // the two letters crossed in the same moment: both may write back
    expect((await home(a)).penPals[0]!.yourTurn).toBe(true);
    expect((await home(b)).penPals[0]!.yourTurn).toBe(true);
    const write = (p: Person) => call('POST', `/letters/threads/${met.threadId}`, p.token, { body: 'Spas ji bo nameya te, hevalê min!' });
    // he answers first; now it is hers, not his to write again
    expect((await write(b)).statusCode).toBe(200);
    expect((await write(b)).json()).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect((await home(b)).penPals[0]!.yourTurn).toBe(false);
    expect((await write(a)).statusCode).toBe(200);
    expect((await write(a)).json()).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect((await write(b)).statusCode).toBe(200);
  });

  it('never lets a letter cross between age bands', async () => {
    const [young, older, grown] = [await teen('young', 14), await teen('older', 16), await adult('grown')];
    expect((await out(young)).kind).toBe('waiting');
    // neither a sixteen-year-old's bird nor an adult's meets a fourteen-year-old's
    expect((await out(older)).kind).toBe('waiting');
    expect((await out(grown)).kind).toBe('waiting');
    // another fourteen-year-old's does
    const peer = await teen('peer', 15);
    expect((await out(peer)).kind).toBe('met');
  });

  it('never brings together two people with a block between them, whoever placed it', async () => {
    const [a, b] = [await adult('blocka'), await adult('blockb')];
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [b.id, a.id]);
    await out(a);
    expect((await out(b)).kind).toBe('waiting');
  });

  it('ends a correspondence for both at a goodbye, and never brings the two together again', async () => {
    const [a, b] = [await adult('byea'), await adult('byeb')];
    await out(a);
    const met = await out(b);
    if (met.kind !== 'met') throw new Error('the birds did not meet');
    expect((await call('POST', `/letters/threads/${met.threadId}/end`, b.token)).statusCode).toBe(204);
    expect((await home(a)).penPals).toHaveLength(0);
    const closed = (await call('GET', `/letters/threads/${met.threadId}`, a.token)).json() as LetterThread;
    expect(closed).toMatchObject({ closed: true, yourTurn: false });
    expect((await call('POST', `/letters/threads/${met.threadId}`, a.token, { body: 'Tu çima çûyî? Ez xemgîn im.' })).json()).toMatchObject({ code: 'LETTERS_ENDED' });
    // both send birds out again: they wait rather than meet each other a second time
    expect((await out(a)).kind).toBe('waiting');
    expect((await out(b)).kind).toBe('waiting');
  });

  it('closes a correspondence to anybody outside it, and across a block that comes later', async () => {
    const [a, b, c] = [await adult('pria'), await adult('prib'), await adult('pric')];
    await out(a);
    const met = await out(b);
    if (met.kind !== 'met') throw new Error('the birds did not meet');
    expect((await call('GET', `/letters/threads/${met.threadId}`, c.token)).statusCode).toBe(404);
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [a.id, b.id]);
    expect((await call('GET', `/letters/threads/${met.threadId}`, b.token)).statusCode).toBe(404);
    expect((await home(b)).penPals).toHaveLength(0);
  });

  it('sends one bird out at a time, and can call it back', async () => {
    const a = await adult('one');
    await out(a);
    expect((await call('POST', '/letters/out', a.token, { body: letter })).json()).toMatchObject({ code: 'BIRD_OUT' });
    expect((await call('DELETE', '/letters/out', a.token)).statusCode).toBe(204);
    expect((await home(a)).out).toBeNull();
    expect((await call('DELETE', '/letters/out', a.token)).statusCode).toBe(404);
  });

  it('refuses a letter with a link or a way to be reached, or too short to be a letter', async () => {
    const a = await adult('rules');
    const send = async (body: string) => (await call('POST', '/letters/out', a.token, { body })).json() as { code?: string };
    expect(await send(`${letter} www.example.org`)).toMatchObject({ code: 'LETTER_LINK' });
    expect(await send(`${letter} 0750 123 4567`)).toMatchObject({ code: 'LETTER_CONTACT' });
    expect(await send(`${letter} @rojda_99`)).toMatchObject({ code: 'LETTER_CONTACT' });
    expect(await send('Silav!')).toMatchObject({ code: 'LETTER_SHORT' });
    expect((await home(a)).out).toBeNull();
  });

  it('lets a letter be reported by the one who received it, and by nobody outside', async () => {
    const [a, b, c] = [await adult('repa'), await adult('repb'), await adult('repc')];
    await out(a);
    const met = await out(b);
    if (met.kind !== 'met') throw new Error('the birds did not meet');
    const report = (p: Person) => call('POST', '/reports', p.token, { targetType: 'letter', targetId: met.letter.id, category: 'harassment' });
    expect((await report(c)).statusCode).toBe(404);
    // nobody reports their own letter
    expect((await report(a)).statusCode).not.toBe(201);
    const filed = await report(b);
    expect(filed.statusCode, filed.body).toBe(201);
    const evidence = await pool.query<{ evidence: { text: string; context: unknown[] } }>(
      `SELECT evidence FROM reports WHERE target_type = 'letter' AND target_id = $1`,
      [met.letter.id],
    );
    expect(evidence.rows[0]!.evidence.text).toBe(letter);
    expect(evidence.rows[0]!.evidence.context.length).toBe(2);
  });

  it('takes a closed account’s letters with it, both sides of every correspondence', async () => {
    const [a, b] = [await adult('gonea'), await adult('goneb')];
    await out(a);
    const met = await out(b);
    if (met.kind !== 'met') throw new Error('the birds did not meet');
    await eraseAccountData(pool, a.id);
    const left = await pool.query(`SELECT 1 FROM letters WHERE thread_id = $1`, [met.threadId]);
    expect(left.rowCount).toBe(0);
    expect((await home(b)).penPals).toHaveLength(0);
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

    // a pen pal sees the bird chosen, at the meeting and after
    await out(a);
    const met = await out(b);
    if (met.kind !== 'met') throw new Error('the birds did not meet');
    expect(met.person.bird).toBe(mine);
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
