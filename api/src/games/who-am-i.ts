/**
 * Who Am I? on the server, beside the table itself (mp/games/who-am-i.ts):
 * what a table is dealt from, how a whole table is dealt, and the game on one
 * phone passed round a room (shared/src/games/who-am-i/couch.ts).
 *
 *   GET  /games/who-am-i/couch?dialect=kmr|ckb   the difficulties it can be played at on one phone
 *   POST /games/who-am-i/couch/deal              { dialect, difficulty, players }: a card for everyone in the room (10 a minute)
 *
 * Everything dealt is approved: identities and question templates are
 * published `game_content` rows of the variety, read through the trusted
 * readers (an identity's word was picked from published lessons' vocabulary,
 * never typed), so a draft or a row waiting for review never reaches a table.
 *
 * A table is dealt whole (`dealTable`). Every seat gets a different identity,
 * and no seat's tiles hold an identity another seat wears: a player reads the
 * others' cards, so a tile that was one of them would be a tile they could
 * strike out without asking anything. Each seat's tiles and questions are
 * drawn with a draw keyed by the server's own secret (`unitFor`), so their
 * order says nothing of which tile is the hidden one.
 *
 * What the one-phone game does not do, on purpose. It is told nothing about
 * the people in the room: no names, no result. The phone is sent every card,
 * with the facts that answer its questions, so it cannot be trusted to say
 * who won, and a game played this way is never paid or rated; there is no
 * route here that a result could be sent to.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DIFFICULTY_LEVELS,
  GAME_DIALECTS,
  GAME_DIFFICULTIES,
  WHO_AM_I_CANDIDATES,
  WHO_AM_I_COUCH_MAX_PLAYERS,
  WHO_AM_I_COUCH_MIN_PLAYERS,
  WHO_AM_I_MIN_TEMPLATES,
  availableDifficulties,
  dealWhoAmI,
  isWhoAmIFact,
  learnGame,
  type GameDialect,
  type GameDifficulty,
  type GameLevel,
  type WhoAmICouchDeals,
  type WhoAmICouchOffer,
  type WhoAmIDeal,
  type WhoAmIIdentity,
  type WhoAmITemplate,
} from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { unitFor } from './draw.js';
import type { TrustedSources } from './sources.js';

export const WHO_AM_I = 'who-am-i' as const;

const MINIMUM = learnGame(WHO_AM_I).minimum;
const DEALS_PER_MINUTE = 10;

/** What a table is dealt from: a variety's approved identities and question templates. */
export interface WhoAmIPool {
  identities: WhoAmIIdentity[];
  templates: WhoAmITemplate[];
}

/** The approved identities and question templates of a variety, as a deal reads them. */
export async function whoAmIPool(sources: TrustedSources, dialect: GameDialect): Promise<WhoAmIPool> {
  const [identities, templates] = await Promise.all([sources.content('identity', dialect), sources.content('question_template', dialect)]);
  return {
    identities: identities.map((r) => ({
      id: r.id,
      key: r.key,
      level: r.level,
      word: r.payload.word,
      meanings: r.payload.meanings,
      category: r.payload.category,
      // only the facts a template can ask: anything else in a table is a typo nobody can be asked about
      facts: Object.fromEntries(Object.entries(r.payload.facts).filter(([k]) => isWhoAmIFact(k))),
    })),
    templates: templates.filter((r) => isWhoAmIFact(r.payload.fact)).map((r) => ({ id: r.id, ku: r.payload.ku, meanings: r.payload.meanings, fact: r.payload.fact })),
  };
}

/** The identities a difficulty plays: its levels' (beginner 1–2, intermediate 3, advanced 4–5). */
export function identitiesAt(identities: readonly WhoAmIIdentity[], difficulty: GameDifficulty): WhoAmIIdentity[] {
  const levels = DIFFICULTY_LEVELS[difficulty] as readonly number[];
  return identities.filter((i) => levels.includes(i.level));
}

/** The difficulties a table can be played at: enough question templates, and levels that hold the game's minimum of identities. */
export function tableDifficulties(pool: WhoAmIPool): GameDifficulty[] {
  if (pool.templates.length < WHO_AM_I_MIN_TEMPLATES) return [];
  const levels: Record<GameLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const i of pool.identities) if (i.level >= 1 && i.level <= 5) levels[i.level as GameLevel]++;
  return availableDifficulties(levels, MINIMUM);
}

/**
 * A hidden identity for every seat, pure: each a different one, drawn in the
 * seed's keyed order from the difficulty's identities, and dealt its tiles
 * from a pool without the identities the other seats wear. Null when even one
 * seat cannot be dealt, so a table is never begun without somebody.
 */
export function dealTable(pool: WhoAmIPool, difficulty: GameDifficulty, seats: readonly number[], seed: string): Array<{ seat: number; deal: WhoAmIDeal }> | null {
  // every draw is keyed here: the order of a seat's tiles and questions says nothing of who is hidden, on any seat
  const unit = unitFor(seed);
  const order = identitiesAt(pool.identities, difficulty)
    .map((i) => ({ i, k: unit(`target:${i.id}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.i);
  const want = WHO_AM_I_CANDIDATES[difficulty];
  const deal = (target: WhoAmIIdentity, seat: number, among: readonly WhoAmIIdentity[]): WhoAmIDeal | null =>
    dealWhoAmI(target, among, pool.templates, { seed, salt: `seat:${seat}`, want, unit });

  // who wears what, first: a different identity (and a different word) on every seat, each one that can be dealt at all
  const worn: Array<{ seat: number; target: WhoAmIIdentity }> = [];
  for (const seat of seats) {
    const target = order.find((i) => !worn.some((w) => w.target.id === i.id || w.target.word === i.word) && deal(i, seat, pool.identities) !== null);
    if (!target) return null;
    worn.push({ seat, target });
  }
  // then each seat's tiles, from a pool without the others' cards: a card a player can read is never one of their tiles
  const out: Array<{ seat: number; deal: WhoAmIDeal }> = [];
  for (const { seat, target } of worn) {
    const theirs = worn.filter((w) => w.seat !== seat).map((w) => w.target);
    const among = pool.identities.filter((p) => !theirs.some((t) => t.id === p.id || t.word === p.word));
    const dealt = deal(target, seat, among);
    if (!dealt) return null;
    out.push({ seat, deal: dealt });
  }
  return out;
}

const offerQuery = z.object({ dialect: z.enum(GAME_DIALECTS) });
const dealBody = z.strictObject({
  dialect: z.enum(GAME_DIALECTS),
  difficulty: z.enum(GAME_DIFFICULTIES),
  players: z.number().int().min(WHO_AM_I_COUCH_MIN_PLAYERS).max(WHO_AM_I_COUCH_MAX_PLAYERS),
});

export function registerWhoAmICouchRoutes(app: FastifyInstance, sources: TrustedSources): void {
  app.get('/games/who-am-i/couch', { schema: { querystring: offerQuery }, preHandler: requireAuth }, async (req): Promise<WhoAmICouchOffer> => {
    const { dialect } = req.query as z.infer<typeof offerQuery>;
    return { dialect, difficulties: tableDifficulties(await whoAmIPool(sources, dialect)) };
  });

  app.post(
    '/games/who-am-i/couch/deal',
    { schema: { body: dealBody }, config: { rateLimit: { max: DEALS_PER_MINUTE, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply): Promise<WhoAmICouchDeals> => {
      const b = req.body as z.infer<typeof dealBody>;
      const pool = await whoAmIPool(sources, b.dialect);
      const dealt = tableDifficulties(pool).includes(b.difficulty)
        ? dealTable(
            pool,
            b.difficulty,
            Array.from({ length: b.players }, (_, seat) => seat),
            randomUUID(),
          )
        : null;
      if (!dealt) throw new AppError('GAME_UNAVAILABLE', 409, 'there are not enough approved identities at this difficulty yet');
      // the cards of a game about to be played: never kept by anything between here and the phone
      void reply.header('cache-control', 'no-store');
      return { dialect: b.dialect, difficulty: b.difficulty, deals: dealt.map((d) => d.deal) };
    },
  );
}
