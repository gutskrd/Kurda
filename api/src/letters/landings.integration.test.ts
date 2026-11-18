/**
 * Every letter lands at the window once, against real Postgres: a letter opened first in the correspondence still
 * lands, a landed one waits until read, every pen pal's bird is listed, older builds are bridged, a bird returns by
 * itself, open windows are pinged, and notifications come in the reader's language under the letters setting.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { LETTERS_CHANGED, type LetterThread, type LettersHome, type VisitorAnswer } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { bornYearsAgo } from '../test/age.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { restoreContent } from '../moderation/content-removal.js';
import { letterPushStillNews } from './notice.js';
import { LetterService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('letters landing at the window (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'ld', 151);
  const { call } = kit;
  const people: Person[] = [];
  const adult = async (tag: string): Promise<Person> => {
    const p = await kit.person(tag, bornYearsAgo(30));
    people.push(p);
    return p;
  };
  const letter = 'Silav! Ez ji Amedê me. Tu ji ku yî?';
  const out = async (p: Person, body = letter) => {
    const res = await call('POST', '/letters/out', p.token, { body });
    expect(res.statusCode, res.body).toBe(200);
  };
  /** The page as an app that reads `landings` asks for it. */
  const home = async (p: Person): Promise<LettersHome> => {
    const res = await call('GET', '/letters?landings=1', p.token);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as LettersHome;
  };
  /** The page as a build from before landings asks for it. */
  const oldHome = async (p: Person): Promise<LettersHome> => (await call('GET', '/letters', p.token)).json() as LettersHome;
  const callBird = (p: Person) => call('POST', '/letters/call', p.token);
  const answer = (p: Person, body = 'Silav! Ez ji Hewlêrê me.') => call('POST', '/letters/visitor', p.token, { body });
  const landed = (p: Person, letterIds: string[]) => call('POST', '/letters/landed', p.token, { letterIds });
  const open = (p: Person, threadId: string) => call('GET', `/letters/threads/${threadId}`, p.token);
  const write = (p: Person, threadId: string, body: string) => call('POST', `/letters/threads/${threadId}`, p.token, { body });
  /** One sends a bird out, the other calls it and answers: the two are pen pals. */
  const meet = async (writer: Person, caller: Person): Promise<VisitorAnswer> => {
    await out(writer);
    expect((await callBird(caller)).statusCode).toBe(200);
    const res = await answer(caller);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as VisitorAnswer;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
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

  it('lands an answer opened first in the correspondence, once, and then it waits until read', async () => {
    const [a, b] = [await adult('homea'), await adult('homeb')];
    const met = await meet(a, b);
    expect((await home(b)).landings).toEqual([]);

    const first = await home(a);
    expect(first.landings).toHaveLength(1);
    const landing = first.landings![0]!;
    expect(landing).toMatchObject({ threadId: met.threadId, how: 'home', landed: false, read: false, person: { id: b.id } });
    expect(first).toMatchObject({ out: null, flight: 'homeward', homecoming: { threadId: met.threadId, letterId: landing.letterId } });
    const told = await pool.query(`SELECT category, data FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [a.id]);
    expect(told.rows[0]).toMatchObject({ category: 'letters', data: { kind: 'letter', how: 'home', threadId: met.threadId, letterId: landing.letterId } });

    // opened from the notification first: read, and still to land
    expect((await open(a, met.threadId)).statusCode).toBe(200);
    expect((await home(a)).landings).toEqual([expect.objectContaining({ letterId: landing.letterId, read: true, landed: false })]);

    // the window shows it land: then it is done with, and asking again changes nothing
    expect((await landed(a, [landing.letterId])).statusCode).toBe(204);
    expect(await home(a)).toMatchObject({ landings: [], flight: 'home', homecoming: null });
    expect((await landed(a, [landing.letterId])).statusCode).toBe(204);
  });

  it('keeps a landed letter on the sill until it is read, and lists every pen pal’s bird, oldest first', async () => {
    const [a, b, c] = [await adult('silla'), await adult('sillb'), await adult('sillc')];
    const ab = await meet(a, b);
    const ac = await meet(a, c);
    for (const l of (await home(a)).landings!) await landed(a, [l.letterId]);
    await open(a, ab.threadId);
    await open(a, ac.threadId);
    expect((await write(a, ab.threadId, 'Tu çawa yî, Baran?')).statusCode).toBe(200);
    expect((await write(a, ac.threadId, 'Tu çawa yî, Cîwan?')).statusCode).toBe(200);
    expect((await write(b, ab.threadId, 'Baş im, spas!')).statusCode).toBe(200);
    expect((await write(c, ac.threadId, 'Ez jî baş im.')).statusCode).toBe(200);

    const both = await home(a);
    expect(both.landings!.map((l) => [l.person.id, l.how, l.landed])).toEqual([
      [b.id, 'window', false],
      [c.id, 'window', false],
    ]);
    // a build from before landings is told of the newest
    expect(both.arrival).toMatchObject({ threadId: ac.threadId, person: { id: c.id } });

    // landed but not read: it stays, on the sill, until the correspondence is opened
    await landed(a, [both.landings![0]!.letterId]);
    expect((await home(a)).landings![0]).toMatchObject({ person: { id: b.id }, landed: true, read: false });
    await open(a, ab.threadId);
    expect((await home(a)).landings!.map((l) => l.person.id)).toEqual([c.id]);
  });

  it('never lands a letter already read and answered, and lets nobody else land yours', async () => {
    const [a, b, c] = [await adult('answa'), await adult('answb'), await adult('answc')];
    const met = await meet(a, b);
    const mine = (await home(a)).landings![0]!;
    // he lands her letter, a stranger's id, and an id that is not a letter: nothing changes for her
    expect((await landed(b, [mine.letterId, randomUUID()])).statusCode).toBe(204);
    expect((await landed(c, [mine.letterId])).statusCode).toBe(204);
    expect((await home(a)).landings![0]).toMatchObject({ letterId: mine.letterId, landed: false });
    // more than the window is ever told of at once is refused
    expect((await landed(a, Array.from({ length: 11 }, () => randomUUID()))).statusCode).toBe(400);

    // read in the correspondence and written back to: it never flies in after that
    await open(a, met.threadId);
    expect((await write(a, met.threadId, 'Spas ji bo bersiva te!')).statusCode).toBe(200);
    expect((await home(a)).landings).toEqual([]);
  });

  it('keeps an answer to land while your bird is out again, and none after a goodbye or a block', async () => {
    const [a, b, c, d] = [await adult('agaa'), await adult('agab'), await adult('agac'), await adult('agad')];
    const met = await meet(a, b);
    await out(a, 'Silav! Ev nameya min a duyem e.');
    const again = await home(a);
    expect(again).toMatchObject({ flight: 'sky', out: { visiting: false } });
    expect(again.landings).toEqual([expect.objectContaining({ threadId: met.threadId, how: 'home', landed: false })]);
    // A build from before landings hides it while the bird is out and does not count it landed.
    expect((await oldHome(a)).homecoming).toMatchObject({ threadId: met.threadId });
    expect((await home(a)).landings![0]!.landed).toBe(false);

    expect((await call('POST', `/letters/threads/${met.threadId}/end`, b.token)).statusCode).toBe(204);
    expect((await home(a)).landings).toEqual([]);
    expect((await call('DELETE', '/letters/out', a.token)).statusCode).toBe(204);

    const cd = await meet(c, d);
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [d.id, c.id]);
    expect((await home(c)).landings).toEqual([]);
    expect((await open(c, cd.threadId)).statusCode).toBe(404);
  });

  it('counts the one letter a build from before landings shows as landed, and no other', async () => {
    const [a, b, c] = [await adult('olda'), await adult('oldb'), await adult('oldc')];
    const ab = await meet(a, b);
    // the homecoming it acts out is landed; it still waits to be read
    expect((await oldHome(a)).homecoming).toMatchObject({ threadId: ab.threadId });
    expect((await home(a)).landings![0]).toMatchObject({ landed: true, read: false });
    await open(a, ab.threadId);
    expect((await oldHome(a)).homecoming).toBeNull();

    // with a stranger's bird on the sill a pen pal's letter is not shown, so it is not landed
    expect((await write(a, ab.threadId, 'Silav dîsa!')).statusCode).toBe(200);
    await out(c);
    expect((await callBird(b)).statusCode).toBe(200);
    const sill = await oldHome(b);
    expect(sill.visitor).not.toBeNull();
    expect((await home(b)).landings![0]).toMatchObject({ how: 'window', landed: false });
    // once the sill is free it is
    expect((await call('DELETE', '/letters/visitor', b.token)).statusCode).toBe(204);
    expect((await oldHome(b)).arrival).toMatchObject({ threadId: ab.threadId });
    expect((await home(b)).landings![0]).toMatchObject({ how: 'window', landed: true });
  });

  it('says where your bird is: out, at a window and by when, and home by itself', async () => {
    const [a, b] = [await adult('wherea'), await adult('whereb')];
    expect((await home(a)).flight).toBe('home');
    await out(a);
    const sky = await home(a);
    expect(sky).toMatchObject({ flight: 'sky', out: { visiting: false, leavesBy: null } });
    expect(Date.parse(sky.out!.homeBy!) - Date.parse(sky.out!.since)).toBe(14 * 86_400_000);
    expect(Math.abs(Date.parse(sky.now!) - Date.now())).toBeLessThan(60_000);

    const { visitor } = (await callBird(b)).json() as { visitor: { leavesAt: string } };
    const reading = await home(a);
    expect(reading).toMatchObject({ flight: 'window', out: { visiting: true, leavesBy: visitor.leavesAt } });
    expect((await call('DELETE', '/letters/visitor', b.token)).statusCode).toBe(204);

    // fourteen days and nobody answered: it comes home by itself, and says so once
    await pool.query(`UPDATE letters SET created_at = now() - interval '15 days' WHERE sender_id = $1 AND status = 'flying'`, [a.id]);
    const back = await home(a);
    expect(back).toMatchObject({ out: null, flight: 'homeward', returned: { why: 'unanswered' } });
    expect((await landed(a, [back.returned!.letterId])).statusCode).toBe(204);
    expect(await home(a)).toMatchObject({ flight: 'home', returned: null });

    // called back by its writer, it has nothing to say: they watched it come
    await out(a);
    expect((await call('DELETE', '/letters/out', a.token)).statusCode).toBe(204);
    expect(await home(a)).toMatchObject({ flight: 'home', returned: null });
  });

  it('says what became of a bird that is not out when it is called back', async () => {
    const [a, b] = [await adult('backa'), await adult('backb')];
    expect((await call('DELETE', '/letters/out', a.token)).json()).toMatchObject({ code: 'NO_BIRD_OUT' });
    const met = await meet(a, b);
    const late = await call('DELETE', '/letters/out', a.token);
    expect(late.statusCode).toBe(404);
    expect(late.json()).toMatchObject({ code: 'BIRD_ANSWERED', details: { threadId: met.threadId } });
  });

  it('keeps the bird you have while it is out, so the one that flew is the one that comes home', async () => {
    const a = await adult('chga');
    await out(a);
    expect((await call('POST', '/letters/bird', a.token, { bird: 3 })).json()).toMatchObject({ code: 'BIRD_OUT' });
    expect((await call('DELETE', '/letters/out', a.token)).statusCode).toBe(204);
    expect((await call('POST', '/letters/bird', a.token, { bird: 3 })).statusCode).toBe(200);
  });

  it('tells a reader in the language they chose, under letters’ own setting', async () => {
    const [a, b] = [await adult('langa'), await adult('langb')];
    await pool.query(`UPDATE users SET locale = 'ku' WHERE id = $1`, [a.id]);
    await meet(a, b);
    const told = await pool.query(`SELECT category, title, body, data FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [a.id]);
    expect(told.rows[0]).toMatchObject({ category: 'letters', title: 'Balindeyê te vegeriya malê' });

    // A push held by quiet hours goes in the morning only while its letter still waits to land or be read.
    const stillNews = letterPushStillNews(pool);
    const held = { category: 'letters' as const, title: 't', body: 'b', data: told.rows[0].data as Record<string, string> };
    expect(await stillNews(a.id, held)).toBe(true);
    expect(await stillNews(b.id, held)).toBe(false);
    await landed(a, [held.data.letterId!]);
    expect(await stillNews(a.id, held)).toBe(false);
    expect(await stillNews(a.id, { category: 'friends', title: 't', body: 'b' })).toBe(true);

    // letters have a setting of their own, which follows the people setting until it is chosen
    const set = (body: object) =>
      app.inject({ method: 'PUT', url: '/me/notification-prefs', payload: body, headers: { authorization: `Bearer ${a.token}` }, remoteAddress: kit.ip() });
    expect((await call('GET', '/me/notification-prefs', a.token)).json()).toMatchObject({ letters: true });
    expect((await set({ friends: false })).statusCode).toBe(200);
    expect((await call('GET', '/me/notification-prefs', a.token)).json()).toMatchObject({ friends: false, letters: false });
    expect((await set({ letters: true })).statusCode).toBe(200);
    expect((await call('GET', '/me/notification-prefs', a.token)).json()).toMatchObject({ friends: false, letters: true });
  });

  it('marks read the letters the correspondence shows, and not one written after', async () => {
    const [a, b] = [await adult('snapa'), await adult('snapb')];
    const met = await meet(a, b);
    const page = (await open(a, met.threadId)).json() as LetterThread;
    expect(page.letters.filter((l) => !l.mine).every((l) => l.readAt !== null)).toBe(true);
    // A letter arriving after the page was read is still unread.
    await write(a, met.threadId, 'Silav dîsa!');
    const unread = await pool.query(`SELECT read_at FROM letters WHERE thread_id = $1 AND recipient_id = $2 ORDER BY created_at DESC LIMIT 1`, [met.threadId, b.id]);
    expect(unread.rows[0]!.read_at).toBeNull();
  });

  it('gives back a letter on appeal without sending a bird out again or landing old news', async () => {
    const [a, b, c] = [await adult('appa'), await adult('appb'), await adult('appc')];
    await out(c);
    const bird = await pool.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND status = 'flying'`, [c.id]);
    await pool.query(`UPDATE letters SET status = 'removed' WHERE id = $1`, [bird.rows[0]!.id]);
    await restoreContent(pool, { type: 'letter', id: bird.rows[0]!.id, previousStatus: 'flying' });
    expect(await home(c)).toMatchObject({ out: null, flight: 'home', returned: null });

    // A bird that came home by itself weeks ago, never shown, then taken down and restored: old news too.
    await out(c, 'Silav! Kes gazî min nake.');
    const old = await pool.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND status = 'flying'`, [c.id]);
    await pool.query(`UPDATE letters SET status = 'removed', recalled_at = now() - interval '20 days', recalled_why = 'unanswered' WHERE id = $1`, [
      old.rows[0]!.id,
    ]);
    await restoreContent(pool, { type: 'letter', id: old.rows[0]!.id, previousStatus: 'recalled' });
    expect(await home(c)).toMatchObject({ out: null, flight: 'home', returned: null });

    // a letter taken down while unread, the correspondence going on past it: given back, it is no news
    const met = await meet(a, b);
    await open(a, met.threadId);
    expect((await write(a, met.threadId, 'Nameya duyem.')).statusCode).toBe(200);
    const second = await pool.query<{ id: string }>(`SELECT id FROM letters WHERE thread_id = $1 AND sender_id = $2 ORDER BY created_at DESC LIMIT 1`, [
      met.threadId,
      a.id,
    ]);
    await pool.query(`UPDATE letters SET status = 'removed' WHERE id = $1`, [second.rows[0]!.id]);
    expect((await write(b, met.threadId, 'Bersiva min.')).statusCode).toBe(200);
    await restoreContent(pool, { type: 'letter', id: second.rows[0]!.id, previousStatus: 'delivered' });
    const given = await pool.query(`SELECT status, read_at, landed_at FROM letters WHERE id = $1`, [second.rows[0]!.id]);
    expect(given.rows[0]).toMatchObject({ status: 'delivered', read_at: expect.any(Date), landed_at: expect.any(Date) });
    expect((await home(b)).landings).toEqual([]);
  });

  it('refuses a letter of nothing but marks nobody sees', async () => {
    const a = await adult('zwa');
    for (const body of ['​', '‌‌', '‏ ‎', '\u3164', '\u2800\u2800', '\u034F', '\uFE0F']) {
      expect((await call('POST', '/letters/out', a.token, { body })).json()).toMatchObject({ code: 'LETTER_SHORT' });
    }
    expect((await home(a)).out).toBeNull();
  });

  it('pings both people’s open windows on every change, and only them', async () => {
    const [a, b, c] = [await adult('pinga'), await adult('pingb'), await adult('pingc')];
    const pings: Array<[string, string]> = [];
    const letters = new LetterService(pool, { realtime: { notifyUser: async (uid, ev) => void pings.push([uid, ev.type]) } });
    const seen = (): string[] => {
      const who = pings.map(([uid, type]) => {
        expect(type).toBe(LETTERS_CHANGED);
        return uid === a.id ? 'a' : uid === b.id ? 'b' : uid === c.id ? 'c' : 'other';
      });
      pings.length = 0;
      return who.sort();
    };

    await letters.sendOut(a.id, letter);
    expect(seen()).toEqual(['a']);
    await letters.call(c.id);
    expect(seen()).toEqual(['a', 'c']);
    expect(await letters.sendOn(c.id)).toBe(true);
    expect(seen()).toEqual(['a', 'c']);
    await letters.call(b.id);
    expect(seen()).toEqual(['a', 'b']);
    const met = await letters.answer(b.id, 'Silav, ez Baran im.');
    expect(seen()).toEqual(['a', 'b']);
    await letters.reply(a.id, met.threadId, 'Silav Baran!');
    expect(seen()).toEqual(['a', 'b']);
    const toLand = (await letters.home(b.id)).landings!.map((l) => l.letterId);
    await letters.landed(b.id, toLand);
    expect(seen()).toEqual(['b']);
    await letters.landed(b.id, toLand);
    expect(seen()).toEqual([]);
    await letters.sendOut(c.id, letter);
    await letters.call(a.id);
    pings.length = 0;
    expect(await letters.recall(c.id)).toEqual({ recalled: true });
    expect(seen()).toEqual(['a', 'c']);
    await letters.end(b.id, met.threadId);
    expect(seen()).toEqual(['a', 'b']);
    await letters.chooseBird(c.id, 2);
    expect(seen()).toEqual(['c']);
  });
});
