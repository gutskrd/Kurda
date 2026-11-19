/**
 * Recording by person against real Postgres: each voice's lines from lessons, stories and the alphabet, existing takes
 * shown as done, a superadmin linking an account to a voice with the voice actor role, and that role recording only
 * its own lines. Runs on DATABASE_URL alone, with the storage PUT stubbed unless S3_ENDPOINT is set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { conversationLineKey, lessonAudioKey, reactionKey, reactionLine } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** A mono PCM WAV of a quiet tone, varied by `seed` so each is a new file. */
function wav(seconds: number, seed = 1): Buffer {
  const rate = 22050;
  const frames = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + frames * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(Math.sin((i * seed) / 10) * 3000), 44 + i * 2);
  return b;
}

interface Line {
  id: string;
  seq: number;
  store: string;
  key: string;
  text: string;
  voice: string;
  meaning: string | null;
  conversation: { id: string; part: number } | null;
  reaction: { character: string; id: string; moment: string } | null;
  cue: string | null;
  before: { name: string | null; text: string } | null;
  places: Array<{ label: string; status: string }>;
  take: { url: string; speaker: string | null; by: string | null } | null;
}

describe.skipIf(!DATABASE_URL)('recording by person (integration)', () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    ...(process.env.S3_ENDPOINT ? {} : { S3_ENDPOINT: 'http://127.0.0.1:9', S3_BUCKET: 'recording-test', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test' }),
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const id = `rp${s}`.slice(0, 32);
  const userIds: string[] = [];
  let owner = '';
  let actor = '';
  let actorId = '';
  let editor = '';
  let learner = '';
  let courseId = '';
  let draft = '';

  const conversation = {
    id,
    title: `Li bazarê ${s}`,
    speakers: [
      { name: 'Hamo', character: 'hamo' },
      { name: 'Xezo', character: 'xezo' },
    ],
    lines: [
      { speaker: 0, text: `Xezo, sêv ${s} çend in?`, en: 'Xezo, how much are the apples?' },
      { speaker: 1, text: `Ev sêv ${s} erzan in, xalo.`, en: 'These apples are cheap, uncle.' },
    ],
    prompt: 'Sêv çawa ne?',
    options: ['Erzan in', 'Biha ne'],
    correctIndex: 0,
  };
  const hamoLine = conversationLineKey(id, 0, conversation.lines[0]!.text);
  const xezoLine = conversationLineKey(id, 1, conversation.lines[1]!.text);
  const narrated = `Baran ${s} li baxçe dilîze.`;
  const cheer = reactionLine('hevalo', 'run-3-1')!;
  const kind = reactionLine('xezo', 'miss-1')!;
  const ourKeys = [hamoLine, xezoLine, lessonAudioKey(narrated), reactionKey(cheer), reactionKey(kind)];

  async function register(name: string, ip: string, roles: string): Promise<{ token: string; userId: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${s}@it.kurda.app`,
        username: `${name}_${s}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    const userId = res.json().user.id as string;
    userIds.push(userId);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [userId, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token);
    return { token, userId };
  }

  const get = (token: string, url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  const put = (token: string, url: string, payload: unknown) => app.inject({ method: 'PUT', url, payload: payload as never, headers: { authorization: `Bearer ${token}` } });
  const record = (token: string, text: string, query = '', seed = 1) =>
    app.inject({
      method: 'PUT',
      url: `/admin/lesson-audio?text=${encodeURIComponent(text)}${query}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/wav' },
      payload: wav(1, seed),
      remoteAddress: '10.97.0.9',
    });
  /** Every line of a voice, page after page. */
  async function allLines(token: string, voice: string, query = ''): Promise<Line[]> {
    const out: Line[] = [];
    let cursor: string | null = null;
    do {
      const res = await get(token, `/admin/recording/people/${voice}?limit=50${query}${cursor ? `&cursor=${cursor}` : ''}`);
      expect(res.statusCode, res.body).toBe(200);
      out.push(...(res.json().lines as Line[]));
      cursor = res.json().next;
    } while (cursor);
    return out;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (!process.env.S3_ENDPOINT) app.storage!.put = async () => undefined;
    const repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `rp-${s}`, titleKu: 'Deng', titleEn: `Voices course ${s}` });
    const unitId = await repo.createUnit(courseId, 1, 'Bazar', 'The market');
    const skillId = await repo.createSkill(unitId, 1, 'Kirîn', 'Buying');
    const live = await repo.createLesson(skillId, 1, 'Kirîn 1', 'Buying 1');
    await repo.addExercise(live, 1, 'conversation', conversation);
    await repo.publishLesson(live);
    // a draft beside it, with a line nobody plans a voice for: the narrator's
    draft = await repo.createLesson(skillId, 2, 'Kirîn 2', 'Buying 2');
    await repo.addExercise(draft, 1, 'listening', { prompt: 'Type what you hear.', accepted: [narrated] });

    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [ourKeys]);
    owner = (await register('rpOwner', '10.97.0.1', '{superadmin}')).token;
    editor = (await register('rpEditor', '10.97.0.2', '{content_editor}')).token;
    const voice = await register('rpVoice', '10.97.0.3', '{}');
    actorId = voice.userId;
    learner = (await register('rpLearner', '10.97.0.4', '{}')).token;
    // The owner gives the voice actor the role and Xezal's voice; the actor then signs in to the console with a code.
    expect((await put(owner, `/admin/users/${actorId}/voice-actor`, { on: true, reason: 'Records Xezal' })).statusCode).toBe(200);
    expect((await put(owner, `/admin/users/${actorId}/voices`, { voices: ['xezo'], reason: 'Records Xezal' })).statusCode).toBe(200);
    actor = voice.token;
    await pass2fa(app, actor);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [ourKeys]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE status = 'published' AND skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  it('lists every voice with what is left, and the voices linked to each account', async () => {
    const res = await get(editor, '/admin/recording/people');
    expect(res.statusCode, res.body).toBe(200);
    const people = res.json().people as Array<{ id: string; name: string; total: number; todo: number; linked: Array<{ id: string }> }>;
    expect(people.map((p) => p.id).slice(0, 3)).toEqual(['hamo', 'xezo', 'hevalo']);
    expect(people.map((p) => p.id)).toEqual(expect.arrayContaining(['narrator-kmr', 'narrator-ckb']));
    const xezal = people.find((p) => p.id === 'xezo')!;
    expect(xezal.name).toBe('Xezal');
    expect(xezal.todo).toBeGreaterThan(0);
    expect(xezal.linked.map((l) => l.id)).toContain(actorId);
    expect(res.json().mine).toEqual([]);
  });

  it('gives each voice its lines in course order, keyed as the studio keys them, drafts marked', async () => {
    const hamo = await allLines(editor, 'hamo');
    const mine = hamo.find((l) => l.key === hamoLine)!;
    expect(mine).toMatchObject({ text: conversation.lines[0]!.text, meaning: 'Xezo, how much are the apples?', conversation: { id, part: 0 }, take: null });
    expect(mine.places[0]).toMatchObject({ status: 'published' });
    const xezal = await allLines(editor, 'xezo');
    expect(xezal.find((l) => l.key === xezoLine)).toMatchObject({ before: { name: 'Hamo', text: conversation.lines[0]!.text } });
    const narrator = await allLines(editor, 'narrator-kmr');
    const line = narrator.find((l) => l.key === lessonAudioKey(narrated))!;
    expect(line.places[0]!.status).toBe('draft');
    // the alphabet's words are the narrator's too, in the alphabet's own store
    expect(narrator.some((l) => l.store === 'alphabet' && l.key === 'kmr:sound:a')).toBe(true);
    // pages follow one another in script order, with nothing twice
    const seqs = narrator.map((l) => l.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(narrator.map((l) => l.id)).size).toBe(narrator.length);
  });

  it('shows a take made in the studio as done, wherever it was made', async () => {
    expect((await record(editor, conversation.lines[0]!.text, `&line=${id}:0&speaker=hamo`)).statusCode).toBe(201);
    const done = await allLines(editor, 'hamo', '&status=done');
    expect(done.find((l) => l.key === hamoLine)?.take).toMatchObject({ speaker: 'hamo', by: `rpeditor_${s}`.slice(0, 30) });
    const todo = await allLines(editor, 'hamo', '&status=todo');
    expect(todo.some((l) => l.key === hamoLine)).toBe(false);
  });

  it('opens the console to a voice actor on their own voice, and nothing else', async () => {
    const session = await get(actor, '/admin/session');
    expect(session.json()).toMatchObject({ voices: ['xezo'], staffRoles: ['voice_actor'], capabilities: [] });
    const people = await get(actor, '/admin/recording/people');
    expect(people.json().people.map((p: { id: string }) => p.id)).toEqual(['xezo']);
    expect(people.json()).toMatchObject({ mine: ['xezo'], ownVoicesOnly: true });
    // who records what is not theirs to see
    expect(people.json().people[0].linked).toEqual([]);
    expect((await get(actor, '/admin/recording/people/hamo')).json().code).toBe('NOT_YOUR_VOICE');
    // the studio's list, a removal and every other page stay closed
    expect((await get(actor, '/admin/lesson-audio')).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/admin/lesson-audio?key=${encodeURIComponent(hamoLine)}`, headers: { authorization: `Bearer ${actor}` } })).statusCode).toBe(403);
    expect((await get(actor, '/admin/users')).statusCode).toBe(403);
    expect((await get(actor, '/admin/content/lessons')).statusCode).toBe(403);
    expect((await put(actor, `/admin/users/${actorId}/voices`, { voices: ['hamo'], reason: 'x' })).statusCode).toBe(403);
  });

  it('lets a voice actor record their own lines, and refuses anyone else’s before anything is stored', async () => {
    const hers = await record(actor, conversation.lines[1]!.text, `&line=${id}:1&speaker=xezo`, 2);
    expect(hers.statusCode, hers.body).toBe(201);
    expect(hers.json().key).toBe(xezoLine);
    const his = await record(actor, conversation.lines[0]!.text, `&line=${id}:0&speaker=xezo`, 3);
    expect(his.statusCode).toBe(403);
    expect(his.json().code).toBe('NOT_YOUR_LINE');
    // nor a phrase no lesson asks for
    expect((await record(actor, `Tiştekî din ${s}`, '', 4)).json().code).toBe('NOT_YOUR_LINE');
    const stored = await pool.query<{ url: string }>(`SELECT url FROM lesson_audio WHERE key = $1`, [hamoLine]);
    expect(stored.rows).toHaveLength(1);
    // the alphabet's words are the narrator's: not hers either
    const letter = await app.inject({
      method: 'PUT',
      url: `/admin/alphabet/audio?key=${encodeURIComponent('kmr:sound:a')}`,
      headers: { authorization: `Bearer ${actor}`, 'content-type': 'audio/wav' },
      payload: wav(1, 5),
    });
    expect(letter.json().code).toBe('NOT_YOUR_LINE');
    const done = await allLines(actor, 'xezo', '&status=done');
    expect(done.find((l) => l.key === xezoLine)?.take).toMatchObject({ speaker: 'xezo' });
  });

  it('records the characters’ reactions under their own voices and hands the recorded ones to the apps', async () => {
    const heard = async () => (await app.inject({ method: 'GET', url: '/reactions' })).json().takes as Array<{ character: string; id: string; src: string; voice: { speaker: string } | null }>;
    const before = await heard();
    expect(before.some((t) => t.id === cheer.id && t.character === 'hevalo')).toBe(false);

    const his = (await allLines(editor, 'hevalo')).find((l) => l.key === reactionKey(cheer))!;
    expect(his).toMatchObject({ text: 'Aferîn!', meaning: 'Well done!', reaction: { character: 'hevalo', id: 'run-3-1', moment: 'run-3' }, take: null });
    expect(his.cue).toMatch(/three answers right/);
    // an editor records it, naming any speaker: it is still Hevalo’s
    const saved = await record(editor, 'Aferîn!', `&reaction=hevalo:run-3-1&speaker=hamo`, 6);
    expect(saved.statusCode, saved.body).toBe(201);
    expect(saved.json()).toMatchObject({ key: reactionKey(cheer), speaker: 'hevalo' });
    // the same words without the reaction are a plain text's take, which nothing here touches
    expect((await pool.query(`SELECT 1 FROM lesson_audio WHERE key = $1`, [lessonAudioKey('Aferîn!')])).rowCount).toBe(0);
    // only the catalogue's words, for a line it has
    expect((await record(editor, 'Pir baş e!', `&reaction=hevalo:run-3-1`, 7)).json().code).toBe('REACTION_TEXT');
    expect((await record(editor, 'Aferîn!', `&reaction=hamo:run-3-1`, 7)).json().code).toBe('UNKNOWN_REACTION');
    expect((await record(editor, 'Aferîn!', `&reaction=hevalo:run-3-1&line=${id}:0`, 7)).json().code).toBe('INVALID_LINE');

    // the voice actor records Xezal's, and never Hevalo's
    expect((await record(actor, kind.ku, `&reaction=xezo:miss-1&speaker=xezo`, 8)).statusCode).toBe(201);
    expect((await record(actor, 'Aferîn!', `&reaction=hevalo:run-3-1&speaker=xezo`, 9)).json().code).toBe('NOT_YOUR_LINE');
    expect((await allLines(actor, 'xezo', '&status=done')).find((l) => l.key === reactionKey(kind))?.take).toMatchObject({ speaker: 'xezo' });

    // the apps hear both at once, each in its own character's voice
    const after = await heard();
    expect(after.find((t) => t.character === 'hevalo' && t.id === 'run-3-1')).toMatchObject({ src: saved.json().url, voice: { speaker: 'hevalo' } });
    expect(after.find((t) => t.character === 'xezo' && t.id === 'miss-1')).toMatchObject({ voice: { speaker: 'xezo' } });
    // the studio does not list them as recordings no lesson uses
    const studio = (await get(editor, '/admin/lesson-audio')).json().items as Array<{ key: string }>;
    expect(studio.some((i) => i.key === reactionKey(cheer))).toBe(false);
    // and a removal is heard at once too
    const gone = await app.inject({ method: 'DELETE', url: `/admin/lesson-audio?key=${encodeURIComponent(reactionKey(cheer))}`, headers: { authorization: `Bearer ${editor}` } });
    expect(gone.statusCode, gone.body).toBe(200);
    expect((await heard()).some((t) => t.character === 'hevalo' && t.id === 'run-3-1')).toBe(false);
  });

  it('keeps the people page and the links to the team', async () => {
    expect((await get(learner, '/admin/recording/people')).statusCode).toBe(404);
    expect((await put(editor, `/admin/users/${actorId}/voices`, { voices: ['hamo'], reason: 'x' })).statusCode).toBe(403);
    expect((await put(owner, `/admin/users/${actorId}/voices`, { voices: ['nobody'], reason: 'x' })).statusCode).toBe(400);
    expect((await put(owner, `/admin/users/${actorId}/voices`, { voices: ['xezo'], reason: '' })).json().code).toBe('REASON_REQUIRED');
    const both = await put(owner, `/admin/users/${actorId}/voices`, { voices: ['xezo', 'narrator-kmr'], reason: 'Also narrates' });
    expect(both.json()).toEqual({ voices: ['xezo', 'narrator-kmr'], changed: true });
    expect((await get(owner, `/admin/users/${actorId}/voices`)).json()).toEqual({ voices: ['xezo', 'narrator-kmr'] });
    // the role goes, and with it the console
    expect((await put(owner, `/admin/users/${actorId}/voice-actor`, { on: false, reason: 'Done recording' })).json()).toMatchObject({ ok: true });
    expect((await get(actor, '/admin/recording/people')).statusCode).toBe(404);
    const history = await pool.query<{ action: string; meta: { role: string } }>(
      `SELECT action, meta FROM admin_actions WHERE target_user_id = $1 ORDER BY created_at`,
      [actorId],
    );
    expect(history.rows.map((r) => [r.action, r.meta.role])).toEqual([
      ['role_grant', 'voice_actor'],
      ['role_revoke', 'voice_actor'],
    ]);
  });
});
