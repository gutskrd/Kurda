/**
 * The Stories' riddles and proverbs against real Postgres and Redis: riddles go through the game content workflow;
 * learner routes never carry an untaken hint, answer, accepted form or explanation; a signed-in learner's hints,
 * guesses and reveals are kept and a solve pays once, before any reveal; visitors play with nothing kept; one
 * language is corrected on a published row without unpublishing it; proverb rounds pay no XP; erasure takes an
 * account's riddles; and starters are seeded once with translations unreviewed.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { PROVERB_ROUND_ITEMS, PROVERB_ROUND_OPTIONS, RIDDLE_XP } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { poolQuiet } from '../test/query-count.js';
import { DELETION_GRACE_DAYS, GdprService } from '../gdpr/service.js';
import { exportProgress } from '../gdpr/progress-export.js';
import { seedStarterLore } from './starters.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('riddles and proverbs (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  // Letters only and unique to this run, so every marker below is a Kurmancî-looking word nobody else writes.
  const tag = `zq${s.replace(/[^a-z]/g, '')}`;
  const userIds: string[] = [];
  let net = 0;
  let editor = '';

  async function register(name: string, roles = '{}'): Promise<{ token: string; id: string }> {
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
      // A fresh address each time, so per-address sign-up caps never meet another run of this suite the same day.
      remoteAddress: `10.97.${(net = (net + 1) % 250)}.${1 + Math.floor(Math.random() * 250)}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    if (roles !== '{}') {
      await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
      await pass2fa(app, res.json().tokens.accessToken, '10.97.250.2');
    }
    return { token: res.json().tokens.accessToken as string, id };
  }

  let address = 0;
  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      // A fresh address for each visitor call, so the per-address tries cap never trips.
      remoteAddress: token ? '10.97.251.3' : `10.97.252.${(address = (address % 250) + 1)}`,
    });

  // stand-in Kurdish, with this run's markers in every field a learner must not see before asking
  const riddle = (slug: string, over: Record<string, unknown> = {}) => ({
    slug,
    difficulty: 'hard',
    category: 'wordplay',
    tradition: 'traditional',
    region: 'Botan',
    question: `Ew çi ye ku ${tag}pirs dibêje lê dev tune?`,
    hints: [`Alîkarî ${tag}yek`, `Alîkarî ${tag}du`],
    answer: `${tag}bersiv`,
    accepted: [`${tag}bersiv`, `${tag}cewab`],
    explanation: `Ji ber ku ${tag}ravekirin.`,
    sources: [{ title: 'A folklore collection', url: 'https://example.org/riddles' }],
    notes: `Nîşe ${tag}nirxandin`,
    ...over,
  });
  const riddleEn = {
    question: `What speaks ${tag}ask without a mouth?`,
    hints: [`enhint${tag}one`, `enhint${tag}two`],
    answer: `enanswer${tag}`,
    explanation: `enexplain${tag}`,
  };

  /** A row written, approved and published by the editor, the way the panel does it. */
  async function publish(kind: 'riddle' | 'proverb', payload: unknown, translations: Record<string, unknown> = {}, level = 2): Promise<string> {
    const created = await call('POST', '/admin/game-content', editor, { kind, dialect: 'kmr', level, payload });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id as string;
    for (const [locale, t] of Object.entries(translations)) {
      const put = await call('PUT', `/admin/game-content/${id}/translations/${locale}`, editor, { payload: t });
      expect(put.statusCode, put.body).toBe(200);
    }
    let row = (await call('GET', `/admin/game-content/${id}`, editor)).json();
    row = (await call('POST', `/admin/game-content/${id}/review`, editor, { approved: true, lockVersion: row.lockVersion })).json();
    const live = await call('POST', `/admin/game-content/${id}/publish`, editor, { lockVersion: row.lockVersion });
    expect(live.statusCode, live.body).toBe(200);
    return id;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    ({ token: editor } = await register('loEditor', '{content_editor}'));
  });

  afterAll(async () => {
    await poolQuiet(pool);
    await pool.query(`DELETE FROM game_content WHERE kind IN ('riddle', 'proverb') AND payload->>'slug' LIKE $1`, [`kmr-${tag}%`]);
    await pool.query(`DELETE FROM content_seeds WHERE name LIKE $1`, [`game_content:starter:%:kmr-${tag}%`]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  describe('a riddle', () => {
    const slug = `kmr-${tag}-pirs`;
    let id = '';

    it('is written as game content, at its difficulty’s level, and no other live riddle may take its slug', async () => {
      id = await publish('riddle', riddle(slug), { en: riddleEn });
      const row = (await call('GET', `/admin/game-content/${id}`, editor)).json();
      expect(row).toMatchObject({ kind: 'riddle', game: null, level: 5, status: 'published', reviewStatus: 'approved' });
      expect(row.translations.en).toMatchObject({ reviewStatus: 'unreviewed', payload: riddleEn, issues: [] });
      const again = await call('POST', '/admin/game-content', editor, { kind: 'riddle', dialect: 'kmr', level: 1, payload: riddle(slug) });
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('SLUG_TAKEN');
    });

    it('is listed and opened with nothing that answers it, for a visitor and a learner alike', async () => {
      const { token } = await register('loReader');
      const secrets = [`${tag}yek`, `${tag}du`, `${tag}bersiv`, `${tag}cewab`, `${tag}ravekirin`, `${tag}nirxandin`, `enhint${tag}`, `enanswer${tag}`, `enexplain${tag}`];
      for (const who of ['', token]) {
        const list = await call('GET', '/riddles?dialect=kmr', who);
        expect(list.statusCode, list.body).toBe(200);
        const detail = await call('GET', `/riddles/${slug}`, who);
        expect(detail.statusCode, detail.body).toBe(200);
        for (const body of [list.body, detail.body]) {
          for (const secret of secrets) expect(body, secret).not.toContain(secret);
          expect(body).toContain(`${tag}pirs`);
          expect(body).toContain(`${tag}ask`);
        }
        const card = (list.json().riddles as Array<{ slug: string }>).find((r) => r.slug === slug);
        expect(card).toEqual({
          slug,
          dialect: 'kmr',
          difficulty: 'hard',
          category: 'wordplay',
          tradition: 'traditional',
          region: 'Botan',
          question: riddle(slug).question,
          translations: { en: { question: riddleEn.question } },
          hintCount: 2,
          state: 'new',
        });
        expect(detail.json().riddle.hintsUsed).toEqual([]);
      }
    });

    it('is played by a visitor, who is answered and remembered nowhere', async () => {
      const hint = await call('POST', `/riddles/${slug}/hint`, '', { index: 1 });
      expect(hint.statusCode, hint.body).toBe(200);
      expect(hint.json().hint).toEqual({ index: 1, text: `Alîkarî ${tag}du`, translations: { en: `enhint${tag}two` } });
      expect((await call('POST', `/riddles/${slug}/guess`, '', { guess: 'na' })).json()).toEqual({ correct: false });
      // one letter off the answer is near, and says so without giving anything away
      expect((await call('POST', `/riddles/${slug}/guess`, '', { guess: `${tag}bersivv` })).json()).toEqual({ correct: false, near: 'spelling' });
      const right = await call('POST', `/riddles/${slug}/guess`, '', { guess: `Ew ${tag.toUpperCase()}CEWABA` });
      expect(right.json()).toMatchObject({ correct: true, xp: 0, answer: { answer: `${tag}bersiv`, region: 'Botan', translations: { en: { answer: `enanswer${tag}` } } } });
      expect((await call('POST', `/riddles/${slug}/reveal`, '')).json().answer.explanation).toBe(`Ji ber ku ${tag}ravekirin.`);
      expect((await pool.query(`SELECT 1 FROM riddle_progress WHERE content_id = $1`, [id])).rowCount).toBe(0);
    });

    it('pays a learner who solves it by a guess, once', async () => {
      const learner = await register('loSolver');
      const wrong = await call('POST', `/riddles/${slug}/guess`, learner.token, { guess: 'pirtûk' });
      expect(wrong.json()).toEqual({ correct: false });
      expect((await call('GET', `/riddles/${slug}`, learner.token)).json().riddle.state).toBe('trying');
      const right = await call('POST', `/riddles/${slug}/guess`, learner.token, { guess: `${tag}bersiva` });
      expect(right.json()).toMatchObject({ correct: true, xp: RIDDLE_XP.hard });
      const again = await call('POST', `/riddles/${slug}/guess`, learner.token, { guess: `${tag}bersiv` });
      expect(again.json()).toMatchObject({ correct: true, xp: 0 });
      const ledger = await pool.query(`SELECT amount, ref_id FROM xp_ledger WHERE user_id = $1 AND source = 'riddle'`, [learner.id]);
      expect(ledger.rows).toEqual([{ amount: RIDDLE_XP.hard, ref_id: `riddle:${id}:${learner.id}` }]);
      const list = (await call('GET', '/riddles?dialect=kmr', learner.token)).json();
      expect(list.riddles.find((r: { slug: string }) => r.slug === slug).state).toBe('solved');
      expect(list.solved).toBeGreaterThanOrEqual(1);
      expect(list.total).toBe(list.riddles.length);
      const progress = await pool.query(`SELECT guesses, hints_used, xp_awarded, solved_at IS NOT NULL AS solved FROM riddle_progress WHERE user_id = $1`, [learner.id]);
      expect(progress.rows).toEqual([{ guesses: 2, hints_used: 0, xp_awarded: RIDDLE_XP.hard, solved: true }]);
    });

    it('pays half after a hint, takes hints in order, and keeps the ones taken', async () => {
      const learner = await register('loHinted');
      const early = await call('POST', `/riddles/${slug}/hint`, learner.token, { index: 1 });
      expect(early.statusCode).toBe(409);
      expect(early.json().code).toBe('HINT_ORDER');
      expect((await call('POST', `/riddles/${slug}/hint`, learner.token, { index: 0 })).statusCode).toBe(200);
      expect((await call('POST', `/riddles/${slug}/hint`, learner.token, { index: 2 })).statusCode).toBe(400);
      const detail = (await call('GET', `/riddles/${slug}`, learner.token)).json().riddle;
      expect(detail.state).toBe('trying');
      expect(detail.hintsUsed).toEqual([{ index: 0, text: `Alîkarî ${tag}yek`, translations: { en: `enhint${tag}one` } }]);
      const right = await call('POST', `/riddles/${slug}/guess`, learner.token, { guess: `${tag}cewab` });
      expect(right.json()).toMatchObject({ correct: true, xp: Math.ceil(RIDDLE_XP.hard / 2) });
    });

    it('pays nothing once its answer was shown, and stays revealed', async () => {
      const learner = await register('loPeeker');
      const shown = await call('POST', `/riddles/${slug}/reveal`, learner.token);
      expect(shown.statusCode, shown.body).toBe(200);
      expect(shown.json().answer).toMatchObject({ answer: `${tag}bersiv`, sources: [{ title: 'A folklore collection', url: 'https://example.org/riddles' }] });
      const right = await call('POST', `/riddles/${slug}/guess`, learner.token, { guess: `${tag}bersiv` });
      expect(right.json()).toMatchObject({ correct: true, xp: 0 });
      expect((await call('GET', `/riddles/${slug}`, learner.token)).json().riddle.state).toBe('revealed');
      expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE user_id = $1 AND source = 'riddle'`, [learner.id])).rowCount).toBe(0);
    });

    it('has one language corrected and reviewed while it stays published and approved', async () => {
      const before = (await call('GET', `/admin/game-content/${id}`, editor)).json();
      const de = { question: `Was spricht ${tag} ohne Mund?`, hints: ['Erster Hinweis.', 'Zweiter Hinweis.'], answer: 'Die Antwort', explanation: 'Weil es so ist.' };
      const put = await call('PUT', `/admin/game-content/${id}/translations/de`, editor, { payload: de });
      expect(put.statusCode, put.body).toBe(200);
      expect(put.json()).toMatchObject({ status: 'published', reviewStatus: 'approved', lockVersion: before.lockVersion });
      expect(put.json().translations.de).toMatchObject({ payload: de, reviewStatus: 'unreviewed' });

      const reviewed = await call('POST', `/admin/game-content/${id}/translations/de/review`, editor, { status: 'reviewed', note: 'read by a speaker' });
      expect(reviewed.statusCode, reviewed.body).toBe(200);
      expect(reviewed.json().translations.de).toMatchObject({ reviewStatus: 'reviewed', reviewNote: 'read by a speaker' });
      expect(reviewed.json().translations.de.reviewedBy).not.toBeNull();
      expect(reviewed.json().translations.en.reviewStatus).toBe('unreviewed');
      // Saved unchanged it keeps its review; changed, it is re-reviewed in that language alone.
      const same = await call('PUT', `/admin/game-content/${id}/translations/de`, editor, { payload: de });
      expect(same.json().translations.de.reviewStatus).toBe('reviewed');
      const changed = await call('PUT', `/admin/game-content/${id}/translations/de`, editor, { payload: { ...de, answer: 'Eine Antwort' } });
      expect(changed.json().translations.de).toMatchObject({ reviewStatus: 'unreviewed', reviewedBy: null, reviewNote: null });
      expect(changed.json()).toMatchObject({ status: 'published', reviewStatus: 'approved' });
      expect((await call('GET', `/riddles/${slug}`, '')).json().riddle.translations.de).toEqual({ question: de.question });

      const own = await call('PUT', `/admin/game-content/${id}/translations/ku`, editor, { payload: de });
      expect(own.statusCode).toBe(422);
      const short = await call('PUT', `/admin/game-content/${id}/translations/fr`, editor, { payload: { ...de, hints: ['Un seul.'] } });
      expect(short.statusCode).toBe(422);
      expect(short.json().details.errors[0].path).toBe('hints');

      const audit = await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1 AND action LIKE 'game_content.translation%' ORDER BY created_at`, [id]);
      expect(audit.rows.map((r) => r.action)).toEqual(['game_content.translation', 'game_content.translation', 'game_content.translation_review', 'game_content.translation']);
    });

    it('is the day’s riddle by the same pick in the list and on its own', async () => {
      const list = (await call('GET', '/riddles?dialect=kmr', '')).json();
      const daily = await call('GET', '/riddles/daily?dialect=kmr', '');
      expect(daily.json()).toEqual({ slug: list.daily });
      expect(list.riddles.map((r: { slug: string }) => r.slug)).toContain(list.daily);
    });

    it('is not there for learners while it is a draft', async () => {
      const draft = await call('POST', '/admin/game-content', editor, { kind: 'riddle', dialect: 'kmr', level: 1, payload: riddle(`kmr-${tag}-draft`) });
      expect(draft.statusCode, draft.body).toBe(201);
      expect((await call('GET', `/riddles/kmr-${tag}-draft`, '')).statusCode).toBe(404);
      expect((await call('POST', `/riddles/kmr-${tag}-draft/reveal`, '')).statusCode).toBe(404);
      expect((await call('GET', '/riddles?dialect=kmr', '')).body).not.toContain(`kmr-${tag}-draft`);
    });

    it('is not translated by a learner', async () => {
      const { token } = await register('loIntruder');
      expect((await call('PUT', `/admin/game-content/${id}/translations/nl`, token, { payload: riddleEn })).statusCode).toBeGreaterThanOrEqual(403);
    });

    it('goes with an erased account, and is in its export until then', async () => {
      const learner = await register('loErased');
      await call('POST', `/riddles/${slug}/hint`, learner.token, { index: 0 });
      const exported = await exportProgress(pool, learner.id);
      expect(exported.riddles).toEqual([expect.objectContaining({ slug, dialect: 'kmr', hints_used: 1, guesses: 0, solved_at: null })]);
      await pool.query(`UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`, [learner.id]);
      await new GdprService(pool).anonymizeExpired();
      expect((await pool.query(`SELECT 1 FROM riddle_progress WHERE user_id = $1`, [learner.id])).rowCount).toBe(0);
    });
  });

  describe('the proverbs', () => {
    const themes = [['patience'], ['friendship'], ['family'], ['courage'], ['trust'], ['hard-work']] as const;
    const slugs = themes.map((_, i) => `kmr-${tag}-gotin-${i}`);

    it('are read with their translations, filtered by theme, and one is the day’s', async () => {
      for (const [i, theme] of themes.entries()) {
        await publish(
          'proverb',
          {
            slug: slugs[i],
            text: `Gotina ${tag} hejmar ${'abcdef'[i]}.`,
            themes: theme,
            tradition: 'new',
            variants: [{ text: `Gotineke din ${'abcdef'[i]}`, dialect: 'kmr', region: 'Behdînan' }],
            exampleKu: `Dapîr got: gotina ${tag} hejmar ${'abcdef'[i]}.`,
            notes: `Nîşe ${tag}nehêle`,
          },
          {
            en: {
              translation: `Saying ${i} of ${tag}`,
              meaning: `Meaning number ${i}`,
              explanation: 'Why people say it.',
              example: `Grandma said: “Saying ${i} of ${tag}.” and smiled.`,
            },
          },
          3,
        );
      }
      const list = await call('GET', '/proverbs?dialect=kmr', '');
      expect(list.statusCode, list.body).toBe(200);
      expect(list.body).not.toContain(`${tag}nehêle`);
      const mine = (list.json().proverbs as Array<{ slug: string }>).filter((p) => p.slug.startsWith(`kmr-${tag}`));
      expect(mine).toHaveLength(themes.length);
      expect(mine[0]).toMatchObject({ dialect: 'kmr', tradition: 'new', region: null, variants: [{ dialect: 'kmr', region: 'Behdînan' }], translations: { en: { meaning: 'Meaning number 0' } } });
      expect(list.json().themes).toEqual(expect.arrayContaining(['patience', 'hard-work']));
      expect(list.json().proverbs.map((p: { slug: string }) => p.slug)).toContain(list.json().today);
      const trust = (await call('GET', '/proverbs?dialect=kmr&theme=trust', '')).json().proverbs as Array<{ slug: string; themes: string[] }>;
      expect(trust.every((p) => p.themes.includes('trust'))).toBe(true);
      expect(trust.map((p) => p.slug)).toContain(slugs[4]);
      const one = await call('GET', `/proverbs/${slugs[0]}`, '');
      expect(one.json().proverb.slug).toBe(slugs[0]);
      expect((await call('GET', `/proverbs/kmr-${tag}-none`, '')).statusCode).toBe(404);
    });

    it('are played in a round of five with three options each, which counts but pays no XP', async () => {
      expect((await call('POST', '/proverbs/rounds', '', { dialect: 'kmr', mode: 'meaning' })).statusCode).toBe(401);
      const learner = await register('loRound');
      for (const mode of ['meaning', 'situation'] as const) {
        const made = await call('POST', '/proverbs/rounds', learner.token, { dialect: 'kmr', mode });
        expect(made.statusCode, made.body).toBe(201);
        const round = made.json();
        expect(round.game).toBe(`proverb-${mode}`);
        expect((await call('GET', `/proverbs/rounds/open?dialect=kmr&mode=${mode}`, learner.token)).json()).toEqual({ id: round.id });
        expect((await call('GET', `/proverbs/rounds/${round.id}`, learner.token)).json().items).toEqual(round.items);
        expect(round.items).toHaveLength(PROVERB_ROUND_ITEMS);
        for (const item of round.items) {
          expect(item.mode).toBe(mode);
          expect(item.options).toHaveLength(PROVERB_ROUND_OPTIONS);
          expect(item.locale).toBe('en');
          // a scene never quotes the proverb it asks about
          if (mode === 'situation') expect(item.scene).not.toMatch(new RegExp(`Saying \\d of ${tag}`));
        }
        const stored = await pool.query<{ items: Array<{ answer: number }> }>(`SELECT items FROM game_sessions WHERE id = $1`, [round.id]);
        for (const [index, item] of stored.rows[0]!.items.entries()) {
          const res = await call('POST', `/proverbs/rounds/${round.id}/answers`, learner.token, { index, answer: { choice: item.answer } });
          expect(res.statusCode, res.body).toBe(200);
          expect(res.json()).toMatchObject({ correct: true, xp: 0, correction: { choice: item.answer, locale: 'en' } });
        }
        const done = await call('POST', `/proverbs/rounds/${round.id}/finish`, learner.token);
        expect(done.json()).toMatchObject({ correct: PROVERB_ROUND_ITEMS, xp: 0, learningCounted: true });
        expect((await call('GET', `/proverbs/rounds/open?dialect=kmr&mode=${mode}`, learner.token)).json()).toEqual({ id: null });
      }
      expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE user_id = $1`, [learner.id])).rowCount).toBe(0);
    });
  });

  describe('the starters', () => {
    it('are seeded once each, published with every translation unreviewed, kept as their files say until someone changes them, and one deleted stays gone', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'lore-starters-'));
      try {
        const riddles = path.join(dir, 'riddles.json');
        const proverbs = path.join(dir, 'proverbs.json');
        const { notes, ...kurdish } = riddle(`kmr-${tag}-starter`, { tradition: 'new', region: null, sources: [] });
        const write = (en: typeof riddleEn) =>
          writeFile(riddles, JSON.stringify({ riddles: [{ ...kurdish, dialect: 'kmr', notes, translations: { en, de: { ...riddleEn, answer: 'Antwort' } } }] }));
        await write(riddleEn);
        await writeFile(proverbs, JSON.stringify({ proverbs: [{ slug: `kmr-${tag}-broken`, dialect: 'kmr', text: 'Gotin.', themes: ['wisdom'], tradition: 'traditional', exampleKu: 'Got.', translations: {} }] }));
        const files = { riddle: pathToFileURL(riddles), proverb: pathToFileURL(proverbs) };
        const log = { info: () => undefined, warn: () => undefined };
        // the proverb names no source for a traditional saying: it waits until its file is fixed
        expect(await seedStarterLore(pool, log, files)).toEqual({
          seeded: [`riddle:kmr-${tag}-starter`],
          refreshed: [],
          published: [`riddle:kmr-${tag}-starter`],
          held: [],
          retired: [],
        });
        expect(await seedStarterLore(pool, log, files)).toEqual({ seeded: [], refreshed: [], published: [], held: [], retired: [] });
        const read = async () =>
          (
            await pool.query<{ id: string; status: string; review_status: string; source: string; level: number; payload: { notes?: string } }>(
              `SELECT id, status, review_status, source, level, payload FROM game_content WHERE kind = 'riddle' AND payload->>'slug' = $1`,
              [`kmr-${tag}-starter`],
            )
          ).rows;
        const rows = await read();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: 'published', review_status: 'approved', source: 'starter', level: 5, payload: { notes } });
        const id = rows[0]!.id;
        const translations = async () =>
          (await pool.query(`SELECT locale, review_status, payload->>'answer' AS answer FROM game_content_translations WHERE content_id = $1 ORDER BY locale`, [id])).rows;
        // publishing is not a claim that anyone checked the text: every translation stays unreviewed
        expect(await translations()).toEqual([
          { locale: 'de', review_status: 'unreviewed', answer: 'Antwort' },
          { locale: 'en', review_status: 'unreviewed', answer: riddleEn.answer },
        ]);
        // learners have it, without the reviewers' note
        const shown = await call('GET', `/riddles/kmr-${tag}-starter`, '');
        expect(shown.statusCode).toBe(200);
        expect(shown.body).not.toContain(String(notes));

        // The next release corrects the English: the row follows, and its version moves for an editor who has it open.
        await write({ ...riddleEn, answer: 'A corrected answer' });
        expect((await seedStarterLore(pool, log, files)).refreshed).toEqual([`riddle:kmr-${tag}-starter`]);
        expect((await translations()).find((t) => t.locale === 'en')).toMatchObject({ answer: 'A corrected answer' });

        // Once someone changes it in the admin, the file no longer speaks for it.
        await pool.query(`UPDATE game_content SET updated_by = (SELECT id FROM users ORDER BY created_at DESC LIMIT 1) WHERE id = $1`, [id]);
        await write({ ...riddleEn, answer: 'Another answer' });
        expect((await seedStarterLore(pool, log, files)).refreshed).toEqual([]);
        expect((await translations()).find((t) => t.locale === 'en')).toMatchObject({ answer: 'A corrected answer' });

        await pool.query(`DELETE FROM game_content WHERE id = $1`, [id]);
        expect((await seedStarterLore(pool, log, files)).seeded).toEqual([]);

        // a starter held back goes back to a draft that learners never see, and one retired is archived
        const second = riddle(`kmr-${tag}-held`, { tradition: 'new', region: null, sources: [] });
        const writeOne = (status?: 'held' | 'retired') =>
          writeFile(riddles, JSON.stringify({ riddles: [{ ...second, dialect: 'kmr', ...(status ? { status } : {}), translations: { en: riddleEn } }] }));
        await writeOne();
        expect((await seedStarterLore(pool, log, files)).published).toEqual([`riddle:kmr-${tag}-held`]);
        await writeOne('held');
        expect((await seedStarterLore(pool, log, files)).held).toEqual([`riddle:kmr-${tag}-held`]);
        expect((await call('GET', `/riddles/kmr-${tag}-held`, '')).statusCode).toBe(404);
        await writeOne('retired');
        expect((await seedStarterLore(pool, log, files)).retired).toEqual([`riddle:kmr-${tag}-held`]);
        const status = await pool.query<{ status: string }>(`SELECT status FROM game_content WHERE kind = 'riddle' AND payload->>'slug' = $1`, [`kmr-${tag}-held`]);
        expect(status.rows).toEqual([{ status: 'archived' }]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
