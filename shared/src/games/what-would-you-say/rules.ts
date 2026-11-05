/**
 * What Would You Say?: how a scenario is chosen and played, from either side.
 *
 * A scenario is a moment from a published conversation: someone says a line,
 * and the player answers it. The right reply is the line that really came
 * next; the wrong ones are real lines from other published conversations of
 * about the same level, so every option is Kurdish a person approved and
 * none was written for the game. Only the situation — where, with whom — is
 * new, and it is written in the interface languages, never in Kurdish.
 *
 * Here: how many replies each difficulty offers, when the reply is built from
 * tiles instead, the level a conversation's place in its course gives it, and
 * how an importer picks wrong replies that are clearly wrong in context — so
 * the editor who checks them has little to throw out — plus the shapes of an
 * answer, a nudge and a correction.
 */
import { foldForDialect, gameWords, type GameDialect } from '../dialect.js';
import type { GameLevel, Meanings, SpokenAudio } from '../content.js';
import type { GameDifficulty } from '../solo.js';

/** Replies to choose from, the real one among them, by difficulty (advanced builds most replies from tiles). */
export const SCENARIO_CHOICES: Readonly<Record<GameDifficulty, number>> = { beginner: 3, intermediate: 4, advanced: 4 };

/** Tiles that are not the reply's own words, at advanced level. */
export const SCENARIO_DECOYS = 3;

/** A reply is built from tiles at advanced level when it has this many words; outside it, it is chosen. */
export const SCENARIO_TILE_WORDS = { min: 2, max: 10 } as const;

/** Wrong replies an importer puts in a draft for the editor to check; a scenario keeps two to four. */
export const SCENARIO_CANDIDATES = 4;

/** Whether a reply is built from tiles: at advanced level, when it has a sensible number of words for it. */
export function buildsFromTiles(difficulty: GameDifficulty, reply: string): boolean {
  const n = gameWords(reply).length;
  return difficulty === 'advanced' && n >= SCENARIO_TILE_WORDS.min && n <= SCENARIO_TILE_WORDS.max;
}

/**
 * The level of a conversation from where its unit stands in its course: the
 * first fifth of the units is level 1, the last fifth level 5. A course is
 * written to grow harder unit by unit, so this is the course's own order.
 */
export function scenarioLevel(unitPosition: number, unitCount: number): GameLevel {
  if (!(unitCount > 0) || !(unitPosition > 0)) return 1;
  const share = Math.min(1, Math.max(0, (unitPosition - 1) / unitCount));
  return Math.min(5, Math.floor(share * 5) + 1) as GameLevel;
}

/** A line a wrong reply may be taken from: a line of some other published conversation. */
export interface ReplyCandidate {
  ku: string;
  en: string | null;
  /** the conversation it is from */
  conversation: string;
  level: number;
}

/** The pair a scenario is made of: the line heard and the line that answered it, in their conversation. */
export interface ScenarioPair {
  line: string;
  reply: string;
  conversation: string;
  level: number;
}

/**
 * Words that answer nearly anything — yes, no, thanks, fine — by variety,
 * folded leniently. A line made mostly of them would fit after too many lines
 * to be clearly wrong, so it is never offered as a wrong reply. They are only
 * compared against, never shown.
 */
const ANSWERS_ANYTHING: Readonly<Record<GameDialect, ReadonlySet<string>>> = {
  kmr: new Set(['ere', 'bele', 'na', 'naxer', 'spas', 'bas', 'temam', 'tamam', 'okey']),
  ckb: new Set(['بەلی', 'نا', 'نەخیر', 'سوپاس', 'باشە', 'باش', 'ئەری']),
};

/** The words of a line that carry its meaning, folded: three letters or more. */
function contentWords(text: string, dialect: GameDialect): Set<string> {
  return new Set(
    gameWords(text)
      .map((w) => foldForDialect(w, dialect))
      .filter((w) => [...w].length >= 3),
  );
}

/** How much of `a` is also in `b`, from 0 to 1. */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / a.size;
}

/** A small, stable hash, so the same pool picks the same lines on every machine. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Wrong replies for a pair, from other conversations' lines (pure, for the
 * importer). A line is offered only when it is clearly wrong after the line
 * heard and still a fair choice:
 *   - from another conversation, at the pair's level or one either side;
 *   - about as long as the real reply, so length gives nothing away;
 *   - sharing few of its meaningful words with the line heard or the reply,
 *     so it is no paraphrase that would fit too;
 *   - not made mostly of words that answer anything (yes, no, thanks);
 *   - no two alike, and no two from the same conversation.
 * The closest in length first, ties broken by a stable hash of the pair, so
 * an import run again picks the same ones. At most SCENARIO_CANDIDATES.
 */
export function pickWrongReplies(pair: ScenarioPair, pool: readonly ReplyCandidate[], dialect: GameDialect, max = SCENARIO_CANDIDATES): ReplyCandidate[] {
  const replyWords = gameWords(pair.reply).length;
  const heard = contentWords(pair.line, dialect);
  const real = contentWords(pair.reply, dialect);
  const fold = (s: string) => gameWords(s).map((w) => foldForDialect(w, dialect)).join(' ');
  const taken = new Set([fold(pair.line), fold(pair.reply)]);
  const generic = ANSWERS_ANYTHING[dialect];
  const slack = Math.max(2, Math.ceil(replyWords * 0.5));

  const fits = pool.filter((c) => {
    if (c.conversation === pair.conversation || Math.abs(c.level - pair.level) > 1) return false;
    const words = gameWords(c.ku);
    if (words.length < 2 || Math.abs(words.length - replyWords) > slack) return false;
    const mine = contentWords(c.ku, dialect);
    if (overlap(mine, heard) > 0.34 || overlap(mine, real) > 0.34 || overlap(real, mine) > 0.34) return false;
    const plain = words.filter((w) => !generic.has(foldForDialect(w, dialect, true))).length;
    return plain >= Math.ceil(words.length / 2);
  });
  const seed = `${fold(pair.line)}|${fold(pair.reply)}`;
  const ranked = fits
    .map((c) => ({ c, d: Math.abs(gameWords(c.ku).length - replyWords), h: hash(`${seed}|${fold(c.ku)}`) }))
    .sort((a, b) => a.d - b.d || a.h - b.h);
  const out: ReplyCandidate[] = [];
  const from = new Set<string>();
  for (const { c } of ranked) {
    if (out.length >= max) break;
    const key = fold(c.ku);
    if (taken.has(key) || from.has(c.conversation)) continue;
    taken.add(key);
    from.add(c.conversation);
    out.push(c);
  }
  return out;
}

// ---------- what travels between the server and the apps ----------

/** An answer: a reply chosen by its place among the options, or tiles laid in order by their places. */
export type ScenarioAnswer = { choice: number } | { order: number[] };

/**
 * After a wrong first try: for a choice, the option ruled out and what it
 * means (so the player sees why it does not answer), for tiles the first
 * word out of place. Never the reply itself.
 */
export interface ScenarioHint {
  ruledOut: number | null;
  meanings: Meanings | null;
  firstWrong: number | null;
}

/** Once an item is done: the line and every option with what it means and why it fits or does not. */
export interface ScenarioCorrection {
  line: { ku: string; meanings: Meanings };
  reply: { ku: string; meanings: Meanings; why: Meanings | null; audio: SpokenAudio | null };
  /** the options in the order they were shown (built from tiles: the reply, then the lines it was told from) */
  options: Array<{ ku: string; meanings: Meanings; why: Meanings | null; fits: boolean }>;
  /** the option last chosen, or null */
  chosen: number | null;
  /** built from tiles: where the last line first went astray, null when it was right */
  firstWrong: number | null;
}
