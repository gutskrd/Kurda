import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  COUCH_DECK_DEFAULT,
  COUCH_DECK_EXCLUDE_MAX,
  COUCH_DECK_MAX,
  DIFFICULTY_LEVELS,
  GAME_DIALECTS,
  GAME_DIFFICULTIES,
  GAME_SLUG_PATTERN,
  IMPOSTOR_CATEGORY_MIN,
  IMPOSTOR_GUESS_OPTIONS,
  foldForDialect,
  impostorTooClose,
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
import { decoysFor } from '../mp/games/impostor.js';
import type { PublishedContent, TrustedSources } from './sources.js';

/**
 * Impostor for one phone passed round a room
 * (shared/src/games/impostor/couch.ts): where it can be played, and the cards
 * for an evening.
 *
 *   GET  /games/impostor/couch?dialect=kmr|ckb   the difficulties it is offered at, each with its categories
 *   POST /games/impostor/couch/deck              { dialect, difficulty, category?, count?, exclude? }: cards to play with (10 a minute)
 *
 * The cards are the table game's own: approved, published word cards, read
 * through the trusted readers, so a draft or a card waiting for review never
 * reaches a room. Each comes with the three other words a caught impostor
 * guesses among and, where its category has one, a second word for the odd
 * one out: the card's own `twin` where an editor chose one, else another of
 * its category. Only categories with `IMPOSTOR_CATEGORY_MIN` cards at the
 * difficulty are offered or dealt from, as at the table. `exclude` names the
 * words the room has already played tonight; they are dealt again only once
 * nothing else is left, so a long evening never runs dry.
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
  exclude: z.array(z.string().trim().min(1).max(60)).max(COUCH_DECK_EXCLUDE_MAX).default([]),
});

const at = (pool: readonly Card[], difficulty: GameDifficulty): Card[] => pool.filter((row) => (DIFFICULTY_LEVELS[difficulty] as readonly number[]).includes(row.level));

/**
 * Where the game is offered, pure: a difficulty once its approved cards reach
 * the game's minimum and at least one of its categories can be dealt from, and
 * in it every category with `IMPOSTOR_CATEGORY_MIN` cards. A category's name
 * is its cards' own hint.
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
    const categories = [...bySlug.values()].filter((c) => c.cards >= IMPOSTOR_CATEGORY_MIN).sort((a, b) => b.cards - a.cards || a.slug.localeCompare(b.slug));
    if (categories.length > 0) difficulties.push({ difficulty, cards: cards.length, categories });
  }
  return { dialect, difficulties };
}

/**
 * The second word for the odd one out, pure: the card's own twin where an
 * editor chose one and it is still an approved card of the variety, else the
 * first other card of its category in the seed's order; never one too close
 * to the word (`impostorTooClose`), which would make the odd one out no
 * different at all.
 */
function twinFor(chosen: WordCardContent, all: readonly WordCardContent[], same: readonly WordCardContent[], dialect: GameDialect): WordCardContent | undefined {
  const key = (w: string): string => foldForDialect(w, dialect, true);
  // the odd one out is shown the card's category, so their word must be one of it too
  const chosenTwin = chosen.twin ? all.find((p) => p.category === chosen.category && key(p.word) === key(chosen.twin!)) : undefined;
  if (chosenTwin && !impostorTooClose(chosenTwin, chosen, dialect)) return chosenTwin;
  return same.find((p) => !impostorTooClose(p, chosen, dialect));
}

/**
 * An evening's cards, pure: drawn in the seed's order from the difficulty's
 * approved cards in categories that can be dealt from (the one asked for, or
 * any), no word twice, and the words in `exclude` only once every other has
 * been dealt. Each card's other options come from its own category first
 * (`decoysFor`), and its second word, for the odd one out, only ever from its
 * own category (`twinFor`).
 */
export function couchDeck(
  pool: readonly Card[],
  dialect: GameDialect,
  difficulty: GameDifficulty,
  category: string | null,
  count: number,
  seed: string,
  exclude: readonly string[] = [],
): CouchCard[] | null {
  const all = at(pool, difficulty).map((row) => row.payload);
  if (all.length < MINIMUM) return null;
  const counts = new Map<string, number>();
  for (const p of all) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const dealable = (slug: string): boolean => (counts.get(slug) ?? 0) >= IMPOSTOR_CATEGORY_MIN;
  const from = all.filter((p) => dealable(p.category) && (category === null || p.category === category));
  if (from.length === 0) return null;
  const key = (w: string): string => foldForDialect(w, dialect, true);
  const played = new Set(exclude.map(key));
  const variety = pool.map((row) => row.payload);
  const drawn = seededOrder(seed, 'deck', from);
  const cards: CouchCard[] = [];
  const dealt = new Set<string>();
  for (const chosen of [...drawn.filter((p) => !played.has(key(p.word))), ...drawn.filter((p) => played.has(key(p.word)))]) {
    if (cards.length >= count) break;
    if (dealt.has(key(chosen.word))) continue;
    const decoys = decoysFor(chosen, all, dialect, seed, `:${chosen.word}`);
    if (decoys.length < IMPOSTOR_GUESS_OPTIONS - 1) continue;
    const same = seededOrder(seed, `twin:${chosen.word}`, all.filter((p) => p.category === chosen.category && key(p.word) !== key(chosen.word)));
    const twin = twinFor(chosen, variety, same, dialect);
    dealt.add(key(chosen.word));
    cards.push({
      word: chosen.word,
      meanings: chosen.meanings,
      hint: { ku: chosen.hint.ku, meanings: chosen.hint.meanings },
      category: chosen.category,
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
      const cards = couchDeck(await sources.content('word_card', b.dialect), b.dialect, b.difficulty, b.category ?? null, b.count, randomUUID(), b.exclude);
      if (!cards) throw new AppError('GAME_UNAVAILABLE', 409, 'there are not enough approved word cards for this game now');
      // the cards of a game about to be played: never kept by anything between here and the phone
      void reply.header('cache-control', 'no-store');
      return { dialect: b.dialect, cards };
    },
  );
}
