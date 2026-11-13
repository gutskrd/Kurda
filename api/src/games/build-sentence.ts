/**
 * Build a Sentence: a round of approved sentences to put in order
 * from word tiles.
 *
 * The sentences are published lessons' (translations into Kurdish with the
 * English they ask for, conversation lines with theirs) and published
 * `sentence` rows, of 3–10 words, in the learner's variety only. A round is
 * eight of them on one rung of the ladder (shared build-sentence/ladder.ts)
 * — the highest the learner has opened at the difficulty they chose — with a
 * few from the rungs below to warm up, never-met sentences first. Each comes
 * with its words and a few decoys from other approved sentences, shuffled.
 *
 * A line is graded with `checkAnswer`, as a translation is, against every
 * accepted answer — every word order the lessons accept is right. A wrong
 * first try is answered with where the line first goes astray, never the
 * answer; once an item is done, the sentence the right way round with what
 * each word means where the sentence's own source attests it: a row's own
 * glosses, or the meanings the lesson that teaches the sentence gives those
 * very words (`LessonSentence.glosses`). A word is matched exactly as written
 * — its marks and its capital kept — and never through a folded spelling or
 * another lesson's word list: tê is not te ("you"), xwe is not xwê ("salt"),
 * Baran is not baran ("rain"), and the ne of "xemlandî ne" is not the ne a
 * lesson elsewhere teaches as "not". A word nothing attests has no meaning
 * shown.
 *
 * A round with six or more right on the first try on the learner's own rung
 * opens the next rung (`game_progress`): a round holds six of the rung's own
 * sentences, and the warm-ups below it do not count towards it.
 *
 * The item a player is sent carries the meaning and the tiles, never anything
 * worked out from the sentence (a key hashed from it would let the tiles be
 * tried in every order until one hashed the same). The pool is worked out
 * once per variety and kept (`TrustedSources.derived`), and an item's decoys
 * are drawn one at a time from one seeded generator (games/draw.ts), so
 * making a round does not shuffle every word the variety has.
 */
import type pg from 'pg';
import { z } from 'zod';
import {
  DECOYS,
  DIFFICULTY_RUNGS,
  MAX_TILES,
  SENTENCE_RUNGS,
  SOLO_ROUND_ITEMS,
  firstMisplaced,
  foldForDialect,
  gameWords,
  roundRung,
  rungFirstTries,
  rungStep,
  sentenceShape,
  stepAfterRound,
  type GameDialect,
  type GameLevel,
  type Meanings,
  type SentenceAnswer,
  type SentenceCorrection,
  type SentenceHint,
  type SentenceItemView,
  type SentenceLadderView,
  type SentenceRung,
  type SoloResults,
} from '@kurda/shared';
import { checkAnswer, gradingKey } from '../content/exercises.js';
import { drawFor } from './draw.js';
import { freshestFirst, seenFor } from './seen.js';
import { sentenceKey, type TrustedSources } from './sources.js';
import type { RoundAsk, SoloEngine, StoredItem } from './solo.js';

export const BUILD_SENTENCE = 'build-sentence' as const;

/** A sentence a round can use. */
export interface PoolSentence {
  key: string;
  ku: string;
  meaning: Meanings;
  /** the orders shown as right, `ku` first */
  orders: string[];
  /** what grading accepts: the orders, then any other accepted wording */
  accepted: string[];
  rung: SentenceRung;
  level: GameLevel;
  /** what its own source says its words mean, by each word exactly as written (NFC) */
  glosses: Map<string, Partial<Meanings>>;
}

/** A sentence as a round keeps it, answer and all. */
export interface SentenceItem extends StoredItem {
  ku: string;
  meaning: Meanings;
  orders: string[];
  accepted: string[];
  tiles: string[];
  rung: SentenceRung;
  /** what each word of `ku` means, where an approved source says */
  glosses: Array<Partial<Meanings> | null>;
}

/** The sentences a round on a rung is mostly made of — enough to step up on (STEP_UP_FIRST_TRY); the rest warm up from the rungs below. */
const FOCUS = 6;

const answerSchema: z.ZodType<SentenceAnswer> = z.object({ order: z.array(z.number().int().min(0).max(MAX_TILES - 1)).min(1).max(MAX_TILES) });

/** The words a line of tiles says. */
function laid(item: Pick<SentenceItem, 'tiles'>, answer: SentenceAnswer): string[] | null {
  if (new Set(answer.order).size !== answer.order.length) return null;
  const words = answer.order.map((i) => item.tiles[i]);
  return words.every((w): w is string => typeof w === 'string') ? words : null;
}

export class BuildSentenceGame implements SoloEngine<SentenceItem, SentenceItemView, SentenceAnswer, SentenceHint, SentenceCorrection> {
  readonly game = BUILD_SENTENCE;
  readonly answer = answerSchema;

  constructor(private readonly sources: TrustedSources) {}

  /**
   * Every approved sentence of a variety, on its rung: the lessons' first,
   * then published rows (a row with the same Kurdish as a lesson sentence adds
   * its orders, meanings and glosses to it rather than being a second item).
   */
  async pool(dialect: GameDialect): Promise<PoolSentence[]> {
    return (await this.read(dialect)).sentences;
  }

  /** The pool, every word's one spelling and the words' meanings, worked out once and kept while the pools stand. */
  private read(dialect: GameDialect): Promise<{ sentences: PoolSentence[]; spelling: Map<string, string>; decoyWords: string[] }> {
    return this.sources.derived('build-sentence:pool', dialect, async () => {
      const sentences = await this.readSentences(dialect);
      const spelling = this.spellings(sentences, dialect);
      return { sentences, spelling, decoyWords: [...spelling.values()] };
    });
  }

  private async readSentences(dialect: GameDialect): Promise<PoolSentence[]> {
    const [lessons, rows] = await Promise.all([this.sources.lessonSentences(dialect), this.sources.content('sentence', dialect)]);
    const byKey = new Map<string, PoolSentence>();
    for (const s of lessons) {
      const shape = sentenceShape(s.ku, s.meaning.en, dialect);
      const glosses = new Map((s.glosses ?? []).map((g) => [g.word.normalize('NFC'), g.meanings]));
      byKey.set(s.key, { key: s.key, ku: s.ku, meaning: s.meaning, orders: s.orders, accepted: s.accepted, rung: shape.rung, level: shape.level, glosses });
    }
    for (const row of rows) {
      const p = row.payload;
      const key = sentenceKey(dialect, p.ku);
      // a reviewer's glosses for this very sentence, by each word exactly as they wrote it
      const glosses = new Map(p.glosses.map((g) => [g.word.normalize('NFC').trim(), g.meanings]));
      const orders = [p.ku, ...p.orders];
      const had = byKey.get(key);
      if (had) {
        for (const o of orders) if (!had.orders.some((x) => gradingKey(x) === gradingKey(o))) had.orders.push(o);
        had.accepted = [...new Set([...had.accepted, ...orders])];
        had.meaning = { ...had.meaning, ...p.meanings };
        for (const [w, m] of glosses) had.glosses.set(w, m);
        continue;
      }
      const shape = sentenceShape(p.ku, p.meanings.en, dialect);
      byKey.set(key, { key, ku: p.ku, meaning: p.meanings, orders, accepted: orders, rung: shape.rung, level: row.level as GameLevel, glosses });
    }
    return [...byKey.values()];
  }

  /** How many sentences each level holds, for the availability count. */
  async levels(dialect: GameDialect): Promise<Record<GameLevel, number>> {
    const out: Record<GameLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of await this.pool(dialect)) out[s.level]++;
    return out;
  }

  private async step(db: Pick<pg.Pool, 'query'>, userId: string, dialect: GameDialect): Promise<number> {
    const res = await db.query<{ step: number }>(`SELECT step FROM game_progress WHERE user_id = $1 AND game = $2 AND dialect = $3`, [
      userId,
      BUILD_SENTENCE,
      dialect,
    ]);
    return res.rows[0]?.step ?? 1;
  }

  /** The ladder as the intro shows it, with the round left unfinished (the caller fills `open`). */
  async ladder(db: Pick<pg.Pool, 'query'>, userId: string, dialect: GameDialect): Promise<SentenceLadderView> {
    const [pool, step] = await Promise.all([this.pool(dialect), this.step(db, userId, dialect)]);
    return {
      dialect,
      step,
      rungs: SENTENCE_RUNGS.map((rung) => {
        const on = pool.filter((s) => s.rung === rung);
        return { rung, level: on[0]?.level ?? sentenceShape('a b c', 'x', dialect).level, sentences: on.length, open: rungStep(rung) <= step };
      }),
      open: null,
    };
  }

  async build(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: SentenceItem[]; meta: Record<string, unknown> } | null> {
    const [{ sentences: pool, spelling, decoyWords }, step, seen] = await Promise.all([
      this.read(ask.dialect),
      this.step(db, ask.userId, ask.dialect),
      seenFor(db, ask.userId, BUILD_SENTENCE),
    ]);
    const rungs = DIFFICULTY_RUNGS[ask.difficulty];
    const inDifficulty = pool.filter((s) => rungs.includes(s.rung));
    if (inDifficulty.length < SOLO_ROUND_ITEMS) return null;
    const count = (rung: SentenceRung) => inDifficulty.filter((s) => s.rung === rung).length;
    const target =
      roundRung(ask.difficulty, step, (r) => count(r) >= FOCUS) ?? [...rungs].sort((a, b) => count(b) - count(a) || rungStep(a) - rungStep(b))[0]!;

    const fresh = (list: PoolSentence[], salt: string) => freshestFirst(drawFor(`${ask.seed}:${salt}`).shuffle(list), seen);
    const focus = fresh(inDifficulty.filter((s) => s.rung === target), 'focus').slice(0, FOCUS);
    const chosen = new Set(focus.map((s) => s.key));
    // warm-ups from the rungs below first, then anything else at this difficulty
    const below = fresh(inDifficulty.filter((s) => !chosen.has(s.key) && rungStep(s.rung) < rungStep(target)), 'below');
    const rest = fresh(inDifficulty.filter((s) => !chosen.has(s.key) && rungStep(s.rung) >= rungStep(target)), 'rest');
    const round = [...focus];
    for (const s of [...below, ...rest]) {
      if (round.length >= SOLO_ROUND_ITEMS) break;
      if (!chosen.has(s.key)) {
        chosen.add(s.key);
        round.push(s);
      }
    }
    // a round climbs: the warm-ups first, the rung it is played on after
    round.sort((a, b) => rungStep(a.rung) - rungStep(b.rung));

    const items = round.map((s, i): SentenceItem => {
      const draw = drawFor(`${ask.seed}:${i}`);
      const words = gameWords(s.ku).map((w) => spelling.get(foldForDialect(w, ask.dialect)) ?? w);
      const taken = new Set(s.accepted.flatMap((a) => gameWords(a)).flatMap((w) => [foldForDialect(w, ask.dialect), foldForDialect(w, ask.dialect, true)]));
      const want = Math.max(0, Math.min(DECOYS[ask.difficulty], MAX_TILES - words.length));
      const decoys: string[] = [];
      // drawn one at a time: an item takes a few of the variety's words, never shuffles them all
      for (const w of draw.order(decoyWords)) {
        if (decoys.length >= want) break;
        const strict = foldForDialect(w, ask.dialect);
        const lenient = foldForDialect(w, ask.dialect, true);
        if (taken.has(strict) || taken.has(lenient)) continue;
        taken.add(strict);
        taken.add(lenient);
        decoys.push(w);
      }
      let tiles = draw.shuffle([...words, ...decoys]);
      // never hand the answer over already in order
      const places = tiles.map((t, j) => (decoys.includes(t) ? -1 : j)).filter((j) => j >= 0);
      if (places.length > 1 && places.every((p, j) => tiles[p] === words[j])) {
        // the first two of the sentence's own tiles change places (two of one word would change nothing: the next that differs)
        const other = places.find((p) => tiles[p] !== tiles[places[0]!]);
        if (other !== undefined) {
          tiles = [...tiles];
          [tiles[places[0]!], tiles[other]] = [tiles[other]!, tiles[places[0]!]!];
        }
      }
      // each word exactly as written, from the sentence's own source, or nothing
      const glosses = gameWords(s.ku).map((w) => s.glosses.get(w.normalize('NFC')) ?? null);
      const accepted = [...s.orders, ...s.accepted.filter((a) => !s.orders.includes(a))].slice(0, 12);
      return {
        key: s.key,
        level: s.level,
        repeat: seen.get(s.key)?.recent === true,
        ku: s.ku,
        meaning: s.meaning,
        orders: s.orders,
        accepted,
        tiles,
        rung: s.rung,
        glosses,
      };
    });
    return { items, meta: { rung: target, step } };
  }

  /**
   * Every word of the variety's approved sentences, one spelling each: the
   * lower-case one wherever the word is also written so, so the capital a
   * sentence starts with does not say which tile goes first (a name, never
   * written in lower case, keeps its capital).
   */
  private spellings(pool: readonly PoolSentence[], dialect: GameDialect): Map<string, string> {
    const byKey = new Map<string, string>();
    for (const s of pool) {
      for (const w of gameWords(s.ku)) {
        const key = foldForDialect(w, dialect);
        const had = byKey.get(key);
        if (!had || (had !== had.toLowerCase() && w === w.toLowerCase())) byKey.set(key, w);
      }
    }
    return byKey;
  }

  view(item: SentenceItem, index: number): SentenceItemView {
    return { index, meaning: item.meaning, tiles: item.tiles, rung: item.rung, level: item.level as GameLevel };
  }

  grade(item: SentenceItem, answer: SentenceAnswer): boolean {
    const words = laid(item, answer);
    if (!words) return false;
    return checkAnswer('translate', { prompt: item.meaning.en, accepted: item.accepted }, { text: words.join(' ') }, '').accepted;
  }

  hint(item: SentenceItem, answer: SentenceAnswer, dialect: GameDialect): SentenceHint {
    const words = laid(item, answer);
    return { firstWrong: words ? firstMisplaced(words, item.orders, dialect) : 0 };
  }

  correction(item: SentenceItem, last: SentenceAnswer | null, dialect: GameDialect): SentenceCorrection {
    const words = last ? laid(item, last) : null;
    const right = last !== null && this.grade(item, last);
    return {
      answer: item.ku,
      words: gameWords(item.ku).map((word, i) => ({ word, meanings: item.glosses[i] ?? null })),
      firstWrong: right ? null : words ? firstMisplaced(words, item.orders, dialect) : 0,
    };
  }

  why(item: SentenceItem): string {
    return item.rung;
  }

  /** A round passed well on the learner's rung, or above it, opens the next one: judged on that rung's own sentences. */
  async finished(
    client: pg.PoolClient,
    round: { userId: string; dialect: GameDialect; meta: Record<string, unknown>; items: readonly SentenceItem[]; results: SoloResults },
  ): Promise<void> {
    const played = round.meta.rung;
    if (typeof played !== 'string' || !(SENTENCE_RUNGS as readonly string[]).includes(played)) return;
    const own = rungFirstTries(
      round.results.items.map((r) => ({ rung: round.items[r.index]?.rung ?? 'short', firstTry: r.firstTry })),
      played as SentenceRung,
    );
    const before = await this.step(client, round.userId, round.dialect);
    const after = stepAfterRound(before, played as SentenceRung, own);
    if (after === before) return;
    await client.query(
      `INSERT INTO game_progress (user_id, game, dialect, step) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, game, dialect) DO UPDATE SET step = GREATEST(game_progress.step, EXCLUDED.step), updated_at = now()`,
      [round.userId, BUILD_SENTENCE, round.dialect, after],
    );
  }
}
