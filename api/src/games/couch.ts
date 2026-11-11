import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  COUCH_DECK_DEFAULT,
  COUCH_DECK_MAX,
  DIFFICULTY_LEVELS,
  GAME_DIALECTS,
  GAME_DIFFICULTIES,
  GAME_SLUG_PATTERN,
  IMPOSTOR_GUESS_OPTIONS,
  foldForDialect,
  learnGame,
  seededOrder,
  type CouchCard,
  type CouchCategory,
  type CouchDeck,
  type CouchOffer,
  type GameDialect,
  type GameDifficulty,
  type WordCardContent,
} from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { PublishedContent, TrustedSources } from './sources.js';

/**
 * Kurdish Impostor for one phone passed round a room
 * (shared/src/games/impostor/couch.ts): where it can be played, and the cards
 * for an evening.
 *
 *   GET  /games/impostor/couch?dialect=kmr|ckb   the difficulties it is offered at, each with its categories
 *   POST /games/impostor/couch/deck              { dialect, difficulty, category?, count? }: cards to play with (10 a minute)
 *
 * The cards are the table game's own: approved, published word cards, read
 * through the trusted readers, so a draft or a card waiting for review never
 * reaches a room. Each comes with the three other words a caught impostor
 * guesses among and, where its category has one, a second word for the odd
 * one out.
 *
 * What this does not do, on purpose. It is told nothing about the people in
 * the room: no names, no result. The phone holds every card, so it cannot be
 * trusted to say who won, and a round played this way is never paid or rated;
 * there is no route here that a result could be sent to.
 */

type Card = Pick<PublishedContent<'word_card'>, 'level' | 'payload'>;

const MINIMUM = learnGame('impostor').minimum;
const DECKS_PER_MINUTE = 10;

const offerQuery = z.object({ dialect: z.enum(GAME_DIALECTS) });
const deckBody = z.strictObject({
  dialect: z.enum(GAME_DIALECTS),
  difficulty: z.enum(GAME_DIFFICULTIES),
  category: z.string().regex(GAME_SLUG_PATTERN).nullish(),
  count: z.number().int().min(1).max(COUCH_DECK_MAX).default(COUCH_DECK_DEFAULT),
});

const at = (pool: readonly Card[], difficulty: GameDifficulty): Card[] => pool.filter((row) => (DIFFICULTY_LEVELS[difficulty] as readonly number[]).includes(row.level));

/**
 * Where the game is offered, pure: a difficulty once its approved cards reach
 * the game's minimum, and in it every category with enough cards for a word
 * and the guess's other options. A category's name is its cards' own hint.
 */
export function couchOffer(pool: readonly Card[], dialect: GameDialect): CouchOffer {
  const difficulties: CouchOffer['difficulties'] = [];
  for (const difficulty of GAME_DIFFICULTIES) {
    const cards = at(pool, difficulty);
    if (cards.length < MINIMUM) continue;
    const bySlug = new Map<string, CouchCategory>();
    for (const { payload } of cards) {
      const known = bySlug.get(payload.category);
      if (known) known.cards++;
      else bySlug.set(payload.category, { slug: payload.category, ku: payload.hint.ku, meanings: payload.hint.meanings, cards: 1 });
    }
    const categories = [...bySlug.values()].filter((c) => c.cards >= IMPOSTOR_GUESS_OPTIONS).sort((a, b) => b.cards - a.cards || a.slug.localeCompare(b.slug));
    difficulties.push({ difficulty, cards: cards.length, categories });
  }
  return { dialect, difficulties };
}

/**
 * An evening's cards, pure: drawn in the seed's order from the difficulty's
 * approved cards (one category's, when one was asked for), no word twice.
 * Each card's other options come from its own category first, then from
 * anywhere, never one that folds to the same letters as the word; its second
 * word, for the odd one out, only ever from its own category.
 */
export function couchDeck(pool: readonly Card[], dialect: GameDialect, difficulty: GameDifficulty, category: string | null, count: number, seed: string): CouchCard[] | null {
  const all = at(pool, difficulty).map((row) => row.payload);
  if (all.length < MINIMUM) return null;
  const from = category === null ? all : all.filter((p) => p.category === category);
  if (from.length < IMPOSTOR_GUESS_OPTIONS) return null;
  const key = (w: string): string => foldForDialect(w, dialect, true);
  const cards: CouchCard[] = [];
  const dealt = new Set<string>();
  for (const chosen of seededOrder(seed, 'deck', from)) {
    if (cards.length >= count) break;
    if (dealt.has(key(chosen.word))) continue;
    const others = all.filter((p) => key(p.word) !== key(chosen.word));
    const same = seededOrder(seed, `same:${chosen.word}`, others.filter((p) => p.category === chosen.category));
    const rest = seededOrder(seed, `rest:${chosen.word}`, others.filter((p) => p.category !== chosen.category));
    const decoys: string[] = [];
    for (const p of [...same, ...rest]) {
      if (decoys.length >= IMPOSTOR_GUESS_OPTIONS - 1) break;
      if (!decoys.some((d) => key(d) === key(p.word))) decoys.push(p.word);
    }
    if (decoys.length < IMPOSTOR_GUESS_OPTIONS - 1) continue;
    const twin: WordCardContent | undefined = same[0];
    dealt.add(key(chosen.word));
    cards.push({
      word: chosen.word,
      meanings: chosen.meanings,
      hint: { ku: chosen.hint.ku, meanings: chosen.hint.meanings },
      decoys,
      twin: twin ? { word: twin.word, meanings: twin.meanings } : null,
    });
  }
  return cards.length > 0 ? cards : null;
}

export function registerCouchRoutes(app: FastifyInstance, sources: TrustedSources): void {
  app.get('/games/impostor/couch', { schema: { querystring: offerQuery }, preHandler: requireAuth }, async (req): Promise<CouchOffer> => {
    const { dialect } = req.query as z.infer<typeof offerQuery>;
    return couchOffer(await sources.content('word_card', dialect), dialect);
  });

  app.post(
    '/games/impostor/couch/deck',
    { schema: { body: deckBody }, config: { rateLimit: { max: DECKS_PER_MINUTE, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply): Promise<CouchDeck> => {
      const b = req.body as z.infer<typeof deckBody>;
      const cards = couchDeck(await sources.content('word_card', b.dialect), b.dialect, b.difficulty, b.category ?? null, b.count, randomUUID());
      if (!cards) throw new AppError('GAME_UNAVAILABLE', 409, 'there are not enough approved word cards for this game now');
      // the cards of a game about to be played: never kept by anything between here and the phone
      void reply.header('cache-control', 'no-store');
      return { dialect: b.dialect, cards };
    },
  );
}
