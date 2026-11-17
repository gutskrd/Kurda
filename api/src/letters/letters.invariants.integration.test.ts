/**
 * The promise the letters make, checked after every step of a long walk
 * against real Postgres: every letter delivered in an open correspondence is
 * either read and done with at the window, or still listed for the window of
 * the person it was written to. Nothing anybody does, in any order, and two
 * of them at the same moment, may leave a letter that nobody will ever see
 * land.
 *
 * Four adults send birds out, call them, answer them or send them on, write
 * back, open their letters, see them land, call their birds home, say goodbye
 * and block each other, chosen by a seeded random walk so a failure can be
 * replayed exactly. Every refusal must be one the app can explain (a 4xx), and
 * after every step the bird out, the bird at the window and the letters to
 * land must agree between the two people they concern.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { LettersHome } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { bornYearsAgo } from '../test/age.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { AppError } from '../plugins/errors.js';
import { LetterService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const SEED = 20261117;
const STEPS = 200;

/** A small seeded random source (mulberry32), so the same walk is taken every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.skipIf(!DATABASE_URL)('letters invariants (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let letters: LetterService;
  const kit = moderationKit(() => app, () => pool, 'lv', 155);
  const people: Person[] = [];

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 12 });
    letters = new LetterService(pool);
    for (const tag of ['a', 'b', 'c', 'd']) people.push(await kit.person(`walk${tag}`, bornYearsAgo(30)));
    // nobody else's bird is out while they walk
    await pool.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE ended_at IS NULL`);
    await pool.query(`UPDATE letters SET status = 'recalled', landed_at = COALESCE(landed_at, now()) WHERE status = 'flying'`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [people.map((p) => p.id)]);
    await pool.end();
    await app.close();
  });

  it('never leaves a delivered letter unaccounted for, whatever is done and in whatever order', { timeout: 180_000 }, async () => {
    const random = seeded(SEED);
    const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]!;
    const ids = people.map((p) => p.id);
    let written = 0;
    const words = () => `Silav, ev nameya min a ${++written} ye. Tu çawa yî?`;

    /** Runs one action; a refusal the app can explain is fine, anything else fails the walk. */
    const attempt = async (label: string, act: () => Promise<unknown>): Promise<void> => {
      try {
        await act();
      } catch (err) {
        if (!(err instanceof AppError) || err.statusCode >= 500) throw new Error(`${label} failed: ${String(err)}`, { cause: err });
      }
    };
    const openThreadsOf = async (id: string): Promise<string[]> =>
      (await pool.query<{ id: string }>(`SELECT id FROM letter_threads WHERE ended_at IS NULL AND (user_lo = $1 OR user_hi = $1) ORDER BY id`, [id])).rows.map((r) => r.id);

    /** One step of the walk, for the person `who`. */
    const step = async (who: string, kind: number): Promise<string> => {
      if (kind < 0.14) {
        await attempt('out', () => letters.sendOut(who, words()));
        return 'out';
      }
      if (kind < 0.27) {
        await attempt('call', () => letters.call(who));
        return 'call';
      }
      if (kind < 0.39) {
        await attempt('answer', () => letters.answer(who, words()));
        return 'answer';
      }
      if (kind < 0.44) {
        await attempt('send on', () => letters.sendOn(who));
        return 'send on';
      }
      if (kind < 0.6) {
        const threads = await openThreadsOf(who);
        if (threads.length > 0) await attempt('reply', () => letters.reply(who, pick(threads), words()));
        return 'reply';
      }
      if (kind < 0.72) {
        const threads = await openThreadsOf(who);
        if (threads.length > 0) await attempt('open', () => letters.thread(who, pick(threads)));
        return 'open';
      }
      if (kind < 0.86) {
        // what the window does: the first bird still to land comes in, and it says so
        const page = await letters.home(who);
        const next = page.landings?.find((l) => !l.landed)?.letterId ?? page.returned?.letterId;
        if (next) await attempt('landed', () => letters.landed(who, [next]));
        return 'landed';
      }
      if (kind < 0.93) {
        await attempt('recall', () => letters.recall(who));
        return 'recall';
      }
      if (kind < 0.98) {
        const threads = await openThreadsOf(who);
        if (threads.length > 0 && random() < 0.4) await attempt('goodbye', () => letters.end(who, pick(threads)));
        return 'goodbye';
      }
      const other = pick(ids.filter((id) => id !== who));
      if (random() < 0.3) await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [who, other]);
      return 'block';
    };

    /** The promise, and the agreement between the two sides of every bird. */
    const check = async (label: string): Promise<void> => {
      // a bird is never left at a window once its letter is no longer out
      const stray = await pool.query(
        `SELECT v.id FROM letter_visits v JOIN letters l ON l.id = v.letter_id WHERE v.ended_at IS NULL AND l.status <> 'flying' AND l.sender_id = ANY($1::uuid[])`,
        [ids],
      );
      expect(stray.rowCount, `${label}: a visit open on a letter no longer out`).toBe(0);

      const pages = new Map<string, LettersHome>();
      for (const id of ids) pages.set(id, await letters.home(id));
      const due = await pool.query<{ id: string; recipient_id: string; read: boolean; landed: boolean; answered: boolean }>(
        `SELECT l.id, l.recipient_id, l.read_at IS NOT NULL AS read, l.landed_at IS NOT NULL AS landed,
                EXISTS (SELECT 1 FROM letters r WHERE r.thread_id = l.thread_id AND r.sender_id = l.recipient_id
                           AND r.status IN ('delivered','removed') AND r.delivered_at > l.delivered_at) AS answered
           FROM letters l JOIN letter_threads t ON t.id = l.thread_id AND t.ended_at IS NULL
          WHERE l.status = 'delivered' AND l.recipient_id = ANY($1::uuid[])`,
        [ids],
      );
      for (const row of due.rows) {
        if (row.read && (row.landed || row.answered)) continue;
        const listed = pages.get(row.recipient_id)!.landings!.some((l) => l.letterId === row.id);
        expect(listed, `${label}: letter ${row.id} is neither done with nor listed to land`).toBe(true);
      }

      // the two sides of every bird agree: out and visiting for its writer, and on the sill of the one reading it
      for (const [id, page] of pages) {
        if (page.visitor) {
          const writer = pages.get(page.visitor.person.id);
          if (writer) expect(writer.out, `${label}: a visitor whose writer does not have it out`).toMatchObject({ visiting: true });
        }
        if (page.out?.visiting) {
          const at = [...pages.values()].filter((p) => p.visitor?.person.id === id);
          expect(at.length, `${label}: a bird visiting nowhere`).toBe(1);
        }
        if (page.out) {
          expect(page.flight, label).toBe(page.out.visiting ? 'window' : 'sky');
          expect(page.returned, label).toBeNull();
        } else {
          expect(['home', 'homeward'], label).toContain(page.flight);
        }
      }
    };

    for (let i = 0; i < STEPS; i++) {
      // the day's letters and calls are a limit per day: let a day pass now and then, for what is over and done
      if (i > 0 && i % 25 === 0) {
        await pool.query(`UPDATE letters SET created_at = created_at - interval '25 hours' WHERE sender_id = ANY($1::uuid[]) AND status <> 'flying'`, [ids]);
        await pool.query(`UPDATE letter_visits SET called_at = called_at - interval '25 hours' WHERE visitor_id = ANY($1::uuid[]) AND ended_at IS NOT NULL`, [ids]);
      }
      let label: string;
      if (random() < 0.25) {
        // two people at the same moment
        const [x, y] = [pick(ids), pick(ids)];
        const [kx, ky] = [random(), random()];
        const done = await Promise.all([step(x, kx), step(y, ky)]);
        label = `step ${i}: ${done.join(' + ')} at once`;
      } else {
        label = `step ${i}: ${await step(pick(ids), random())}`;
      }
      await check(label);
    }
    // the walk did more than refuse: people met, wrote, and their birds landed
    const delivered = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM letters WHERE status = 'delivered' AND sender_id = ANY($1::uuid[])`, [ids]);
    expect(delivered.rows[0]!.n).toBeGreaterThan(10);
  });
});
