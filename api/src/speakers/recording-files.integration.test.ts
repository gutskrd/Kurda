/**
 * What the admin panel's Characters page reads, against real Postgres: a
 * recording's own file through the API, the studio's lists with their stored
 * timelines, and the dictionary's pronunciations a page at a time.
 *
 * The bucket is held in memory (the storage's put and read are stubbed), and
 * other sites are a fake fetch and a fake name lookup, so nothing leaves the
 * machine: what is under test is what the API reads, refuses and sends.
 */
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { encodeLipsync, lessonAudioKey, lipsyncFromText, type LipsyncData } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { DictionaryRepository } from '../dictionary/repository.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { AUDIO_FILE_MAX_BYTES } from './recording-file.js';

const DATABASE_URL = process.env.DATABASE_URL;
const RATE = 22050;
const ADMIN_ORIGIN = 'https://admin.test';
const TIMEOUT_MS = 300;

/** A mono 16-bit PCM WAV of a quiet tone, `ms` long, varied by `seed` so each is a file of its own. */
function wav(ms: number, seed: number): Buffer {
  const frames = Math.round((ms / 1000) * RATE);
  const b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + frames * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(Math.sin((i * seed) / 10) * 3000), 44 + i * 2);
  return b;
}

/** An MP3 as its first bytes show it (an ID3 tag), padded to `size`. */
const mp3 = (size = 2048): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.concat([Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000'), Buffer.alloc(size - 10, 7)]));
/** An Ogg file, as Wikimedia Commons keeps most pronunciations. */
const ogg = (size = 2048): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(size - 4, 3)]));

/** Answers by address for the fake fetch; anything not here is a 404. */
type Upstream = (init: RequestInit) => Response | Promise<Response>;

describe.skipIf(!DATABASE_URL)('recording files and the Characters lists (integration)', () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    S3_ENDPOINT: 'http://127.0.0.1:9',
    S3_BUCKET: 'files-test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
    CDN_BASE_URL: 'https://media.test',
    CORS_ORIGINS: ADMIN_ORIGIN,
  });

  // the bucket
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  let storageDown = false;

  // other sites
  const upstream = new Map<string, Upstream>();
  const fetched: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
  const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    fetched.push({ url, redirect: init.redirect });
    const answer = upstream.get(url);
    return answer ? answer(init) : new Response('no such file', { status: 404 });
  }) as typeof fetch;
  const addresses = new Map<string, string[]>([
    ['upload.wikimedia.org', ['198.35.26.112', '2620:0:863:ed1a::2:b']],
    ['media.test', ['104.18.20.1']],
    ['evil.example', ['93.184.216.34']],
  ]);
  const fakeLookup = async (hostname: string) => {
    const found = addresses.get(hostname);
    if (!found) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    return found.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };

  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  // headwords of letters only, so the folded key keeps all of the run's tag
  const tag = s.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]!);
  const userIds: string[] = [];
  const entryIds: string[] = [];
  let editor = '';
  let learner = '';

  const T = { voiced: `Ez ê bêjim ${s}`, plain: `Ez nabêjim ${s}`, unrecorded: `Kes nabêje ${s}` };
  const LETTER = 'kmr:sound:c';
  const takes = new Map<string, Buffer>();
  let voicedLipsync: LipsyncData;
  /** dictionary pronunciations by what they are for */
  const dict: Record<string, string> = {};
  let commonsLipsync: LipsyncData;
  let courseId = '';

  async function register(name: string, ip: string, roles: string): Promise<string> {
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
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token);
    return token;
  }

  const get = (url: string, token: string | null = editor) =>
    app.inject({
      method: 'GET',
      url,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), origin: ADMIN_ORIGIN },
      remoteAddress: '10.95.0.9',
    });
  const file = (kind: string, key: string, token: string | null = editor) =>
    get(`/admin/audio/${kind}/file?${new URLSearchParams({ key })}`, token);

  beforeAll(async () => {
    app = buildApp(config, { recordingFiles: { fetch: fakeFetch, lookup: fakeLookup, timeoutMs: TIMEOUT_MS } });
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    app.storage!.put = async (key, body, contentType) => {
      objects.set(key, { body, contentType });
    };
    app.storage!.read = async (key) => {
      if (storageDown) throw new Error('storage unavailable');
      const found = objects.get(key);
      if (!found) return null;
      // in pieces, as a bucket streams it
      const pieces = [found.body.subarray(0, 1000), found.body.subarray(1000)];
      return { body: Readable.from(pieces), contentType: found.contentType, contentLength: found.body.length };
    };

    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [Object.values(T).map(lessonAudioKey)]);
    await pool.query(`DELETE FROM alphabet_audio WHERE key = $1`, [LETTER]);
    editor = await register('rfEditor', '10.95.0.1', '{content_editor}');
    learner = await register('rfLearner', '10.95.0.2', '{}');

    // two sentences, one with a speaker and a timeline, and one sound of the alphabet; files of
    // this run's own, since the same bytes already stored are reused and never put again
    const salt = (Date.now() % 997) / 997;
    takes.set(T.voiced, wav(900, 3 + salt));
    takes.set(T.plain, wav(700, 5 + salt));
    takes.set(LETTER, wav(500, 7 + salt));
    voicedLipsync = encodeLipsync(lipsyncFromText(T.voiced, 900));
    const put = (url: string, body: Buffer) =>
      app.inject({
        method: 'PUT',
        url,
        headers: { authorization: `Bearer ${editor}`, 'content-type': 'audio/wav' },
        payload: body,
        remoteAddress: '10.95.0.9',
      });
    const voiced = await put(
      `/admin/lesson-audio?${new URLSearchParams({ text: T.voiced, speaker: 'hamo', lipsync: JSON.stringify(voicedLipsync) })}`,
      takes.get(T.voiced)!,
    );
    expect(voiced.statusCode, voiced.body).toBe(201);
    expect((await put(`/admin/lesson-audio?${new URLSearchParams({ text: T.plain })}`, takes.get(T.plain)!)).statusCode).toBe(201);
    const letter = await put(
      `/admin/alphabet/audio?${new URLSearchParams({ key: LETTER, speaker: 'xezo', lipsync: JSON.stringify(encodeLipsync(lipsyncFromText('ca', 500))) })}`,
      takes.get(LETTER)!,
    );
    expect(letter.statusCode, letter.body).toBe(201);

    // a draft lesson that needs a sentence no one has recorded yet
    const content = new ContentRepository(pool);
    courseId = await content.createCourse({ slug: `rf-${s}`, titleKu: 'Deng', titleEn: `Files ${s}` });
    const unitId = await content.createUnit(courseId, 1, 'Yek', 'Unit one');
    const skillId = await content.createSkill(unitId, 1, 'Guh', 'Listening');
    const lessonId = await content.createLesson(skillId, 1, 'Guh 1', 'Listening 1');
    await content.addExercise(lessonId, 1, 'listening', { prompt: 'Type what you hear', accepted: [T.unrecorded] });

    // the dictionary's pronunciations: where each lives decides whether it can be read
    const dictionary = new DictionaryRepository(pool);
    const add = async (name: string, headword: string, url: string, voice: { speaker?: string; lipsync?: LipsyncData } = {}) => {
      const entryId = await dictionary.createEntry(headword);
      entryIds.push(entryId);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO dict_audio (entry_id, audio_url, speaker, lipsync) VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
        [entryId, url, voice.speaker ?? null, voice.lipsync ? JSON.stringify(voice.lipsync) : null],
      );
      dict[name] = rows[0]!.id;
    };
    commonsLipsync = encodeLipsync(lipsyncFromText('sêv', 600));
    await add('commons', `sêv${tag}`, `https://upload.wikimedia.org/wikipedia/commons/a/a1/Sev-${s}.ogg`, {
      speaker: 'hamo',
      lipsync: commonsLipsync,
    });
    await add('cdn', `Bajar${tag}`, `https://media.test/dict/${s}.mp3`, { speaker: 'xezo' });
    await add('plainHttp', `bav${tag}`, `http://upload.wikimedia.org/wikipedia/commons/b/b1/Bav-${s}.ogg`, { speaker: 'hevalo' });
    await add('elsewhere', `dar${tag}`, `https://evil.example/${s}.mp3`);
    await add('local', `deng${tag}`, `https://localhost/${s}.mp3`);
    await add('ftp', `dil${tag}`, `ftp://upload.wikimedia.org/${s}.ogg`);
    await add('notFound', `dot${tag}`, `https://upload.wikimedia.org/${s}/missing.ogg`);
    await add('wildcard', `%a_${tag}`, `https://media.test/dict/${s}-wild.mp3`);

    upstream.set(`https://upload.wikimedia.org/wikipedia/commons/a/a1/Sev-${s}.ogg`, () => new Response(ogg(), { headers: { 'content-type': 'application/ogg' } }));
    upstream.set(`https://media.test/dict/${s}.mp3`, () => new Response(mp3(), { headers: { 'content-type': 'audio/mpeg' } }));
    upstream.set(`https://upload.wikimedia.org/wikipedia/commons/b/b1/Bav-${s}.ogg`, () => new Response(ogg(1500)));
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [Object.values(T).map(lessonAudioKey)]);
    await pool.query(`DELETE FROM alphabet_audio WHERE key = $1`, [LETTER]);
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    if (courseId) await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  describe('GET /admin/audio/:kind/file', () => {
    it('sends a lesson recording from the bucket, as it was stored, for the panel’s origin to read', async () => {
      const res = await file('lesson', lessonAudioKey(T.voiced));
      expect(res.statusCode, res.body).toBe(200);
      expect(res.rawPayload.equals(takes.get(T.voiced)!)).toBe(true);
      expect(res.headers).toMatchObject({
        'content-type': 'audio/wav',
        'content-length': String(takes.get(T.voiced)!.length),
        'cache-control': 'private, no-store',
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        'access-control-allow-origin': ADMIN_ORIGIN,
      });
    });

    it('sends an alphabet recording, by its sound’s key', async () => {
      const res = await file('alphabet', LETTER);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.headers['content-type']).toBe('audio/wav');
      expect(res.rawPayload.equals(takes.get(LETTER)!)).toBe(true);
    });

    it('reads the bucket by the stored object key, never by a URL', async () => {
      const { rows } = await pool.query<{ media_key: string }>(`SELECT media_key FROM lesson_audio WHERE key = $1`, [
        lessonAudioKey(T.plain),
      ]);
      // the row's url pointed somewhere else: nothing fetches it
      await pool.query(`UPDATE lesson_audio SET url = 'https://evil.example/x.wav' WHERE key = $1`, [lessonAudioKey(T.plain)]);
      fetched.length = 0;
      const res = await file('lesson', lessonAudioKey(T.plain));
      expect(res.statusCode, res.body).toBe(200);
      expect(res.rawPayload.equals(objects.get(rows[0]!.media_key)!.body)).toBe(true);
      expect(fetched).toEqual([]);
    });

    it('says when there is no such recording, or its file is gone', async () => {
      const cases: Array<[string, string]> = [
        ['lesson', lessonAudioKey(T.unrecorded)],
        ['alphabet', 'kmr:sound:nope'],
        // a real sound, with no recording
        ['alphabet', 'kmr:sound:ç'],
        ['dictionary', 'not-a-uuid'],
        ['dictionary', '00000000-0000-4000-8000-000000000000'],
      ];
      await pool.query(`DELETE FROM alphabet_audio WHERE key = 'kmr:sound:ç'`);
      for (const [kind, key] of cases) {
        const res = await file(kind, key);
        expect(res.statusCode, `${kind} ${key}`).toBe(404);
        expect(res.json().code).toBe('NOT_FOUND');
      }

      const { rows } = await pool.query<{ media_key: string }>(`SELECT media_key FROM alphabet_audio WHERE key = $1`, [LETTER]);
      const kept = objects.get(rows[0]!.media_key)!;
      objects.delete(rows[0]!.media_key);
      try {
        const gone = await file('alphabet', LETTER);
        expect(gone.statusCode).toBe(404);
        expect(gone.json().message).toMatch(/not in storage/);
      } finally {
        objects.set(rows[0]!.media_key, kept);
      }
      // an unknown kind, or no key, is not a request at all
      expect((await file('voicemail', 'x')).statusCode).toBe(400);
      expect((await get('/admin/audio/lesson/file')).statusCode).toBe(400);
    });

    it('says the bucket did not answer', async () => {
      storageDown = true;
      try {
        const res = await file('lesson', lessonAudioKey(T.voiced));
        expect(res.statusCode).toBe(502);
        expect(res.json()).toMatchObject({ code: 'AUDIO_UNREACHABLE', details: { reason: 'storage' } });
      } finally {
        storageDown = false;
      }
    });

    it('is only for those who record', async () => {
      for (const [kind, key] of [
        ['lesson', lessonAudioKey(T.voiced)],
        ['dictionary', dict.commons!],
      ] as const) {
        expect((await file(kind, key, learner)).statusCode).toBe(404);
        expect((await file(kind, key, null)).statusCode).toBe(401);
      }
    });

    it('lets a batch over hundreds of recordings through', async () => {
      // the default limit is a hundred a minute; the Characters page reads two at a time
      for (let i = 0; i < 130; i++) {
        const res = await file('alphabet', LETTER);
        expect(res.statusCode, `request ${i + 1}`).toBe(200);
      }
    });

    describe('a dictionary pronunciation', () => {
      it('is fetched from Wikimedia Commons and sent as what its bytes show', async () => {
        fetched.length = 0;
        const res = await file('dictionary', dict.commons!);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.rawPayload.equals(ogg())).toBe(true);
        expect(res.headers).toMatchObject({
          'content-type': 'audio/ogg',
          'cache-control': 'private, no-store',
          'content-disposition': 'inline',
          'x-content-type-options': 'nosniff',
        });
        // redirects are followed here, one hop at a time
        expect(fetched).toEqual([{ url: `https://upload.wikimedia.org/wikipedia/commons/a/a1/Sev-${s}.ogg`, redirect: 'manual' }]);
      });

      it('is fetched from our own CDN', async () => {
        const res = await file('dictionary', dict.cdn!);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe('audio/mpeg');
        expect(res.rawPayload.equals(mp3())).toBe(true);
      });

      it('is fetched over https even when stored as http', async () => {
        fetched.length = 0;
        const res = await file('dictionary', dict.plainHttp!);
        expect(res.statusCode, res.body).toBe(200);
        expect(fetched.map((f) => f.url)).toEqual([`https://upload.wikimedia.org/wikipedia/commons/b/b1/Bav-${s}.ogg`]);
      });

      it('is refused from a host not on the list, without asking it anything', async () => {
        fetched.length = 0;
        for (const name of ['elsewhere', 'local', 'ftp']) {
          const res = await file('dictionary', dict[name]!);
          expect(res.statusCode, name).toBe(422);
          expect(res.json()).toMatchObject({ code: 'AUDIO_HOST_NOT_ALLOWED', details: { reason: 'host' } });
        }
        expect(fetched).toEqual([]);
      });

      it('is refused where an allowed name leads to an address that is not public', async () => {
        // our CDN's name, answered with an address inside: the name alone is not enough
        const usual = addresses.get('media.test')!;
        fetched.length = 0;
        try {
          for (const address of [
            '10.0.0.5',
            '127.0.0.1',
            '169.254.169.254',
            '172.16.4.4',
            '192.168.1.10',
            '100.64.0.1',
            '0.0.0.0',
            '::1',
            'fd00::1',
            'fe80::1',
            '::ffff:10.0.0.1',
            '64:ff9b::a00:1',
          ]) {
            // one bad address among good ones is enough
            addresses.set('media.test', ['104.18.20.1', address]);
            const res = await file('dictionary', dict.cdn!);
            expect(res.statusCode, address).toBe(422);
            expect(res.json()).toMatchObject({ code: 'AUDIO_HOST_NOT_ALLOWED', details: { reason: 'address' } });
          }
          expect(fetched).toEqual([]);
        } finally {
          addresses.set('media.test', usual);
        }
        expect((await file('dictionary', dict.cdn!)).statusCode).toBe(200);
      });

      it('follows a redirect within the list, and refuses one that leaves it', async () => {
        const start = `https://upload.wikimedia.org/wikipedia/commons/a/a1/Sev-${s}.ogg`;
        const original = upstream.get(start)!;
        try {
          // Commons to our CDN: both allowed
          upstream.set(start, () => new Response(null, { status: 302, headers: { location: `https://media.test/dict/${s}.mp3` } }));
          const within = await file('dictionary', dict.commons!);
          expect(within.statusCode, within.body).toBe(200);
          expect(within.headers['content-type']).toBe('audio/mpeg');

          // to a host off the list: refused before it is asked
          upstream.set(start, () => new Response(null, { status: 301, headers: { location: `https://evil.example/${s}.mp3` } }));
          fetched.length = 0;
          const away = await file('dictionary', dict.commons!);
          expect(away.statusCode).toBe(422);
          expect(away.json()).toMatchObject({ code: 'AUDIO_HOST_NOT_ALLOWED', details: { reason: 'host' } });
          expect(fetched.map((f) => f.url)).toEqual([start]);

          // to an allowed name that leads inside
          upstream.set(start, () => new Response(null, { status: 307, headers: { location: `https://media.test/dict/${s}.mp3` } }));
          addresses.set('media.test', ['127.0.0.1']);
          fetched.length = 0;
          const inside = await file('dictionary', dict.commons!);
          addresses.set('media.test', ['104.18.20.1']);
          expect(inside.statusCode).toBe(422);
          expect(inside.json().details.reason).toBe('address');
          expect(fetched.map((f) => f.url)).toEqual([start]);

          // round and round: two hops are followed, the third is not
          const hop = (n: number) => `https://upload.wikimedia.org/hop-${s}-${n}.ogg`;
          upstream.set(start, () => new Response(null, { status: 302, headers: { location: hop(1) } }));
          upstream.set(hop(1), () => new Response(null, { status: 302, headers: { location: hop(2) } }));
          upstream.set(hop(2), () => new Response(null, { status: 302, headers: { location: hop(3) } }));
          upstream.set(hop(3), () => new Response(ogg()));
          fetched.length = 0;
          const looping = await file('dictionary', dict.commons!);
          expect(looping.statusCode).toBe(502);
          expect(looping.json()).toMatchObject({ code: 'AUDIO_UNREACHABLE', details: { reason: 'redirects' } });
          expect(fetched).toHaveLength(3);
          upstream.set(hop(2), () => new Response(ogg()));
          expect((await file('dictionary', dict.commons!)).statusCode).toBe(200);
        } finally {
          upstream.set(start, original);
        }
      });

      it('says when the other site fails: not found, unknown, or not a recording', async () => {
        const missing = await file('dictionary', dict.notFound!);
        expect(missing.statusCode).toBe(502);
        expect(missing.json()).toMatchObject({ code: 'AUDIO_UNREACHABLE', details: { reason: 'status' } });

        const usual = addresses.get('upload.wikimedia.org')!;
        addresses.delete('upload.wikimedia.org');
        const unknown = await file('dictionary', dict.commons!);
        addresses.set('upload.wikimedia.org', usual);
        expect(unknown.statusCode).toBe(502);
        expect(unknown.json()).toMatchObject({ code: 'AUDIO_UNREACHABLE', details: { reason: 'dns' } });

        const page = `https://media.test/dict/${s}.mp3`;
        upstream.set(page, () => new Response('<!doctype html><title>Sign in</title>', { headers: { 'content-type': 'audio/mpeg' } }));
        try {
          const html = await file('dictionary', dict.cdn!);
          expect(html.statusCode).toBe(502);
          expect(html.json()).toMatchObject({ code: 'AUDIO_UNREACHABLE', details: { reason: 'not_audio' } });
        } finally {
          upstream.set(page, () => new Response(mp3(), { headers: { 'content-type': 'audio/mpeg' } }));
        }
      });

      it('is held to the size cap, whether the site says its size or not', async () => {
        const page = `https://media.test/dict/${s}.mp3`;
        const big = AUDIO_FILE_MAX_BYTES + 64 * 1024;
        try {
          let cancelled = false;
          upstream.set(
            page,
            () =>
              new Response(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(mp3(1024));
                  },
                  cancel() {
                    cancelled = true;
                  },
                }),
                { headers: { 'content-length': String(big) } },
              ),
          );
          const declared = await file('dictionary', dict.cdn!);
          expect(declared.statusCode).toBe(502);
          expect(declared.json()).toMatchObject({ code: 'AUDIO_UNREACHABLE', details: { reason: 'too_large' } });
          expect(cancelled).toBe(true);

          // no length given: sent as it comes, and cut off at the cap
          let produced = 0;
          upstream.set(
            page,
            () =>
              new Response(
                new ReadableStream({
                  pull(controller) {
                    const chunk = produced === 0 ? mp3(64 * 1024) : new Uint8Array(64 * 1024).fill(1);
                    produced += chunk.length;
                    controller.enqueue(chunk);
                    if (produced >= big) controller.close();
                  },
                }),
              ),
          );
          const streamed = await file('dictionary', dict.cdn!).then(
            () => null,
            (err: unknown) => err,
          );
          // the response is cut short, which the panel sees as a failed read
          expect(streamed).toBeInstanceOf(Error);
          // and the site was read no further than the chunk that went over
          expect(produced).toBeLessThanOrEqual(AUDIO_FILE_MAX_BYTES + 64 * 1024);
        } finally {
          upstream.set(page, () => new Response(mp3(), { headers: { 'content-type': 'audio/mpeg' } }));
        }
      });

      it('gives up when the other site is too slow', async () => {
        const page = `https://media.test/dict/${s}.mp3`;
        try {
          // no answer at all
          upstream.set(
            page,
            (init) =>
              new Promise<Response>((_, reject) => {
                init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
              }),
          );
          const started = Date.now();
          const silent = await file('dictionary', dict.cdn!);
          expect(silent.statusCode).toBe(502);
          expect(silent.json()).toMatchObject({ code: 'AUDIO_UNREACHABLE', details: { reason: 'timeout' } });
          expect(Date.now() - started).toBeLessThan(TIMEOUT_MS + 2000);

          // an answer whose first bytes never come
          upstream.set(page, (init) => {
            const body = new ReadableStream<Uint8Array>({
              start(controller) {
                init.signal!.addEventListener('abort', () => controller.error(init.signal!.reason));
              },
            });
            return new Response(body);
          });
          const stalled = await file('dictionary', dict.cdn!);
          expect(stalled.statusCode).toBe(502);
          expect(stalled.json()).toMatchObject({ code: 'AUDIO_UNREACHABLE', details: { reason: 'timeout' } });
        } finally {
          upstream.set(page, () => new Response(mp3(), { headers: { 'content-type': 'audio/mpeg' } }));
        }
      });
    });
  });

  describe('the studio’s lists, with their stored timelines', () => {
    type Item = Record<string, unknown> & { key: string };
    const find = (items: Item[], text: string): Item | undefined => items.find((i) => i.key === lessonAudioKey(text));

    it('lessons: each item’s timeline when asked for, and only then', async () => {
      const usual = await get('/admin/lesson-audio');
      expect(usual.statusCode, usual.body).toBe(200);
      const plainItems = usual.json().items as Item[];
      expect(find(plainItems, T.voiced)).toMatchObject({ recorded: true, speaker: 'hamo', hasLipsync: true });
      expect(plainItems.some((i) => 'lipsync' in i)).toBe(false);

      const res = await get('/admin/lesson-audio?withLipsync=1');
      expect(res.statusCode, res.body).toBe(200);
      const items = res.json().items as Item[];
      expect(find(items, T.voiced)).toMatchObject({ recorded: true, speaker: 'hamo', hasLipsync: true, lipsync: voicedLipsync });
      expect(find(items, T.plain)).toMatchObject({ recorded: true, speaker: null, hasLipsync: false, lipsync: null });
      expect(find(items, T.unrecorded)).toMatchObject({ recorded: false, hasLipsync: false, lipsync: null });
      // every item says, recorded or not, used or not
      expect(items.every((i) => 'lipsync' in i)).toBe(true);
      expect((await get('/admin/lesson-audio?withLipsync=true')).json().items).toEqual(items);
      expect((await get('/admin/lesson-audio?withLipsync=0')).json().items).toEqual(plainItems);
      expect((await get('/admin/lesson-audio?withLipsync=please')).statusCode).toBe(400);
    });

    it('the alphabet: each sound with its stored timeline', async () => {
      const res = await get('/admin/alphabet/audio');
      expect(res.statusCode, res.body).toBe(200);
      const recordings = res.json().recordings as Item[];
      expect(recordings.find((r) => r.key === LETTER)).toMatchObject({
        speaker: 'xezo',
        hasLipsync: true,
        lipsync: encodeLipsync(lipsyncFromText('ca', 500)),
      });
      expect(recordings.every((r) => 'lipsync' in r && r.hasLipsync === (r.lipsync !== null))).toBe(true);
    });
  });

  describe('GET /admin/dictionary/audio', () => {
    interface ListItem {
      id: string;
      entryId: string;
      headword: string;
      speaker: string | null;
      hasLipsync: boolean;
      lipsync: unknown;
    }
    const list = (query: Record<string, string>, token: string | null = editor) =>
      get(`/admin/dictionary/audio?${new URLSearchParams(query)}`, token);
    /** Every page of a listing, a few at a time. */
    async function all(query: Record<string, string>, limit = 3): Promise<ListItem[]> {
      const items: ListItem[] = [];
      let cursor: string | null = null;
      for (let pages = 0; pages < 1000; pages++) {
        const res = await list({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
        expect(res.statusCode, res.body).toBe(200);
        const page = res.json() as { items: ListItem[]; nextCursor: string | null };
        expect(page.items.length).toBeLessThanOrEqual(limit);
        items.push(...page.items);
        cursor = page.nextCursor;
        if (!cursor) return items;
      }
      throw new Error('the pages never ended');
    }
    const ids = (items: ListItem[]): string[] => items.map((i) => i.id);

    it('lists a pronunciation with its entry, who says it and its timeline', async () => {
      const res = await list({ q: `sêv${tag}` });
      expect(res.statusCode, res.body).toBe(200);
      const { rows } = await pool.query<{ entry_id: string }>(`SELECT entry_id FROM dict_audio WHERE id = $1`, [dict.commons]);
      expect(res.json()).toMatchObject({
        items: [
          {
            id: dict.commons,
            entryId: rows[0]!.entry_id,
            headword: `sêv${tag}`,
            dialect: 'kurmanji',
            url: `https://upload.wikimedia.org/wikipedia/commons/a/a1/Sev-${s}.ogg`,
            speaker: 'hamo',
            hasLipsync: true,
            lipsync: commonsLipsync,
          },
        ],
        nextCursor: null,
      });
      expect(Object.keys(res.json().items[0]).sort()).toEqual(
        ['id', 'entryId', 'headword', 'dialect', 'url', 'speaker', 'hasLipsync', 'lipsync'].sort(),
      );
      const plain = (await list({ q: `dar${tag}` })).json().items[0];
      expect(plain).toMatchObject({ id: dict.elsewhere, speaker: null, hasLipsync: false, lipsync: null });
    });

    it('finds by the start of the headword, in any case and without its accents, and takes % and _ as themselves', async () => {
      expect(ids((await list({ q: `SÊV${tag.toUpperCase()}` })).json().items)).toEqual([dict.commons]);
      expect(ids((await list({ q: `sev${tag}` })).json().items)).toEqual([dict.commons]);
      expect(ids((await list({ q: `bajar${tag}` })).json().items)).toEqual([dict.cdn]);
      // the start of it, not the middle
      expect((await list({ q: `êv${tag}` })).json().items).toEqual([]);
      // a wildcard is a character like any other
      expect(ids((await list({ q: `%a_${tag}` })).json().items)).toEqual([dict.wildcard]);
      const percent = (await list({ q: '%', limit: '200' })).json().items as ListItem[];
      expect(ids(percent)).toContain(dict.wildcard);
      expect(percent.every((i) => i.headword.startsWith('%'))).toBe(true);
      expect((await list({ q: `%_${tag}` })).json().items).toEqual([]);
      expect((await list({ q: `_${tag}` })).json().items).toEqual([]);
    });

    it('filters by who says it and whether it has a timeline', async () => {
      const none = await all({ speaker: 'none' });
      expect(none.every((i) => i.speaker === null)).toBe(true);
      expect(ids(none)).toEqual(expect.arrayContaining([dict.elsewhere, dict.local, dict.wildcard]));
      expect(ids(none)).not.toContain(dict.commons);

      const any = await all({ speaker: 'any' });
      expect(any.every((i) => i.speaker !== null)).toBe(true);
      expect(ids(any)).toEqual(expect.arrayContaining([dict.commons, dict.cdn, dict.plainHttp]));
      expect(ids(any)).not.toContain(dict.elsewhere);

      const hamo = await all({ speaker: 'hamo' });
      expect(hamo.every((i) => i.speaker === 'hamo')).toBe(true);
      expect(ids(hamo)).toContain(dict.commons);
      expect(ids(hamo)).not.toContain(dict.cdn);

      const missing = await all({ lipsync: 'missing' });
      expect(missing.every((i) => !i.hasLipsync && i.lipsync === null)).toBe(true);
      expect(ids(missing)).toEqual(expect.arrayContaining([dict.cdn, dict.elsewhere]));
      expect(ids(missing)).not.toContain(dict.commons);

      const present = await all({ lipsync: 'present' });
      expect(present.every((i) => i.hasLipsync && i.lipsync !== null)).toBe(true);
      expect(ids(present)).toContain(dict.commons);

      // what the Characters page's job works on: a character, and no timeline yet
      const toMake = await all({ speaker: 'any', lipsync: 'missing' });
      expect(toMake.every((i) => i.speaker !== null && !i.hasLipsync)).toBe(true);
      expect(ids(toMake)).toEqual(expect.arrayContaining([dict.cdn, dict.plainHttp]));
      expect(ids(toMake)).not.toContain(dict.commons);
      expect(ids(toMake)).not.toContain(dict.elsewhere);

      expect((await list({ speaker: 'dragon' })).statusCode).toBe(400);
      expect((await list({ lipsync: 'maybe' })).statusCode).toBe(400);
    });

    it('pages through in headword order, none lost and none twice', async () => {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT a.id FROM dict_audio a JOIN dict_entries e ON e.id = a.entry_id ORDER BY e.headword, a.id`,
      );
      const paged = await all({}, 2);
      expect(ids(paged)).toEqual(rows.map((r) => r.id));
      expect(new Set(ids(paged)).size).toBe(paged.length);
      // the same, filtered
      const filtered = await all({ speaker: 'none' }, 2);
      expect(ids(filtered)).toEqual(ids(await all({ speaker: 'none' }, 200)));

      expect((await list({ limit: '201' })).statusCode).toBe(400);
      expect((await list({ limit: '0' })).statusCode).toBe(400);
      const bad = await list({ cursor: 'not-a-cursor' });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().code).toBe('BAD_CURSOR');
      const forged = Buffer.from(JSON.stringify(['a', 'not-an-id'])).toString('base64url');
      expect((await list({ cursor: forged })).json().code).toBe('BAD_CURSOR');
    });

    it('counts every pronunciation, whatever the filters', async () => {
      const { rows } = await pool.query<{ total: number; no_speaker: number; no_timeline: number }>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE speaker IS NULL)::int AS no_speaker,
                COUNT(*) FILTER (WHERE speaker IS NOT NULL AND lipsync IS NULL)::int AS no_timeline
           FROM dict_audio`,
      );
      const expected = { total: rows[0]!.total, noSpeaker: rows[0]!.no_speaker, speakerNoTimeline: rows[0]!.no_timeline };
      expect(expected.noSpeaker).toBeGreaterThanOrEqual(4);
      expect(expected.speakerNoTimeline).toBeGreaterThanOrEqual(2);
      expect((await list({})).json().counts).toEqual(expected);
      expect((await list({ speaker: 'hamo', q: `sêv${tag}` })).json().counts).toEqual(expected);
    });

    it('is only for those who record', async () => {
      expect((await list({}, learner)).statusCode).toBe(404);
      expect((await list({}, null)).statusCode).toBe(401);
    });
  });
});
