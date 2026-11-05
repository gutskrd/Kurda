/**
 * Who Am I? played alone: a round of WHO_AM_I_ROUND_ITEMS hidden identities.
 * For each, the player asks yes/no questions from the approved templates
 * (`POST /games/who-am-i/sessions/:id/ask`), the answers coming from the
 * identity's facts table, and then guesses from its tiles through the solo
 * kit's answer route — two guesses, as every solo item has two tries.
 *
 * Everything shown is approved: identities and question templates are
 * published `game_content` rows of the learner's variety (an identity's word
 * was picked in the admin panel from published lessons' vocabulary, never
 * typed), and the answers are the variety's own yes and no from each app's
 * catalogue. A round is dealt on the server (`dealWhoAmI`): never-met
 * identities first, each among tiles that share most of its facts, with only
 * the questions every tile can answer — so the list never gives it away. The
 * identity stays on the server until the item is done.
 *
 * Pay is the kit's, by performance: a right guess pays by the identity's
 * level, with the first-try bonus for getting it with the first guess, and
 * nothing for an identity guessed right in the last two weeks. The game's own
 * score — fewer questions score more (`whoAmIPoints`) — is worked out by the
 * apps from the questions asked and the guesses made, which every view
 * carries.
 *
 * The questions asked are kept on the item itself in the session's `items`,
 * under the session's lock, so a question asked twice is answered once and a
 * round come back to shows what was asked.
 */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import {
  DIFFICULTY_LEVELS,
  SOLO_MAX_ATTEMPTS,
  WHO_AM_I_CANDIDATES,
  WHO_AM_I_ROUND_ITEMS,
  answerFor,
  dealWhoAmI,
  isWhoAmIFact,
  type GameDialect,
  type GameDifficulty,
  type WhoAmIAnswer,
  type WhoAmIAskResult,
  type WhoAmIAsked,
  type WhoAmICorrection,
  type WhoAmIHint,
  type WhoAmIIdentity,
  type WhoAmIItemView,
  type WhoAmITemplate,
} from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { seededShuffle } from '../content/exercises.js';
import { freshestFirst, seenFor } from './seen.js';
import type { TrustedSources } from './sources.js';
import type { RoundAsk, SoloEngine, StoredItem } from './solo.js';

export const WHO_AM_I = 'who-am-i' as const;

/** A hidden identity as a round keeps it: the identity and its facts stay here. */
export interface WhoAmIItem extends StoredItem {
  identity: Pick<WhoAmIIdentity, 'id' | 'word' | 'meanings' | 'category' | 'facts'>;
  tiles: Array<{ id: string; word: string; meanings: WhoAmIIdentity['meanings'] }>;
  questions: Array<{ id: string; ku: string; meanings: WhoAmIIdentity['meanings']; fact: string }>;
  /** a beginner sees what each tile means */
  showMeanings: boolean;
  asked: WhoAmIAsked[];
}

/** The approved identities and question templates of a variety, as a deal reads them. */
export async function whoAmIPool(sources: TrustedSources, dialect: GameDialect): Promise<{ identities: WhoAmIIdentity[]; templates: WhoAmITemplate[] }> {
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

const answerSchema: z.ZodType<WhoAmIAnswer> = z.object({ guess: z.string().min(1).max(80) });
const askParams = z.object({ id: z.uuid() });
const askBody = z.object({ index: z.number().int().min(0).max(WHO_AM_I_ROUND_ITEMS * 4), question: z.string().min(1).max(80) });

export class WhoAmIGame implements SoloEngine<WhoAmIItem, WhoAmIItemView, WhoAmIAnswer, WhoAmIHint, WhoAmICorrection> {
  readonly game = WHO_AM_I;
  readonly answer = answerSchema;

  constructor(private readonly sources: TrustedSources) {}

  async build(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: WhoAmIItem[]; meta: Record<string, unknown> } | null> {
    const [{ identities, templates }, seen] = await Promise.all([whoAmIPool(this.sources, ask.dialect), seenFor(db, ask.userId, WHO_AM_I)]);
    const here = identitiesAt(identities, ask.difficulty);
    if (here.length < WHO_AM_I_ROUND_ITEMS) return null;
    const targets = freshestFirst(seededShuffle(here, `${ask.seed}:targets`), seen);
    const want = WHO_AM_I_CANDIDATES[ask.difficulty];
    const items: WhoAmIItem[] = [];
    for (const target of targets) {
      if (items.length >= WHO_AM_I_ROUND_ITEMS) break;
      // the tiles come from the whole variety, so a small level still has company to hide among
      const deal = dealWhoAmI(target, identities, templates, { seed: ask.seed, salt: String(items.length), want });
      if (!deal) continue;
      items.push({
        key: target.key,
        level: target.level,
        repeat: seen.get(target.key)?.recent === true,
        identity: { id: target.id, word: target.word, meanings: target.meanings, category: target.category, facts: target.facts },
        tiles: deal.candidates,
        questions: deal.questions,
        showMeanings: ask.difficulty === 'beginner',
        asked: [],
      });
    }
    // an identity no deal could be made for (too few questions every tile answers) is passed over; the round is what could be dealt
    return items.length > 0 ? { items, meta: {} } : null;
  }

  view(item: WhoAmIItem, index: number): WhoAmIItemView {
    return {
      index,
      category: item.identity.category,
      tiles: item.tiles.map((t) => ({ id: t.id, word: t.word, meanings: item.showMeanings ? t.meanings : null })),
      questions: item.questions.map((q) => ({ id: q.id, ku: q.ku, meanings: q.meanings })),
      asked: item.asked ?? [],
    };
  }

  grade(item: WhoAmIItem, answer: WhoAmIAnswer): boolean {
    return answer.guess === item.identity.id;
  }

  hint(_item: WhoAmIItem, answer: WhoAmIAnswer): WhoAmIHint {
    return { notThis: answer.guess };
  }

  correction(item: WhoAmIItem): WhoAmICorrection {
    return { id: item.identity.id, word: item.identity.word, meanings: item.identity.meanings, category: item.identity.category };
  }

  why(): string | null {
    return null;
  }

  /**
   * One question about one identity of a round: its answer from the facts,
   * kept with the item. Refused once the item is done (guessed, or both
   * guesses spent), and for a question it does not offer. Asking again what
   * was asked answers the same, and counts once.
   */
  async ask(pool: pg.Pool, sessionId: string, userId: string, index: number, questionId: string): Promise<WhoAmIAskResult> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<{ game: string; items: WhoAmIItem[]; finished_at: Date | null; expired: boolean }>(
        `SELECT game, items, finished_at, (expires_at <= now()) AS expired FROM game_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sessionId, userId],
      );
      const row = res.rows[0];
      if (!row || row.game !== WHO_AM_I) throw new AppError('GAME_SESSION_NOT_FOUND', 404, 'no such round');
      if (row.finished_at) throw new AppError('GAME_SESSION_FINISHED', 409, 'this round is finished');
      if (row.expired) throw new AppError('GAME_SESSION_EXPIRED', 410, 'this round has expired; start a new one');
      const item = row.items[index];
      if (!item) throw new AppError('ITEM_NOT_IN_SESSION', 404, 'no such item in this round');
      const tries = await client.query<{ correct: boolean }>(`SELECT correct FROM game_session_answers WHERE session_id = $1 AND item_index = $2`, [sessionId, index]);
      if (tries.rows.some((t) => t.correct) || tries.rows.length >= SOLO_MAX_ATTEMPTS) throw new AppError('ITEM_DONE', 409, 'this identity has had its guesses');
      const question = item.questions.find((q) => q.id === questionId);
      if (!question) throw new AppError('BAD_REQUEST', 400, 'that question is not one this round offers');
      const asked = item.asked ?? [];
      let answer = asked.find((a) => a.question === questionId)?.answer;
      if (answer === undefined) {
        answer = answerFor(item.identity, question.fact);
        asked.push({ question: questionId, answer });
        await client.query(`UPDATE game_sessions SET items = jsonb_set(items, ARRAY[$2::text, 'asked'], $3::jsonb) WHERE id = $1`, [
          sessionId,
          String(index),
          JSON.stringify(asked),
        ]);
      }
      await client.query('COMMIT');
      return { index, question: questionId, answer, asked };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

/** `POST /games/who-am-i/sessions/:id/ask` { index, question }: a question's answer, for the learner whose round it is. */
export function registerWhoAmIRoutes(app: FastifyInstance, game: WhoAmIGame): void {
  app.post(
    '/games/who-am-i/sessions/:id/ask',
    { schema: { params: askParams, body: askBody }, config: { rateLimit: { max: 120, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req) => {
      const b = req.body as z.infer<typeof askBody>;
      return game.ask(app.db, (req.params as z.infer<typeof askParams>).id, req.user!.id, b.index, b.question);
    },
  );
}
