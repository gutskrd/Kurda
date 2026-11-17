/**
 * Who Am I? on the server, beside the table itself (mp/games/who-am-i.ts):
 * what a table is dealt from, how a whole table is dealt, and the game on one
 * phone passed round a room (shared/src/games/who-am-i/couch.ts).
 *
 *   GET  /games/who-am-i/couch?dialect=kmr|ckb   the difficulties it can be played at on one phone
 *   POST /games/who-am-i/couch/deal              { dialect, difficulty, players, answers? }: a card for everyone in the room (10 a minute)
 *   POST /games/who-am-i/report                  a card's answer to a question that a player thinks is wrong (5 a minute)
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
 * How many answers the friends are offered is the app's to ask for: four
 * (yes, could be, no, not sure) from today's apps, two (yes and no) from apps
 * made before there were four, which send nothing. The server's own rules
 * score a "sometimes" card fairly whichever the friends say, so a table is
 * dealt the cards as they are, at either count. A phone from before the four
 * plays its one-phone game by rules of its own, which read anything but
 * `true` as no: the cards it is dealt (`asTwoAnswerDeal`) come without their
 * "sometimes" rows and without the questions those rows answered, so it
 * never meets a third answer. Its game has no tiles to tell apart, so only
 * the card itself is trimmed.
 *
 * A wrong card is reported by a player who read it (`/games/who-am-i/report`):
 * no text, only which card and which question, counted in the card's review
 * note for the people who keep the cards. A count is all it is: nothing a
 * player sends changes what a card says, and one player counts once a day.
 *
 * What the one-phone game does not do, on purpose. It is told nothing about
 * the people in the room: no names, no result. The phone is sent every card,
 * with the facts that answer its questions, so it cannot be trusted to say
 * who won, and a game played this way is never paid or rated; there is no
 * route here that a result could be sent to.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import {
  DIFFICULTY_LEVELS,
  GAME_DIALECTS,
  GAME_DIFFICULTIES,
  WHO_AM_I_CANDIDATES,
  WHO_AM_I_COUCH_MAX_PLAYERS,
  WHO_AM_I_COUCH_MIN_PLAYERS,
  WHO_AM_I_MIN_TEMPLATES,
  GAME_CONTENT_REVIEW_NOTE_MAX,
  asTwoAnswers,
  availableDifficulties,
  dealWhoAmI,
  hasWhoAmIFact,
  isWhoAmIFact,
  learnGame,
  verdictFor,
  type GameDialect,
  type GameDifficulty,
  type GameLevel,
  type WhoAmICouchDeals,
  type WhoAmICouchOffer,
  type DealUnit,
  type WhoAmIDeal,
  type WhoAmIAnswerCount,
  type WhoAmIFactValue,
  type WhoAmIIdentity,
  type WhoAmITableState,
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

/** Draws a seat may take before it keeps a deal whose questions cannot tell every tile apart. */
const DEAL_TRIES = 4;

/**
 * Whether a deal's questions can tell every one of its tiles apart: each tile
 * answers them in a way of its own. A deal offers at most a dozen questions,
 * so two tiles that differ only in a question left off the list could never
 * be told apart by asking, and the round would end in a coin toss.
 */
export function tellsTilesApart(deal: WhoAmIDeal, pool: readonly WhoAmIIdentity[]): boolean {
  const byId = new Map(pool.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const c of deal.candidates) {
    const tile = byId.get(c.id);
    if (!tile) return false;
    const answers = deal.questions.map((q) => verdictFor(tile, q.fact)).join(',');
    if (seen.has(answers)) return false;
    seen.add(answers);
  }
  return true;
}

/**
 * A one-phone deal as a phone from before the four answers can play it: its
 * card without its "sometimes" rows, and without the questions those rows
 * answered, so every question it can ask has a plain yes or no. Such a phone
 * shows no tiles, so the questions left need tell none apart.
 */
export function asTwoAnswerDeal(deal: WhoAmIDeal): WhoAmIDeal {
  const identity = asTwoAnswers(deal.identity);
  return { ...deal, identity, questions: deal.questions.filter((q) => deal.identity.facts[q.fact] !== 'sometimes') };
}

/**
 * One seat's deal: its hidden identity among tiles from `among`. A deal whose
 * questions cannot tell its tiles apart is drawn again (another salt, so other
 * tiles), a few times, before the first one is kept as it was. Null when the
 * identity cannot be dealt at all.
 */
export function dealSeat(
  target: WhoAmIIdentity,
  among: readonly WhoAmIIdentity[],
  templates: readonly WhoAmITemplate[],
  opts: { seed: string; seat: number; want: number; unit?: DealUnit },
): WhoAmIDeal | null {
  let first: WhoAmIDeal | null = null;
  for (let tryNo = 0; tryNo < DEAL_TRIES; tryNo++) {
    const salt = tryNo === 0 ? `seat:${opts.seat}` : `seat:${opts.seat}:${tryNo}`;
    const dealt = dealWhoAmI(target, among, templates, { seed: opts.seed, salt, want: opts.want, unit: opts.unit });
    // a target the first draw cannot deal is left for another one, as it always was; a later miss keeps the first deal
    if (!dealt) return first;
    if (tellsTilesApart(dealt, among)) return dealt;
    first ??= dealt;
  }
  return first;
}

/**
 * A hidden identity for every seat, pure: each a different one, drawn in the
 * seed's keyed order from the difficulty's identities, and dealt its tiles
 * from a pool without the identities the other seats wear (`dealSeat`). Null
 * when even one seat cannot be dealt, so a table is never begun without
 * somebody.
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
    dealSeat(target, among, pool.templates, { seed, seat, want, unit });

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
  // an app from before the four answers sends nothing, and is dealt cards it can read: yes and no only
  answers: z.union([z.literal(2), z.literal(4)]).optional(),
});

/**
 * A report names a card and a question, and nothing else: on one phone, the
 * card's and the question's ids from the deal the phone holds; at a table the
 * server runs, the game, the seat whose card it is and the question, since a
 * player there is never sent another card's id.
 */
const reportBody = z.union([
  z.strictObject({ identity: z.uuid(), question: z.uuid() }),
  z.strictObject({ game: z.uuid(), seat: z.number().int().min(0).max(64), question: z.string().min(1).max(80) }),
]);

const REPORTS_PER_MINUTE = 5;
/** How long one player's report of one question about one card counts once. */
const REPORT_ONCE_SECONDS = 24 * 60 * 60;

/** The line of a card's review note that counts the reports, by the fact each one was about. */
const REPORTED = 'Players flagged an answer as wrong:';
const REPORT_LINE_MAX = 300;

/**
 * A card's review note with one more report of a fact counted on its first
 * line, and whatever an editor wrote kept below it. The counts are the only
 * thing the line holds (`at-home ×2, sweet ×1`), most reported first, so the
 * note says at a glance which row of the facts table to look at.
 */
export function countReport(note: string | null, fact: string): string {
  const lines = (note ?? '').split('\n');
  const first = lines[0] ?? '';
  const counts = new Map<string, number>();
  const rest = first.startsWith(REPORTED) ? lines.slice(1) : lines;
  if (first.startsWith(REPORTED)) {
    for (const part of first.slice(REPORTED.length).split(',')) {
      const m = /^\s*([a-z0-9-]+) ×(\d+)\.?\s*$/.exec(part);
      if (m) counts.set(m[1]!, Number(m[2]));
    }
  }
  counts.set(fact, (counts.get(fact) ?? 0) + 1);
  const parts = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([f, n]) => `${f} ×${n}`);
  // the most reported rows first, as many as fit: a long tail of single reports says less than the top of the list
  let line = REPORTED;
  for (const part of parts) {
    const next = `${line}${line === REPORTED ? ' ' : ', '}${part}`;
    if (next.length + 1 > REPORT_LINE_MAX) break;
    line = next;
  }
  line += '.';
  const kept = rest.join('\n').trim();
  const room = GAME_CONTENT_REVIEW_NOTE_MAX - line.length - 1;
  return kept === '' ? line : `${line}\n${kept.length > room ? `${kept.slice(0, Math.max(0, room - 1))}…` : kept}`;
}

/** Which card and which fact a report is about, once it is known the reporter may read that card; null when not. */
async function reportedCard(db: Pick<pg.Pool, 'query'>, userId: string, body: z.infer<typeof reportBody>): Promise<{ identity: string; fact: string } | null> {
  if ('identity' in body) {
    // one phone holds every card of its deal, so any published card and any of its own variety's questions can be named
    const found = await db.query<{ facts: Record<string, WhoAmIFactValue> | null; fact: string | null }>(
      `SELECT i.payload->'facts' AS facts, q.payload->>'fact' AS fact
         FROM game_content i JOIN game_content q ON q.dialect = i.dialect
        WHERE i.id = $1 AND i.kind = 'identity' AND i.status = 'published'
          AND q.id = $2 AND q.kind = 'question_template' AND q.status = 'published'`,
      [body.identity, body.question],
    );
    const row = found.rows[0];
    // a question the card has no row for is never dealt beside it, so it cannot have been answered wrongly
    if (!row?.fact || !row.facts || !hasWhoAmIFact(row.facts, row.fact)) return null;
    return { identity: body.identity, fact: row.fact };
  }
  const found = await db.query<{ state: WhoAmITableState | null; seat: number | null }>(
    `SELECT l.state, p.seat FROM game_lobbies l
       JOIN game_lobby_players p ON p.lobby_id = l.id AND p.user_id = $2 AND NOT p.removed
      WHERE l.id = $1 AND l.game = $3 AND l.state IS NOT NULL`,
    [body.game, userId, WHO_AM_I],
  );
  const row = found.rows[0];
  const state = row?.state;
  if (!row || !state || !Array.isArray(state.seats)) return null;
  const target = state.seats.find((s) => s.seat === body.seat);
  const deal = target?.deal;
  if (!target || !deal) return null;
  // the card is read by everyone at the table but its own seat, and by that seat too once it has it, is out, or it is over
  const reads = row.seat !== body.seat || target.solvedAt !== null || target.out || state.finishedAt !== null;
  const question = deal.questions.find((q) => q.id === body.question);
  if (!reads || !question || !hasWhoAmIFact(deal.identity.facts, question.fact)) return null;
  return { identity: deal.identity.id, fact: question.fact };
}

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
      const answers: WhoAmIAnswerCount = b.answers === 4 ? 4 : 2;
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
      // a phone from before the four answers reads anything but yes as no: its cards come without a third answer
      return { dialect: b.dialect, difficulty: b.difficulty, deals: dealt.map((d) => (answers === 4 ? d.deal : asTwoAnswerDeal(d.deal))), answers };
    },
  );

  app.post(
    '/games/who-am-i/report',
    { schema: { body: reportBody }, config: { rateLimit: { max: REPORTS_PER_MINUTE, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req): Promise<{ counted: boolean }> => {
      const b = req.body as z.infer<typeof reportBody>;
      const userId = req.user!.id;
      const card = await reportedCard(app.db, userId, b);
      if (!card) throw new AppError('NOT_FOUND', 404, 'no such card and question to report');
      // the same player saying the same thing again is one report: thanked, and not counted twice
      const once = `${userId}:${card.identity}:${card.fact}`;
      if (await app.cache.get<boolean>('who-am-i-report', once)) return { counted: false };
      const client = await app.db.connect();
      try {
        await client.query('BEGIN');
        const row = await client.query<{ review_note: string | null }>(`SELECT review_note FROM game_content WHERE id = $1 FOR UPDATE`, [card.identity]);
        if (row.rows[0]) {
          // the note only: what the card says, its approval and its version are an editor's, never a player's
          await client.query(`UPDATE game_content SET review_note = $2 WHERE id = $1`, [card.identity, countReport(row.rows[0].review_note, card.fact)]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      await app.cache.set('who-am-i-report', once, true, REPORT_ONCE_SECONDS);
      return { counted: true };
    },
  );
}
