/**
 * Cards made from approved words, for the admin's Game content page (shared
 * games/word-cards.ts): Kurdish Bluff's cards and Who Am I?'s identities.
 *
 *   GET  /admin/game-content/words?dialect&q&from&limit   words to pick from, with their approved meanings and an example
 *   POST /admin/game-content/from-word                    { kind, dialect, ref, level, category?, facts? }: a draft made of one
 *
 * The words are only ever ones a person approved: those published lessons
 * teach (with the English the lesson pairs them with, and a published
 * lesson's sentence that uses them as the example), and dictionary entries an
 * admin curated for the games (`in_games`), with their first sense and its
 * example. The Kurdish is copied from there into the draft by the server —
 * the word, its Kurdish definition where the dictionary has one, the example
 * — so nobody types it again; the editor adds what is not Kurdish. Each row
 * remembers the word it was made of (`origin`), so a word is one card of a
 * kind per variety, and the draft still goes through review before any game
 * shows it.
 */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import {
  GAME_DIALECTS,
  GAME_WORD_SOURCES,
  WHO_AM_I_CATEGORIES,
  WORD_CARD_KINDS,
  checkGameContent,
  courseSpelling,
  dictionaryKey,
  fitsDialect,
  foldForDialect,
  gameWords,
  isWhoAmIFact,
  isWordRef,
  type AdminGameContent,
  type GameDialect,
  type GameWordCandidate,
  type GameWordSource,
  type Meanings,
  type WordCardKind,
} from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { requireCapability } from '../admin/routes.js';
import { AppError } from '../plugins/errors.js';
import { escapeLike } from '../db/like.js';
import type { TrustedSources } from './sources.js';
import type { GameContentAdminService } from './content-admin.js';

type Executor = Pick<pg.Pool, 'query'>;

const absentIfEmpty = (v: unknown): unknown => (v === '' ? undefined : v);
const wordsQuery = z.object({
  dialect: z.enum(GAME_DIALECTS),
  q: z.preprocess(absentIfEmpty, z.string().max(60).optional()),
  from: z.preprocess(absentIfEmpty, z.enum(GAME_WORD_SOURCES).optional()),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
const fromWordBody = z.object({
  kind: z.enum(WORD_CARD_KINDS),
  dialect: z.enum(GAME_DIALECTS),
  ref: z.string().refine(isWordRef, 'not a word to pick'),
  level: z.number().int().min(1).max(5),
  category: z.enum(WHO_AM_I_CATEGORIES).optional(),
  facts: z.record(z.string().max(40), z.boolean()).optional(),
});

/** The code a dictionary's Kurdish definition is filed under: the variety's own interface language. */
const OWN_LOCALE: Record<GameDialect, 'ku' | 'ckb'> = { kmr: 'ku', ckb: 'ckb' };

interface EntryRow {
  id: string;
  headword: string;
  senses: Array<{ en: string | null; ku: string | null; example: { ku: string; en: string | null } | null }> | null;
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/** A dictionary entry as a word to pick: its first sense that says anything, in the variety's script where it is Kurdish. */
export function entryCandidate(row: EntryRow, dialect: GameDialect): Omit<GameWordCandidate, 'made'> | null {
  const word = row.headword.normalize('NFC').trim();
  // a Kurmancî headword with a capital is a name, and a word in the other script belongs to the other variety
  if (!fitsDialect(word, dialect) || (dialect === 'kmr' && /^\p{Lu}/u.test(word))) return null;
  for (const s of row.senses ?? []) {
    const en = clean(s.en);
    const ku = clean(s.ku);
    const own = ku && fitsDialect(ku, dialect) ? ku : null;
    if (!en && !own) continue;
    const meanings: Partial<Meanings> = { ...(en ? { en } : {}), ...(own ? { [OWN_LOCALE[dialect]]: own } : {}) };
    const ex = s.example && clean(s.example.ku) && fitsDialect(s.example.ku, dialect) ? s.example : null;
    return {
      ref: `dict:${row.id}`,
      source: 'dictionary',
      dialect,
      word,
      meanings,
      example: ex ? { ku: ex.ku.trim(), meanings: clean(ex.en) ? { en: ex.en!.trim() } : {} } : null,
    };
  }
  return null;
}

/** Curated dictionary entries of a variety: by the start of the word, or one by its id. */
async function entries(db: Executor, dialect: GameDialect, opts: { q?: string; id?: string; limit: number }): Promise<EntryRow[]> {
  const res = await db.query<EntryRow>(
    `SELECT e.id, e.headword,
            (SELECT json_agg(json_build_object(
                      'en', s.definition_en, 'ku', s.definition_ku,
                      'example', (SELECT json_build_object('ku', x.text_ku, 'en', x.text_en) FROM dict_examples x WHERE x.sense_id = s.id ORDER BY x.position LIMIT 1))
                    ORDER BY s.position)
               FROM dict_senses s WHERE s.entry_id = e.id) AS senses
       FROM dict_entries e
      WHERE e.in_games AND e.dialect = $1
        AND ($2::text IS NULL OR e.headword_folded LIKE $2)
        AND ($3::uuid IS NULL OR e.id = $3)
      ORDER BY e.headword, e.id
      LIMIT $4`,
    [courseSpelling(dialect), opts.q ? `${escapeLike(dictionaryKey(opts.q))}%` : null, opts.id ?? null, opts.limit],
  );
  return res.rows;
}

/** Published lessons' words, each with a published sentence that uses it when one does. */
async function vocabulary(sources: TrustedSources, dialect: GameDialect): Promise<Array<Omit<GameWordCandidate, 'made'>>> {
  const [words, sentences] = await Promise.all([sources.vocabulary(dialect), sources.lessonSentences(dialect)]);
  const usedIn = new Map<string, { ku: string; meanings: Partial<Meanings> }>();
  for (const s of sentences) {
    for (const w of gameWords(s.ku)) {
      const key = foldForDialect(w, dialect);
      if (!usedIn.has(key)) usedIn.set(key, { ku: s.ku, meanings: s.meaning });
    }
  }
  return words.map((w) => ({
    ref: `vocab:${w.key}`,
    source: 'vocabulary' as const,
    dialect,
    word: w.ku,
    meanings: w.meanings,
    example: usedIn.get(foldForDialect(w.ku, dialect)) ?? null,
  }));
}

/** Whether a word matches what was searched: its Kurdish, leniently, or any of its meanings. */
function matches(c: Pick<GameWordCandidate, 'word' | 'meanings'>, q: string, dialect: GameDialect): boolean {
  const key = foldForDialect(q, dialect, true);
  if (key !== '' && foldForDialect(c.word, dialect, true).includes(key)) return true;
  const plain = q.trim().toLowerCase();
  return Object.values(c.meanings).some((m) => typeof m === 'string' && m.toLowerCase().includes(plain));
}

/** The rows already made of these words, by kind. */
async function madeOf(db: Executor, dialect: GameDialect, refs: readonly string[]): Promise<Map<string, Partial<Record<WordCardKind, string>>>> {
  const out = new Map<string, Partial<Record<WordCardKind, string>>>();
  if (refs.length === 0) return out;
  const res = await db.query<{ origin: string; kind: WordCardKind; id: string }>(
    `SELECT origin, kind, id FROM game_content WHERE dialect = $1 AND kind = ANY($2::text[]) AND origin = ANY($3::text[])`,
    [dialect, WORD_CARD_KINDS, refs],
  );
  for (const r of res.rows) out.set(r.origin, { ...(out.get(r.origin) ?? {}), [r.kind]: r.id });
  return out;
}

export class GameWordCards {
  constructor(
    private readonly db: Executor,
    private readonly sources: TrustedSources,
  ) {}

  /** Words to pick from: the lessons' first, then the curated dictionary's, each with what has been made of it. */
  async words(dialect: GameDialect, opts: { q?: string; from?: GameWordSource; limit: number }): Promise<GameWordCandidate[]> {
    const q = opts.q?.trim() || undefined;
    const found: Array<Omit<GameWordCandidate, 'made'>> = [];
    if (opts.from !== 'dictionary') {
      for (const c of await vocabulary(this.sources, dialect)) {
        if (found.length >= opts.limit) break;
        if (!q || matches(c, q, dialect)) found.push(c);
      }
    }
    if (opts.from !== 'vocabulary' && found.length < opts.limit) {
      for (const row of await entries(this.db, dialect, { q, limit: opts.limit - found.length })) {
        const c = entryCandidate(row, dialect);
        if (c) found.push(c);
      }
    }
    const made = await madeOf(this.db, dialect, found.map((c) => c.ref));
    return found.map((c) => ({ ...c, made: made.get(c.ref) ?? {} }));
  }

  /** One word, by where it was found; null when it is not (or no longer) approved. */
  async word(dialect: GameDialect, ref: string): Promise<Omit<GameWordCandidate, 'made'> | null> {
    if (ref.startsWith('dict:')) {
      const [row] = await entries(this.db, dialect, { id: ref.slice('dict:'.length), limit: 1 });
      return row ? entryCandidate(row, dialect) : null;
    }
    return (await vocabulary(this.sources, dialect)).find((c) => c.ref === ref) ?? null;
  }

  /** The payload a kind of card is made with from a word, as it will be stored, or why it cannot be. */
  payloadFor(kind: WordCardKind, word: Omit<GameWordCandidate, 'made'>, extra: { category?: string; facts?: Record<string, boolean> }): unknown {
    if (kind === 'bluff_card') {
      return { word: word.word, definitions: word.meanings, ...(word.example ? { example: { ku: word.example.ku, ...(Object.keys(word.example.meanings).length ? { meanings: word.example.meanings } : {}) } } : {}) };
    }
    if (!word.meanings.en) throw new AppError('NO_MEANING', 422, 'this word has no English meaning to show beside it; pick another');
    // only the facts a question can ask: the table is the shared list, nothing typed beside it
    const facts = Object.fromEntries(Object.entries(extra.facts ?? {}).filter(([k]) => isWhoAmIFact(k)));
    return { word: word.word, meanings: word.meanings, category: extra.category ?? '', facts };
  }
}

export function registerGameWordRoutes(app: FastifyInstance, sources: TrustedSources, content: GameContentAdminService): GameWordCards {
  const cards = new GameWordCards(app.db, sources);
  const canEdit = [requireAuth, requireCapability('content.edit')];

  app.get('/admin/game-content/words', { schema: { querystring: wordsQuery }, preHandler: canEdit }, async (req) => {
    const q = req.query as z.infer<typeof wordsQuery>;
    return { words: await cards.words(q.dialect, { q: q.q, from: q.from, limit: q.limit }) };
  });

  app.post('/admin/game-content/from-word', { schema: { body: fromWordBody }, preHandler: canEdit }, async (req, reply): Promise<AdminGameContent> => {
    const b = req.body as z.infer<typeof fromWordBody>;
    if (b.kind === 'identity' && !b.category) throw new AppError('INVALID', 422, 'an identity needs its category', { errors: [{ path: 'category', message: 'choose one' }] });
    const word = await cards.word(b.dialect, b.ref);
    if (!word) throw new AppError('NOT_FOUND', 404, 'that word is not in published lessons or the curated dictionary of this variety');
    const checked = checkGameContent(b.kind, b.dialect, cards.payloadFor(b.kind, word, { category: b.category, facts: b.facts }));
    if (!checked.ok) {
      throw new AppError('INVALID', 422, `the card has ${checked.issues.length} problem${checked.issues.length === 1 ? '' : 's'} to fix first`, { errors: checked.issues });
    }
    const res = await app.db.query<{ id: string }>(
      `INSERT INTO game_content (kind, dialect, level, payload, source, origin, created_by, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, 'admin', $5, $6, $6)
       ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO NOTHING
       RETURNING id`,
      [b.kind, b.dialect, b.level, JSON.stringify(checked.payload), b.ref, req.user!.id],
    );
    if (!res.rows[0]) {
      const had = await app.db.query<{ id: string }>(`SELECT id FROM game_content WHERE kind = $1 AND dialect = $2 AND origin = $3`, [b.kind, b.dialect, b.ref]);
      throw new AppError('ALREADY_MADE', 409, 'a card of this kind was already made of this word', { id: had.rows[0]?.id ?? null });
    }
    return reply.code(201).send((await content.get(res.rows[0].id))!);
  });

  return cards;
}
