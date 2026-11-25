/**
 * A letter's drawing is checked as a picture before the letter is delivered, against real Postgres with a stub checker
 * told what to find: a clear drawing goes as before, an uncertain one waits for a person (only its writer sees the
 * letter, marked held) and flies once approved, every moderator who reads it is on the Access log, and a child-safety
 * hit refuses the letter.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { isPictureRejection, type LetterDecor, type LetterThread, type VisitorAnswer } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { bornYearsAgo } from '../test/age.js';
import { memoryStorage } from '../test/media.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { StubImageScanner } from '../moderation/image-scanner.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('letter drawings are checked before they fly (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  const stub = new StubImageScanner();
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'ldc', 172);
  const { call } = kit;
  const people: Person[] = [];
  const adult = async (tag: string): Promise<Person> => {
    const p = await kit.person(tag, bornYearsAgo(30));
    people.push(p);
    return p;
  };
  let seq = 0;
  /** A drawing of its own, so each one is a new picture to check. */
  const drawing = (): LetterDecor => {
    seq++;
    const y = 300 + ((Date.now() + seq * 7) % 600);
    return { paper: { style: 'margin', tone: 'rose', ink: 'crimson' }, strokes: [{ tool: 'brush', color: 'leaf', width: 30, points: [100, y, 180 + seq, y + 60, 260, y] }], notes: [] };
  };
  const meet = async (writer: Person, caller: Person): Promise<VisitorAnswer> => {
    expect((await call('POST', '/letters/out', writer.token, { body: 'Silav! Ez kurdî hîn dibim.' })).statusCode).toBe(200);
    expect((await call('POST', '/letters/call', caller.token)).statusCode).toBe(200);
    const res = await call('POST', '/letters/visitor', caller.token, { body: 'Silav! Ez jî.' });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as VisitorAnswer;
  };
  const thread = async (p: Person, threadId: string): Promise<LetterThread> => (await call('GET', `/letters/threads/${threadId}`, p.token)).json() as LetterThread;

  beforeAll(async () => {
    app = buildApp(config, { moderation: { imageScanner: stub, moderatorCount: async () => 2, mailer: { send: async () => undefined } } });
    app.decorate('storage', memoryStorage());
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  // every scenario starts with no bird out or visiting, so the bird called is the one the test sent
  beforeEach(async () => {
    await pool.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE ended_at IS NULL`);
    await pool.query(`UPDATE letters SET status = 'recalled' WHERE status = 'flying'`);
  });

  afterAll(async () => {
    const ids = people.map((p) => p.id);
    await pool.query(`DELETE FROM moderation_cases WHERE subject_user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM image_scans WHERE uploader_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM media_uploads WHERE uploader_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await pool.end();
    await app.close();
  });

  it('sends a clear drawing as before', async () => {
    const [a, b] = [await adult('ca'), await adult('cb')];
    const met = await meet(a, b);
    const sent = await call('POST', `/letters/threads/${met.threadId}`, a.token, { body: 'Spas!', decor: drawing() });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json().letter).not.toHaveProperty('review');
    expect((await thread(b, met.threadId)).letters.at(-1)!.body).toBe('Spas!');
  });

  it('keeps a letter whose drawing a person must check from its reader, and delivers it once approved', async () => {
    const [a, b] = [await adult('ha'), await adult('hb')];
    const admin = await kit.admin('hadm', ['moderator']);
    people.push(admin);
    const met = await meet(a, b);
    stub.queue({ sexual: 'certain' });
    const sent = await call('POST', `/letters/threads/${met.threadId}`, a.token, { body: 'Binêre!', decor: drawing() });
    expect(sent.statusCode, sent.body).toBe(200);
    // a drawing is never refused outright: it waits, and only its writer sees the letter
    expect(sent.json().letter).toMatchObject({ review: 'held', mine: true });
    expect((await thread(a, met.threadId)).letters.at(-1)).toMatchObject({ body: 'Binêre!', review: 'held' });
    expect((await thread(b, met.threadId)).letters.map((l) => l.body)).not.toContain('Binêre!');
    // and the writer waits for it, as after any letter of theirs
    expect((await thread(a, met.threadId)).yourTurn).toBe(false);

    const letterId = sent.json().letter.id as string;
    const c = await pool.query<{ id: string; evidence: { letterId?: string; surface: string } }>(
      `SELECT id, evidence FROM moderation_cases WHERE source = 'image_flag' AND subject_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [a.id],
    );
    expect(c.rows[0]!.evidence).toMatchObject({ letterId, surface: 'letter' });
    const approved = await call('POST', `/admin/pictures/${c.rows[0]!.id}/decide`, admin.token, { decision: 'approve' });
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await thread(b, met.threadId)).letters.at(-1)).toMatchObject({ body: 'Binêre!' });
    expect((await thread(a, met.threadId)).letters.at(-1)).not.toHaveProperty('review');
    // told once, by the same notification and push any letter brings
    const told = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'kind' = 'letter' AND data->>'letterId' = $2`, [b.id, letterId]);
    expect(told.rowCount).toBe(1);
    expect((await pool.query(`SELECT released_at FROM letters WHERE id = $1`, [letterId])).rows[0]).toEqual({ released_at: null });
    expect(await app.pictures.afterRelease().then(() => pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'letterId' = $2`, [b.id, letterId]))).toMatchObject({
      rowCount: 1,
    });
    const owner = await pool.query<{ data: Record<string, unknown> }>(`SELECT data FROM notifications WHERE user_id = $1 AND data->>'kind' = 'picture_review'`, [a.id]);
    expect(owner.rows[0]!.data).toMatchObject({ outcome: 'approved', surface: 'letter', target: { type: 'letter_thread', id: met.threadId } });
  });

  it('records each moderator who reads a held letter’s drawing or its words, from the list, the picture or the case', async () => {
    const [a, b] = [await adult('ra'), await adult('rb')];
    const [lister, viewer, caseReader] = [await kit.admin('rl', ['moderator']), await kit.admin('rv', ['moderator']), await kit.admin('rc', ['moderator'])];
    people.push(lister, viewer, caseReader);
    const met = await meet(a, b);
    stub.queue({ sexual: 'certain' });
    expect((await call('POST', `/letters/threads/${met.threadId}`, a.token, { body: 'Binêre!', decor: drawing() })).statusCode).toBe(200);
    const c = await pool.query<{ id: string; evidence: { mediaKey: string } }>(
      `SELECT id, evidence FROM moderation_cases WHERE source = 'image_flag' AND subject_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [a.id],
    );
    const caseId = c.rows[0]!.id;
    expect((await call('GET', '/admin/pictures', lister.token)).statusCode).toBe(200);
    expect((await call('GET', `/admin/pictures/${caseId}/image`, viewer.token)).statusCode).toBe(200);
    const media = await call('GET', `/admin/moderation/cases/${caseId}/media?key=${encodeURIComponent(c.rows[0]!.evidence.mediaKey)}`, caseReader.token);
    expect(media.statusCode, media.body).toBe(200);
    const reads = await pool.query<{ staff_id: string; basis: string; subject_id: string }>(
      `SELECT staff_id, basis, subject_id FROM message_access_log WHERE kind = 'case' AND case_id = $1 ORDER BY at`,
      [caseId],
    );
    expect(reads.rows).toEqual([lister, viewer, caseReader].map((m) => ({ staff_id: m.id, basis: 'flag', subject_id: a.id })));
  });

  it('refuses a letter whose drawing is a possible child-safety hit, with nothing to ask about', async () => {
    const [a, b] = [await adult('sa'), await adult('sb')];
    const met = await meet(a, b);
    stub.queue({ minor_safety: 'possible' });
    const sent = await call('POST', `/letters/threads/${met.threadId}`, a.token, { body: 'Na.', decor: drawing() });
    expect(sent.statusCode).toBe(422);
    expect(isPictureRejection(sent.json())).toBe(true);
    expect(sent.json()).toMatchObject({ code: 'IMAGE_REJECTED', reason: 'other', reviewId: null });
    expect((await thread(a, met.threadId)).letters.map((l) => l.body)).not.toContain('Na.');
    const hit = await pool.query(`SELECT 1 FROM moderation_cases WHERE source = 'image_flag' AND subject_user_id = $1 AND priority = 0`, [a.id]);
    expect(hit.rowCount).toBe(1);
  });
});
