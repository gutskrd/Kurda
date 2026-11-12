/**
 * The Memory Thief and Hear It, Find It against real Postgres and Redis.
 *
 * The Memory Thief: rounds are made of published stories and lesson
 * conversations only (never a draft story), sent without the words that
 * vanish, graded on the server from tiles or typed, nudged by gap, corrected
 * with each word's meaning, and paid by performance once.
 *
 * Hear It, Find It: only people's recordings are played (never a letter's
 * sound read as a word), a round never sends a recording's address or text,
 * its clips are read through the API by handles good for that round only
 * (byte ranges included, refused once the round has expired), a text recorded
 * in two voices is heard in the other voice the next time, and a round is paid
 * by performance, learning only at half right.
 *
 * The media bucket is held in memory (the storage's read is stubbed), so what
 * is under test is what the API reads, refuses and sends.
 */
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import {
  MEMORY_ROUND_PASSAGES,
  SOLO_ROUND_ITEMS,
  alphabetClipText,
  conversationLineKey,
  foldDiacritics,
  foldForDialect,
  gameWords,
  hearItClipPath,
  lessonAudioKey,
  textScript,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { DictionaryRepository } from '../dictionary/repository.js';
import { XpService } from '../xp/service.js';
import { activate } from '../test/activate.js';
import { poolQuiet, queriesDuring } from '../test/query-count.js';
import { bustAvailability } from './availability.js';
import { bustGamePools, itemKey } from './sources.js';
import { learnGameServices } from './routes.js';
import { removeCourses } from '../test/courses.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface MemoryStored {
  key: string;
  text: string;
  hidden: Array<{ term: string; tile: string; meanings: { en?: string } | null }>;
  tiles: string[] | null;
  level: number;
}

interface HearStored {
  key: string;
  stage: string;
  text: string;
  clip: string;
  recording: { source: string; id: string };
  speaker: string | null;
  answer: number | null;
  options: string[] | null;
}

describe.skipIf(!DATABASE_URL || !REDIS_URL)('The Memory Thief and Hear It, Find It (integration)', () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    S3_ENDPOINT: 'http://127.0.0.1:9',
    S3_BUCKET: 'games-test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
    CDN_BASE_URL: 'https://cdn.test',
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  // a word of letters only, unique to this run, so this suite's content is told from any other suite's
  const tag = `qv${s.replace(/[^a-z]/g, '')}`;
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const storyIds: string[] = [];
  const audioKeys: string[] = [];
  const entryIds: string[] = [];
  const alphabetKeys: string[] = [];
  // the bucket: a recording's bytes by its object key
  const objects = new Map<string, Buffer>();
  let learner = '';
  let other = '';
  let otherId = '';
  let listener = '';
  let listenerId = '';
  let net = 0;

  /** A short WAV of its own for each recording, so the bytes say which one was sent. */
  const wav = (seed: number): Buffer => {
    const frames = 400;
    const b = Buffer.alloc(44 + frames * 2);
    b.write('RIFF', 0);
    b.writeUInt32LE(36 + frames * 2, 4);
    b.write('WAVE', 8);
    b.write('fmt ', 12);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(22050, 24);
    b.writeUInt32LE(44100, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36);
    b.writeUInt32LE(frames * 2, 40);
    for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(Math.sin((i * (seed + 1)) / 7) * 2000), 44 + i * 2);
    return b;
  };

  async function register(name: string): Promise<{ token: string; id: string }> {
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
      remoteAddress: `10.96.${(net = (net + 1) % 250)}.${userIds.length + 1}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    return { token: res.json().tokens.accessToken as string, id };
  }

  /** The file any recording not of this suite's is read as. */
  const OTHERS = wav(999);

  const call = (method: 'GET' | 'POST', url: string, token: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method, url, payload: payload as never, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, remoteAddress: '10.96.251.3' });

  const play = (token: string, game: 'memory-thief' | 'hear-it', difficulty = 'beginner', dialect = 'kmr') =>
    call('POST', '/games/solo/sessions', token, { game, dialect, difficulty });
  const answer = (token: string, id: string, index: number, body: unknown, attempt?: number) =>
    call('POST', `/games/solo/sessions/${id}/answers`, token, { index, answer: body, ...(attempt ? { attempt } : {}) });

  async function stored<T>(sessionId: string): Promise<T[]> {
    return (await pool.query<{ items: T[] }>(`SELECT items FROM game_sessions WHERE id = $1`, [sessionId])).rows[0]!.items;
  }

  /** A Memory Thief item's words given back right, from its tiles or typed. */
  const rightGaps = (item: MemoryStored) => ({ gaps: item.hidden.map((h) => h.tile) });
  /** The same with the first two gaps' words swapped: wrong. */
  const swapped = (item: MemoryStored) => {
    const gaps = item.hidden.map((h) => h.tile);
    return { gaps: [gaps[1]!, gaps[0]!, ...gaps.slice(2)] };
  };

  // stand-in Kurmancî for the rounds, never shown to a learner
  const GLOSSARY = [
    { term: 'çiyayê', meanings: { en: 'the mountain' } },
    { term: 'kanî', meanings: { en: 'spring' } },
    { term: 'zozanê', meanings: { en: 'the summer pasture' } },
    { term: 'darê', meanings: { en: 'the tree' } },
    { term: 'zarok', meanings: { en: 'children' } },
  ];
  // every glossary term written in the text exactly as the glossary writes it: only such a word is taken, with its meaning
  const paragraph = (i: number, extra: string) =>
    `Gundê ${tag}${letters(i)} li ber çiyayê bilind e. Li nav gund kanî heye û av sar e. Li ber darê zarok dilîzin û pez li zozanê ye. ${extra}`;

  async function story(level: number, paragraphs: string[], status: 'published' | 'draft'): Promise<void> {
    const body = paragraphs.join('\n\n');
    const res = await pool.query<{ id: string }>(
      `INSERT INTO stories (slug, dialect, level, title, summary, body, word_count, length, glossary, status, source, category, review_status)
       VALUES ($1, 'kurmanci', $2, $3, 'Gund.', $4, $5, 'short', $6, $7, 'admin', 'everyday', CASE WHEN $7 = 'published' THEN 'approved' ELSE 'unreviewed' END)
       RETURNING id`,
      [`mh-${status}-${level}-${s}`, level, `Gund ${level}`, body, body.split(/\s+/).length, JSON.stringify(GLOSSARY), status],
    );
    storyIds.push(res.rows[0]!.id);
  }

  async function record(key: string, text: string, speaker: string | null, seed: number): Promise<void> {
    const media = `lesson-audio/${tag}-${seed}.wav`;
    objects.set(media, wav(seed));
    await pool.query(
      `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms, speaker)
       VALUES ($1, $2, $3, $4, 'audio/wav', 900, $5) ON CONFLICT (key) DO NOTHING`,
      [key, text, media, `https://cdn.test/${media}`, speaker],
    );
    audioKeys.push(key);
  }

  // a conversation of eight lines, each said by the other part, with what it means
  const CONVERSATION = `conv${tag}`.slice(0, 32);
  const LINES = [
    ['Silav, tu diçî bajêr?', 'Hello, are you going to town?'],
    ['Erê, ez diçim bajêr.', 'Yes, I am going to town.'],
    ['Tu çi dikirî li wir?', 'What are you buying there?'],
    ['Ez nan û sêv dikirim.', 'I am buying bread and apples.'],
    ['Pirtûkekê jî bikire.', 'Buy a book too.'],
    ['Baş e, ez ê bikirim.', 'Fine, I will buy one.'],
    ['Kengê tu vedigerî malê?', 'When are you coming back home?'],
    ['Êvarê ez vedigerim malê.', 'I am coming back home in the evening.'],
  ] as const;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // another suite's recording may be in a round too: the bucket holds a file for it, the same for all of them
    app.storage!.read = async (key) => {
      const found = objects.get(key) ?? OTHERS;
      return { body: Readable.from([found.subarray(0, 100), found.subarray(100)]), contentType: 'audio/wav', contentLength: found.length };
    };

    // a published lesson: the conversation, and a few of its words taught as pairs
    const repo = new ContentRepository(pool);
    const course = await repo.createCourse({ slug: `games-mh-${s}`, dialect: 'kurmanji', titleKu: 'K', titleEn: 'Games' });
    courseIds.push(course);
    const unit = await repo.createUnit(course, 1, 'Y', 'Unit');
    const skill = await repo.createSkill(unit, 1, 'S', 'Skill');
    const lesson = await repo.createLesson(skill, 1, 'D', 'Talk');
    await repo.addExercise(lesson, 1, 'conversation', {
      id: CONVERSATION,
      speakers: [{ character: 'hamo' }, { character: 'xezo' }],
      lines: LINES.map(([text, en], i) => ({ speaker: i % 2, text, en })),
      prompt: 'Where is the first speaker going?',
      options: ['To town', 'Home'],
      correctIndex: 0,
    });
    await repo.addExercise(lesson, 2, 'match_pairs', {
      pairs: [
        { left: 'bajêr', right: 'town' },
        { left: 'nan', right: 'bread' },
        { left: 'sêv', right: 'apples' },
        { left: 'malê', right: 'home' },
      ],
    });
    // the sixteen words this suite records, and its lines as translations too: a game plays a recording only of what a published lesson says
    for (let p = 0; p < 2; p++) {
      await repo.addExercise(lesson, 3 + p, 'match_pairs', {
        pairs: Array.from({ length: 8 }, (_, j) => ({ left: `${tag}${letters(p * 8 + j)}`, right: `word ${p * 8 + j}` })),
      });
    }
    for (let i = 0; i < LINES.length; i++) {
      await repo.addExercise(lesson, 5 + i, 'translate', { prompt: `In Kurdish: “${LINES[i]![1]}”`, accepted: [LINES[i]![0]] });
    }
    await repo.publishLesson(lesson);
    // a draft lesson's text, recorded before it was published: never played
    const draft = await repo.createLesson(skill, 2, 'D', 'Draft');
    await repo.addExercise(draft, 1, 'match_pairs', { pairs: [{ left: `${tag}draftword`, right: 'draft' }, { left: `${tag}draftother`, right: 'other' }] });

    // two published stories (beginner and advanced) and a draft no game may read
    await story(1, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => paragraph(i, 'Roj germ e.')), 'published');
    await story(4, [8, 9, 10, 11, 12, 13].map((i) => paragraph(i, 'Ba li ser çiyayê hênik e û ewr hatin.')), 'published');
    await story(1, [paragraph(20, `Ev ${tag}draftonly ye.`)], 'draft');

    // people's recordings: sixteen words, the conversation's lines, and one line in two voices
    for (let i = 0; i < 16; i++) await record(lessonAudioKey(`${tag}${letters(i)}`), `${tag}${letters(i)}`, i % 2 ? 'hamo' : 'xezo', i);
    for (let i = 0; i < LINES.length; i++) await record(lessonAudioKey(LINES[i]![0]), LINES[i]![0], 'hevalo', 100 + i);
    await record(conversationLineKey(CONVERSATION, 1, LINES[1]![0]), LINES[1]![0], 'xezo', 200);
    // a draft lesson's word and a draft story's sentence, both recorded: neither is ever played
    await record(lessonAudioKey(`${tag}draftword`), `${tag}draftword`, 'hamo', 400);
    await record(lessonAudioKey(`Ev ${tag}draftonly ye.`), `Ev ${tag}draftonly ye.`, 'hamo', 401);
    // the dictionary's pronunciations: an entry an admin curated is played, one only imported is not
    const dictionary = new DictionaryRepository(pool);
    for (const [word, curated] of [[`${tag}dictcurated`, true], [`${tag}dictimported`, false]] as const) {
      const entry = await dictionary.createEntry(word);
      entryIds.push(entry);
      await pool.query(`UPDATE dict_entries SET in_games = $2 WHERE id = $1`, [entry, curated]);
      await pool.query(`INSERT INTO dict_audio (entry_id, audio_url) VALUES ($1, $2)`, [entry, `https://cdn.test/dict/${word}.wav`]);
    }
    // and a letter's sound, which is a syllable and no word
    for (const key of ['kmr:sound:x', 'kmr:word:x']) {
      const media = `alphabet-audio/${tag}-${key}.wav`;
      objects.set(media, wav(300));
      const res = await pool.query(
        `INSERT INTO alphabet_audio (key, media_key, url, content_type, duration_ms) VALUES ($1, $2, $3, 'audio/wav', 500) ON CONFLICT (key) DO NOTHING`,
        [key, media, `https://cdn.test/${media}`],
      );
      if (res.rowCount) alphabetKeys.push(key);
    }

    await bustGamePools(app.cache);
    await bustAvailability(app.cache);
    ({ token: learner } = await register('mhLearner'));
    ({ token: other, id: otherId } = await register('mhOther'));
    ({ token: listener, id: listenerId } = await register('mhListener'));
  });

  afterAll(async () => {
    await poolQuiet(pool);
    await removeCourses(pool, courseIds);
    await pool.query(`DELETE FROM stories WHERE id = ANY($1::uuid[])`, [storyIds]);
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [audioKeys]);
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1::uuid[])`, [entryIds]);
    if (alphabetKeys.length) await pool.query(`DELETE FROM alphabet_audio WHERE key = ANY($1)`, [alphabetKeys]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await bustGamePools(app.cache);
    await bustAvailability(app.cache);
    await pool.end();
    await app.close();
  });

  describe('availability', () => {
    it('lists both games in Kurmancî once there is enough approved content', async () => {
      const res = await call('GET', '/games/availability?dialect=kmr', '');
      expect(res.statusCode, res.body).toBe(200);
      const memory = res.json().games.find((g: { id: string }) => g.id === 'memory-thief');
      expect(memory.available).toBe(true);
      expect(memory.difficulties).toContain('beginner');
      expect(memory.levels['1']).toBeGreaterThanOrEqual(8);
      const hear = res.json().games.find((g: { id: string }) => g.id === 'hear-it');
      expect(hear.available).toBe(true);
      expect(hear.levelled).toBe(false);
      expect(hear.difficulties).toContain('beginner');
    });
  });

  describe('a round of The Memory Thief', () => {
    it('is made of published passages only: the passage to study, then its gaps, never both', async () => {
      const res = await play(learner, 'memory-thief');
      expect(res.statusCode, res.body).toBe(201);
      const view = res.json();
      expect(view.items).toHaveLength(MEMORY_ROUND_PASSAGES);
      const items = await stored<MemoryStored>(view.id);
      for (const [i, v] of (view.items as Array<Record<string, unknown>>).entries()) {
        // while it is studied: the passage whole, nothing of its gaps, and no key worked out from it
        expect(Object.keys(v).sort()).toEqual(['gaps', 'index', 'kind', 'level', 'parts', 'phase', 'speakers', 'studySeconds', 'text', 'tiles', 'title']);
        expect(v).toMatchObject({ phase: 'study', parts: null, tiles: null });
        expect(String(v.text)).not.toContain('draftonly');
        expect(textScript(String(v.text))).toBe('latin');
        // once begun: the gaps and the tiles, and the passage never again
        const begun = await call('POST', `/games/solo/sessions/${view.id}/begin`, learner, { index: i });
        expect(begun.statusCode, begun.body).toBe(200);
        const r = begun.json().item;
        expect(r).toMatchObject({ phase: 'restore', text: null });
        // the passage with its gaps never has a vanished word left in its text
        const hidden = new Set(items[i]!.hidden.map((h) => foldForDialect(h.term, 'kmr')));
        const left = (r.parts as Array<{ text?: string }>).flatMap((p) => (p.text ? gameWords(p.text) : [])).map((w) => foldForDialect(w, 'kmr'));
        expect(left.filter((w) => hidden.has(w))).toEqual([]);
        expect(r.tiles).toEqual(items[i]!.tiles);
      }
      // a round come back to is not shown the passages again
      const again = (await call('GET', `/games/solo/sessions/${view.id}`, learner)).json();
      expect(again.items.every((v: { phase: string; text: unknown }) => v.phase === 'restore' && v.text === null)).toBe(true);
      expect((await call('POST', `/games/solo/sessions/${view.id}/begin`, learner, { index: 20 })).statusCode).toBe(404);
      // a lesson's conversation is a passage too
      const services = learnGameServices(app, { xp: new XpService(app.db) });
      const passages = await services.memory.pool('kmr');
      expect(passages.some((p) => p.kind === 'conversation' && p.lines.some((l) => l.text === LINES[0]![0]))).toBe(true);
      expect(passages.some((p) => p.lines.some((l) => l.text.includes('draftonly')))).toBe(false);
    });

    it('nudges a wrong first try by gap, then corrects with every word’s meaning', async () => {
      const { id } = (await play(learner, 'memory-thief')).json();
      const items = await stored<MemoryStored>(id);
      // an answer begins its passage too: from then on it is sent with its gaps
      const first = await answer(learner, id, 0, swapped(items[0]!), 1);
      expect((await call('GET', `/games/solo/sessions/${id}`, learner)).json().items[0]).toMatchObject({ phase: 'restore', text: null });
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json()).toMatchObject({ correct: false, done: false, correction: null });
      expect(first.json().hint.wrong).toEqual(expect.arrayContaining([0, 1]));
      const second = await answer(learner, id, 0, rightGaps(items[0]!), 2);
      expect(second.json()).toMatchObject({ correct: true, firstTry: false, done: true, hint: null });
      const words = second.json().correction.words;
      expect(words.map((w: { term: string }) => w.term)).toEqual(items[0]!.hidden.map((h) => h.term));
      for (const w of words) expect(w.meanings.en).toBeTruthy();
      expect(['glossary', 'vocabulary']).toContain(second.json().why);
    });

    it('counts as a day learned and pays no XP: it is a game played alone', async () => {
      const { id } = (await play(other, 'memory-thief')).json();
      const items = await stored<MemoryStored>(id);
      for (let i = 0; i < items.length; i++) expect((await answer(other, id, i, rightGaps(items[i]!))).json().correct).toBe(true);
      const results = (await call('POST', `/games/solo/sessions/${id}/finish`, other)).json();
      expect(results).toMatchObject({ correct: MEMORY_ROUND_PASSAGES, total: MEMORY_ROUND_PASSAGES, learningCounted: true, xp: 0 });
      expect(results.items.every((i: { xp: number }) => i.xp === 0)).toBe(true);
      expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE ref_id LIKE $1`, [`${id}:%`])).rowCount).toBe(0);
      expect((await call('POST', `/games/solo/sessions/${id}/finish`, other)).json()).toEqual(results);
    });

    it('is typed at the advanced difficulty, a lost mark taken as a typo', async () => {
      const res = await play(learner, 'memory-thief', 'advanced');
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json().items.every((i: { tiles: unknown }) => i.tiles === null)).toBe(true);
      const items = await stored<MemoryStored>(res.json().id);
      expect(items[0]!.hidden.length).toBeGreaterThanOrEqual(4);
      const typed = { gaps: items[0]!.hidden.map((h) => foldDiacritics(h.term)) };
      const done = await answer(learner, res.json().id, 0, typed);
      expect(done.json().correct, done.body).toBe(true);
      const marked = items[0]!.hidden.filter((h) => foldDiacritics(h.term) !== h.term).length;
      expect(done.json().correction.words.filter((w: { verdict: string }) => w.verdict === 'typo')).toHaveLength(marked);
    });
  });

  describe('a round of Hear It, Find It', () => {
    it('plays people’s recordings only, and sends neither their addresses nor their texts', async () => {
      const res = await play(learner, 'hear-it');
      expect(res.statusCode, res.body).toBe(201);
      const view = res.json();
      expect(view.items).toHaveLength(SOLO_ROUND_ITEMS);
      const items = await stored<HearStored>(view.id);
      const sent = res.body;
      expect(sent).not.toContain('cdn.test');
      expect(sent).not.toContain('lesson-audio');
      view.items.forEach((v: Record<string, unknown>, i: number) => {
        expect(Object.keys(v).sort()).toEqual(['clip', 'index', 'level', 'meanings', 'newVoice', 'options', 'replays', 'speaker', 'stage']);
        expect(v.clip).toBe(items[i]!.clip);
        // the handle is no key of the recording's, and an item that asks for a meaning never carries the Kurdish it asks about
        expect(String(v.clip)).not.toContain(items[i]!.recording.id);
        if (items[i]!.stage === 'phrase') expect(JSON.stringify(v)).not.toContain(items[i]!.text);
      });
      // a letter's sound is never a word to find
      const services = learnGameServices(app, { xp: new XpService(app.db) });
      const { texts } = await services.hearing.pool('kmr');
      expect(texts.some((t) => t.variants.some((v) => v.ref.id === 'kmr:sound:x'))).toBe(false);
      // nor is a recording of a draft's text, nor the pronunciation of an entry nobody curated
      expect(texts.some((t) => t.text.includes('draftword') || t.text.includes('draftonly'))).toBe(false);
      expect(texts.some((t) => t.text === `${tag}dictimported`)).toBe(false);
      expect(texts.some((t) => t.text === `${tag}dictcurated`)).toBe(true);
      // and what is counted for the game's availability is what can be played
      const recordings = await services.sources.recordings('kmr');
      expect(recordings.some((r) => r.text.includes('draftword') || r.text.includes('draftonly') || r.text === `${tag}dictimported`)).toBe(false);
      // the pronunciations live elsewhere: out of the pools again before a round's clips are read
      await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1::uuid[])`, [entryIds.splice(0)]);
      await bustGamePools(app.cache);
      const said = alphabetClipText('kmr:word:x');
      if (said && alphabetKeys.includes('kmr:word:x')) expect(texts.some((t) => t.variants.some((v) => v.ref.id === 'kmr:word:x'))).toBe(true);
    });

    it('reads a clip through the API by its handle, without a token, byte ranges and all', async () => {
      const { id } = (await play(learner, 'hear-it')).json();
      const items = await stored<HearStored>(id);
      // which recording a round opens with is drawn afresh each time, and it may be a lesson's, one of the
      // alphabet's example words, or another suite's. The clip read here is the first whose file is kept in
      // storage (a dictionary's pronunciation is fetched from its own host, which this suite does not stand in for)
      const item = items.find((i) => i.recording.source !== 'dictionary') ?? items[0]!;
      const path = hearItClipPath(id, item.clip);
      const whole = await call('GET', path, '');
      expect(whole.statusCode, whole.body).toBe(200);
      expect(whole.headers['content-type']).toBe('audio/wav');
      expect(whole.headers['accept-ranges']).toBe('bytes');
      expect(String(whole.headers['cache-control'])).toMatch(/^private/);
      // its file is found the way the route finds it: in the table of the recording's own source
      const table = item.recording.source === 'lesson' ? 'lesson_audio' : 'alphabet_audio';
      const kept = await pool.query<{ media_key: string }>(`SELECT media_key FROM ${table} WHERE key = $1`, [item.recording.id]);
      expect(kept.rows, `${item.recording.source} recording ${item.recording.id}`).toHaveLength(1);
      const file = objects.get(kept.rows[0]!.media_key) ?? OTHERS;
      expect(whole.rawPayload.equals(file)).toBe(true);

      const start = await call('GET', path, '', undefined, { range: 'bytes=0-1' });
      expect(start.statusCode).toBe(206);
      expect(start.headers['content-range']).toBe(`bytes 0-1/${file.length}`);
      expect(start.rawPayload.toString('latin1')).toBe('RI');
      expect((await call('GET', path, '', undefined, { range: 'bytes=999999-' })).statusCode).toBe(416);

      // a handle is this round's only, and nothing at all once the round has expired
      const { id: another } = (await play(learner, 'hear-it')).json();
      expect((await call('GET', hearItClipPath(another, item.clip), '')).statusCode).toBe(404);
      expect((await call('GET', hearItClipPath(id, 'A'.repeat(22)), '')).statusCode).toBe(404);
      await pool.query(`UPDATE game_sessions SET expires_at = now() - interval '1 second' WHERE id = $1`, [id]);
      expect((await call('GET', path, '')).statusCode).toBe(410);
    });

    it('checks a pick and strikes a wrong one out, then says what was said and what it means', async () => {
      const { id } = (await play(learner, 'hear-it')).json();
      const items = await stored<HearStored>(id);
      const at = items.findIndex((i) => i.answer !== null);
      const wrong = (items[at]!.answer! + 1) % items[at]!.options!.length;
      const first = await answer(learner, id, at, { choice: wrong }, 1);
      expect(first.json()).toMatchObject({ correct: false, done: false, hint: { struck: wrong, right: null } });
      const second = await answer(learner, id, at, { choice: items[at]!.answer! }, 2);
      expect(second.json()).toMatchObject({ correct: true, done: true });
      expect(second.json().correction).toMatchObject({ text: items[at]!.text, choice: items[at]!.answer, verdict: 'right' });
      expect(second.json().why).toBe(items[at]!.stage);
    });

    it('takes what is typed at the advanced difficulty as a lesson does', async () => {
      const res = await play(learner, 'hear-it', 'advanced');
      expect(res.statusCode, res.body).toBe(201);
      const items = await stored<HearStored>(res.json().id);
      const at = items.findIndex((i) => i.stage === 'type');
      expect(at).toBeGreaterThanOrEqual(0);
      const done = await answer(learner, res.json().id, at, { text: foldDiacritics(items[at]!.text.toLowerCase()) });
      expect(done.json().correct, done.body).toBe(true);
      expect(['right', 'typo']).toContain(done.json().correction.verdict);
    });

    it('plays a text recorded in two voices in the other voice the next time', async () => {
      const services = learnGameServices(app, { xp: new XpService(app.db) });
      const { texts } = await services.hearing.pool('kmr');
      const twice = itemKey('h', 'kmr', foldForDialect(LINES[1]![0], 'kmr'));
      expect(texts.find((t) => t.key === twice)?.variants).toHaveLength(2);
      // everything else heard just now, so the round reaches for this line first
      await pool.query(
        `INSERT INTO game_seen (user_id, game, item_key, attempts, correct, last_seen_at, last_correct_at)
         SELECT $1::uuid, 'hear-it', k, 1, 1, now(), now() FROM unnest($2::text[]) AS k ON CONFLICT DO NOTHING`,
        [listenerId, texts.filter((t) => t.key !== twice).map((t) => t.key)],
      );
      const voiceOf = async () => {
        const { id } = (await play(listener, 'hear-it')).json();
        const item = (await stored<HearStored>(id)).find((i) => i.key === twice);
        return item ? { speaker: item.speaker, view: (await call('GET', `/games/solo/sessions/${id}`, listener)).json().items.find((v: { clip: string }) => v.clip === item.clip) } : null;
      };
      const first = await voiceOf();
      expect(first).not.toBeNull();
      expect(first!.view.newVoice).toBe(false);
      await pool.query(
        `INSERT INTO game_seen (user_id, game, item_key, attempts, correct, last_seen_at) VALUES ($1, 'hear-it', $2, 1, 0, now() - interval '1 day')
         ON CONFLICT (user_id, game, item_key) DO UPDATE SET attempts = 1, last_correct_at = NULL`,
        [listenerId, twice],
      );
      const next = await voiceOf();
      expect(next).not.toBeNull();
      expect(next!.speaker).not.toBe(first!.speaker);
      expect(next!.view.newVoice).toBe(true);
    });

    it('pays by performance once, and nothing when less than half was right', async () => {
      const { id } = (await play(other, 'hear-it')).json();
      const items = await stored<HearStored>(id);
      const right = (i: HearStored) => (i.stage === 'type' ? { text: i.text } : { choice: i.answer! });
      for (let i = 0; i < items.length; i++) expect((await answer(other, id, i, right(items[i]!))).json().correct).toBe(true);
      const results = (await call('POST', `/games/solo/sessions/${id}/finish`, other)).json();
      expect(results).toMatchObject({ correct: SOLO_ROUND_ITEMS, learningCounted: true });
      const ledger = await pool.query(`SELECT source, amount FROM xp_ledger WHERE ref_id = $1`, [`${id}:${otherId}`]);
      expect(results.xp).toBeGreaterThan(0);
      expect(ledger.rows).toEqual([{ source: 'game_hear_it', amount: results.xp }]);

      const { id: poor } = (await play(learner, 'hear-it')).json();
      const few = await stored<HearStored>(poor);
      for (let i = 0; i < 3; i++) await answer(learner, poor, i, right(few[i]!));
      const nothing = (await call('POST', `/games/solo/sessions/${poor}/finish`, learner)).json();
      expect(nothing).toMatchObject({ correct: 3, total: SOLO_ROUND_ITEMS, xp: 0, learningCounted: false, streak: null });
      expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE ref_id LIKE $1`, [`${poor}:%`])).rowCount).toBe(0);
    });

    it('makes a round and answers a try within a small statement budget', async () => {
      const own = (statements: readonly string[]) => statements.filter((sql) => !/\bFROM maintenance\b/.test(sql));
      await play(learner, 'hear-it');
      await poolQuiet(app.db);
      const made = await queriesDuring(app.db, () => play(learner, 'hear-it'));
      expect(own(made.statements).length, made.statements.join('\n')).toBeLessThanOrEqual(12);
      const { id } = (await play(learner, 'memory-thief')).json();
      const items = await stored<MemoryStored>(id);
      await poolQuiet(app.db);
      const answered = await queriesDuring(app.db, () => answer(learner, id, 0, rightGaps(items[0]!)));
      expect(own(answered.statements).length, answered.statements.join('\n')).toBeLessThanOrEqual(12);
      await poolQuiet(app.db);
      const memory = await queriesDuring(app.db, () => play(learner, 'memory-thief'));
      expect(own(memory.statements).length, memory.statements.join('\n')).toBeLessThanOrEqual(12);
    });
  });
});

/** A short letters-only suffix for the i-th text: a, b, … z, ba, bb, … */
function letters(i: number): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz';
  return i < 26 ? abc[i]! : abc[Math.floor(i / 26)]! + abc[i % 26]!;
}
