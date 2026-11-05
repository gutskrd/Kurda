/**
 * Hear It, Find It: a round of people's recordings, each asked about on one
 * rung of a ladder — pick how a word is written, pick what a phrase means,
 * pick how a sentence is written, and at the advanced difficulty type what
 * is heard (shared games/hear-it/rules.ts).
 *
 * Only people's recordings are played (`lesson_audio`, `alphabet_audio`'s
 * words, `dict_audio`), each with the text it was filed under, in the
 * learner's variety only; never the synthesised clips the apps ship. The same
 * text recorded more than once (another character, another person) is one
 * item with several voices, and each time a learner meets it again it is
 * played in the next voice, so a learner hears how the same words sound from
 * different people.
 *
 * Every wrong option is approved Kurdish of the same variety: for a word,
 * the approved words closest to it in spelling (edit distance, then the
 * letters they share), from the lessons' vocabulary, their sentences and the
 * other recordings; for a sentence, the approved sentences closest to it word
 * by word; for a phrase, other approved phrases' meanings. A meaning is only
 * ever one an approved source gives (a lesson's English, a story's glossary).
 *
 * The clip never travels with its text. Each item of a round gets a handle of
 * its own, random and good for that round only, and the app plays it from
 * `hearItClipPath` (games/clips.ts), which streams the recording without
 * saying what it is. The text, its meaning and who says it come back once the
 * item is done. Replays are counted by the app, by `HEAR_REPLAYS`: hearing a
 * clip again pays nothing and gives nothing away, so the server does not
 * meter it beyond the route's rate limit.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import {
  GAME_DIFFICULTIES,
  HEAR_OPTIONS,
  HEAR_REPLAYS,
  HEAR_STAGES,
  HEAR_STAGE_MIX,
  HEAR_WORDS,
  SOLO_ROUND_ITEMS,
  foldForDialect,
  gameWords,
  hearItemLevel,
  hearStagesOf,
  learnGame,
  type GameDialect,
  type GameDifficulty,
  type GameLevel,
  type HearItAnswer,
  type HearItCorrection,
  type HearItHint,
  type HearItItemView,
  type HearStage,
  type HearVerdict,
  type Meanings,
  type SpeakerId,
} from '@kurda/shared';
import { seededShuffle } from '../content/exercises.js';
import { freshestFirst, seenFor, type SeenItem } from './seen.js';
import { itemKey, type HumanRecording, type TrustedSources } from './sources.js';
import type { RoundAsk, SoloEngine, StoredItem } from './solo.js';
import { typedVerdict, wordsInPlace } from './typed.js';

export const HEAR_IT = 'hear-it' as const;

/** Where a recording's file is found: the table it is in and its key there (a dictionary pronunciation's id). */
export interface RecordingRef {
  source: 'lesson' | 'alphabet' | 'dictionary';
  id: string;
}

/** One voice saying a text: the recording, the character it is shown with, and whose voice it is. */
export interface Variant {
  ref: RecordingRef;
  speaker: SpeakerId | null;
  /** the same voice is the same character recorded by the same person */
  voice: string;
}

/** A text there is a recording of, with every voice it is recorded in. */
export interface HearText {
  key: string;
  text: string;
  words: number;
  meanings: Partial<Meanings> | null;
  variants: Variant[];
}

/** What the wrong options are drawn from, and the texts with the rungs each can stand on. */
export interface HearPool {
  texts: Array<HearText & { stages: HearStage[] }>;
  /** approved single words, by strict key, each as it is shown */
  words: Map<string, string>;
  /** approved sentences of three words or more, by strict key */
  sentences: Map<string, string>;
  /** approved phrases' meanings, by the phrase's strict key */
  meanings: Map<string, Partial<Meanings>>;
}

/** An item as a round keeps it, answer and all. */
export interface HearItem extends StoredItem {
  stage: HearStage;
  text: string;
  meanings: Partial<Meanings> | null;
  /** the handle the app plays the clip by, for this round only */
  clip: string;
  recording: RecordingRef;
  speaker: SpeakerId | null;
  newVoice: boolean;
  options: string[] | null;
  meaningOptions: Array<Partial<Meanings>> | null;
  /** the right option's place, on a picking rung */
  answer: number | null;
  replays: number;
}

const answerSchema: z.ZodType<HearItAnswer> = z.union([
  z.object({ choice: z.number().int().min(0).max(HEAR_OPTIONS - 1) }),
  z.object({ text: z.string().trim().min(1).max(300) }),
]);

const PREFIX: Record<HumanRecording['source'], string> = { lesson: 'rec:lesson:', alphabet: 'rec:alphabet:', dictionary: 'rec:dict:' };

/** Where a recording's file is, from its key in the trusted reader. */
export function recordingRef(r: Pick<HumanRecording, 'key' | 'source'>): RecordingRef {
  return { source: r.source, id: r.key.slice(PREFIX[r.source].length) };
}

/**
 * Recordings grouped by what they say (its strict key in the variety), each
 * text once with all its voices, a voice once (pure, for the tests). Texts
 * longer than a sentence a game can ask about are left out.
 */
export function groupRecordings(recordings: readonly HumanRecording[], dialect: GameDialect): HearText[] {
  const byKey = new Map<string, HearText>();
  for (const r of recordings) {
    const text = r.text.normalize('NFC').trim();
    const words = gameWords(text).length;
    if (words < 1 || words > HEAR_WORDS.sentence.max || text.length > 300) continue;
    const fold = foldForDialect(text, dialect);
    if (fold === '') continue;
    const key = itemKey('h', dialect, fold);
    const voice = `${r.speaker ?? '-'}|${r.recordedBy ?? r.key}`;
    const had = byKey.get(key) ?? { key, text, words, meanings: null, variants: [] };
    if (!had.variants.some((v) => v.voice === voice)) had.variants.push({ ref: recordingRef(r), speaker: r.speaker, voice });
    byKey.set(key, had);
  }
  return [...byKey.values()];
}

/**
 * The voice a text is played in this time: the next one after the voice it
 * was heard in last, by how many rounds it was met in; and whether that is
 * another voice than last time (pure, for the tests).
 */
export function pickVariant(variants: readonly Variant[], seen: Pick<SeenItem, 'attempts'> | undefined): { variant: Variant; newVoice: boolean } {
  const met = seen?.attempts ?? 0;
  return { variant: variants[met % variants.length]!, newVoice: met > 0 && variants.length > 1 };
}

/** The edit distance between two sequences (letters, or words). */
export function editDistance<T>(a: readonly T[], b: readonly T[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

/** Letters two words share, each counted as often as both have it. */
function sharedLetters(a: string, b: string): number {
  const counts = new Map<string, number>();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let n = 0;
  for (const ch of b) {
    const left = counts.get(ch) ?? 0;
    if (left > 0) {
      n++;
      counts.set(ch, left - 1);
    }
  }
  return n;
}

/**
 * The approved words that look most like `target`: fewest letters changed,
 * then most letters in common, then closest in length; never the word itself
 * (pure, for the tests). `words` maps each word's strict key to how it is shown.
 */
export function lookAlikeWords(target: string, words: ReadonlyMap<string, string>, n: number, seed: string, dialect: GameDialect): string[] {
  const t = foldForDialect(target, dialect);
  const tl = [...t];
  return seededShuffle([...words.entries()], `${seed}:alike`)
    .filter(([key]) => key !== t && !key.includes(' '))
    .map(([key, shown]) => {
      const k = [...key];
      return { shown, d: editDistance(tl, k), s: sharedLetters(t, key), l: Math.abs(k.length - tl.length) };
    })
    .sort((a, b) => a.d - b.d || b.s - a.s || a.l - b.l)
    .slice(0, n)
    .map((c) => c.shown);
}

/**
 * The approved sentences that look most like `target`: fewest words changed,
 * then fewest letters, within three words of its length; never the sentence
 * itself (pure, for the tests).
 */
export function lookAlikeSentences(target: string, sentences: ReadonlyMap<string, string>, n: number, seed: string, dialect: GameDialect): string[] {
  const t = foldForDialect(target, dialect);
  const tw = t.split(' ');
  // words first, over the whole pool; letters only among the closest, where they decide
  const byWords = seededShuffle([...sentences.entries()], `${seed}:alike`)
    .filter(([key]) => key !== t && Math.abs(key.split(' ').length - tw.length) <= 3)
    .map(([key, shown]) => ({ key, shown, w: editDistance(tw, key.split(' ')) }))
    .sort((a, b) => a.w - b.w)
    .slice(0, Math.max(n * 6, 24));
  return byWords
    .map((c) => ({ ...c, c: editDistance([...t], [...c.key]) }))
    .sort((a, b) => a.w - b.w || a.c - b.c)
    .slice(0, n)
    .map((c) => c.shown);
}

/** A meaning as two are told apart: its English, without case or the full stop. */
const meaningKey = (m: Partial<Meanings>): string => (m.en ?? '').trim().toLowerCase().replace(/[\s.!?…]+$/u, '');

/**
 * Meanings of other approved phrases to pick among: none the same as the
 * right one, each once, phrases about as long as the right one's first
 * (pure, for the tests).
 */
export function meaningChoices(target: Partial<Meanings>, meanings: ReadonlyMap<string, Partial<Meanings>>, n: number, seed: string): Array<Partial<Meanings>> {
  const own = meaningKey(target);
  const length = own.split(/\s+/).length;
  const seen = new Set([own]);
  const out: Array<Partial<Meanings>> = [];
  const pool = seededShuffle([...meanings.values()], `${seed}:meanings`);
  const add = (m: Partial<Meanings>, near: boolean) => {
    const key = meaningKey(m);
    if (out.length >= n || key === '' || seen.has(key) || (near && Math.abs(key.split(/\s+/).length - length) > 2)) return;
    seen.add(key);
    out.push(m);
  };
  for (const m of pool) add(m, true);
  for (const m of pool) add(m, false);
  return out;
}

/** An option as it is shown: no closing punctuation (it would tell the recording's text from a lesson's), words in lower case and sentences with a capital in Kurmancî. */
export function shownOption(text: string, stage: HearStage, dialect: GameDialect): string {
  const bare = text.normalize('NFC').trim().replace(/[\s.!?…؟,،;:]+$/u, '');
  if (dialect !== 'kmr') return bare;
  if (stage === 'word') return bare.toLocaleLowerCase('ku');
  return bare.charAt(0).toLocaleUpperCase('ku') + bare.slice(1);
}

/** The rungs a text can stand on, given what the wrong options can be drawn from. */
export function stagesFor(t: Pick<HearText, 'words' | 'meanings'>, pool: Pick<HearPool, 'words' | 'sentences' | 'meanings'>): HearStage[] {
  const within = (stage: HearStage) => t.words >= HEAR_WORDS[stage].min && t.words <= HEAR_WORDS[stage].max;
  const out: HearStage[] = [];
  if (within('word') && pool.words.size > HEAR_OPTIONS) out.push('word');
  if (within('phrase') && t.meanings?.en && pool.meanings.size > HEAR_OPTIONS) out.push('phrase');
  if (within('sentence') && pool.sentences.size > HEAR_OPTIONS) out.push('sentence');
  if (within('type')) out.push('type');
  return out;
}

/**
 * Which texts a round asks about, and on which rung: each rung of the
 * difficulty its share (`HEAR_STAGE_MIX`), never-met texts first, then
 * whatever is short made up from the difficulty's other rungs; each text once.
 * Lowest rung first, so the round climbs. Null when the pool cannot fill a
 * round (pure, for the tests).
 */
export function planRound(
  difficulty: GameDifficulty,
  texts: ReadonlyArray<HearText & { stages: HearStage[] }>,
  seen: ReadonlyMap<string, SeenItem>,
  seed: string,
): Array<{ text: HearText; stage: HearStage }> | null {
  const chosen = new Set<string>();
  const out: Array<{ text: HearText; stage: HearStage }> = [];
  const fresh = (stage: HearStage) =>
    freshestFirst(
      seededShuffle(
        texts.filter((t) => t.stages.includes(stage) && !chosen.has(t.key)),
        `${seed}:${stage}`,
      ),
      seen,
    );
  const take = (stage: HearStage, n: number) => {
    for (const t of fresh(stage)) {
      if (n <= 0 || out.length >= SOLO_ROUND_ITEMS) return;
      chosen.add(t.key);
      out.push({ text: t, stage });
      n--;
    }
  };
  for (const [stage, n] of HEAR_STAGE_MIX[difficulty]) take(stage, n);
  for (const [stage] of HEAR_STAGE_MIX[difficulty]) take(stage, SOLO_ROUND_ITEMS);
  if (out.length < SOLO_ROUND_ITEMS) return null;
  return out.sort((a, b) => HEAR_STAGES.indexOf(a.stage) - HEAR_STAGES.indexOf(b.stage));
}

export class HearItGame implements SoloEngine<HearItem, HearItItemView, HearItAnswer, HearItHint, HearItCorrection> {
  readonly game = HEAR_IT;
  readonly answer = answerSchema;

  constructor(private readonly sources: TrustedSources) {}

  /**
   * The recordings of a variety, by text, with the rungs each can stand on,
   * and the approved words, sentences and meanings the wrong options come
   * from (all read from the cached pools, so a round costs no reading).
   */
  async pool(dialect: GameDialect): Promise<HearPool> {
    const [recordings, sentences, conversations, vocabulary, stories] = await Promise.all([
      this.sources.recordings(dialect),
      this.sources.lessonSentences(dialect),
      this.sources.conversations(dialect),
      this.sources.vocabulary(dialect),
      this.sources.storyPassages(dialect),
    ]);
    // what approved texts mean, by strict key: the lessons' English, the stories' glossaries, the taught words
    const meaningOf = new Map<string, Partial<Meanings>>();
    const mean = (ku: string, m: Partial<Meanings> | null | undefined) => {
      const key = foldForDialect(ku, dialect);
      if (key !== '' && m && meaningKey(m) !== '' && !meaningOf.has(key)) meaningOf.set(key, m);
    };
    for (const s of sentences) mean(s.ku, s.meaning);
    for (const p of conversations) {
      if (p.line.en) mean(p.line.ku, { en: p.line.en });
      if (p.reply.en) mean(p.reply.ku, { en: p.reply.en });
    }
    for (const w of vocabulary) mean(w.ku, w.meanings);
    for (const s of stories) for (const g of s.glossary) mean(g.term, g.meanings);

    const texts = groupRecordings(recordings, dialect).map((t) => ({ ...t, meanings: meaningOf.get(foldForDialect(t.text, dialect)) ?? null }));

    // the words wrong options are drawn from: one spelling each, the lower-case one where there is one
    const words = new Map<string, string>();
    const word = (w: string) => {
      const key = foldForDialect(w, dialect);
      if (key === '' || key.includes(' ')) return;
      const had = words.get(key);
      if (!had || (had !== had.toLowerCase() && w === w.toLowerCase())) words.set(key, w);
    };
    for (const w of vocabulary) word(w.ku);
    for (const s of sentences) gameWords(s.ku).forEach(word);
    for (const t of texts) if (t.words === 1) word(gameWords(t.text)[0]!);

    const sentencePool = new Map<string, string>();
    const sentence = (ku: string) => {
      const key = foldForDialect(ku, dialect);
      if (key.split(' ').length >= HEAR_WORDS.sentence.min && !sentencePool.has(key)) sentencePool.set(key, ku);
    };
    for (const s of sentences) sentence(s.ku);
    for (const t of texts) sentence(t.text);

    const meanings = new Map<string, Partial<Meanings>>();
    for (const [key, m] of meaningOf) {
      const n = key.split(' ').length;
      if (n >= HEAR_WORDS.phrase.min && n <= HEAR_WORDS.sentence.max && m.en) meanings.set(key, m);
    }

    const pool = { words, sentences: sentencePool, meanings };
    return { ...pool, texts: texts.map((t) => ({ ...t, stages: stagesFor(t, pool) })).filter((t) => t.stages.length > 0) };
  }

  /**
   * What the availability count shows: the texts that can be asked about at
   * all (recordings have no levels, so every level shows the same pool), and
   * the difficulties whose rungs hold at least the game's minimum of them.
   */
  async availability(dialect: GameDialect): Promise<{ levels: Record<GameLevel, number>; difficulties: GameDifficulty[] }> {
    const { texts } = await this.pool(dialect);
    const minimum = Math.max(learnGame(HEAR_IT).minimum, SOLO_ROUND_ITEMS);
    const difficulties = GAME_DIFFICULTIES.filter((d) => {
      const stages = hearStagesOf(d);
      return texts.filter((t) => t.stages.some((s) => stages.includes(s))).length >= minimum;
    });
    const n = texts.length;
    return { levels: { 1: n, 2: n, 3: n, 4: n, 5: n }, difficulties };
  }

  async build(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: HearItem[]; meta: Record<string, unknown> } | null> {
    const [pool, seen] = await Promise.all([this.pool(ask.dialect), seenFor(db, ask.userId, HEAR_IT)]);
    const plan = planRound(ask.difficulty, pool.texts, seen, ask.seed);
    if (!plan) return null;
    const items = plan.map(({ text, stage }, i): HearItem => {
      const salt = `${ask.seed}:${i}`;
      const { variant, newVoice } = pickVariant(text.variants, seen.get(text.key));
      let options: string[] | null = null;
      let meaningOptions: Array<Partial<Meanings>> | null = null;
      let answer: number | null = null;
      if (stage === 'word' || stage === 'sentence') {
        const others =
          stage === 'word'
            ? lookAlikeWords(text.text, pool.words, HEAR_OPTIONS - 1, salt, ask.dialect)
            : lookAlikeSentences(text.text, pool.sentences, HEAR_OPTIONS - 1, salt, ask.dialect);
        const right = shownOption(text.text, stage, ask.dialect);
        options = seededShuffle([right, ...others.map((o) => shownOption(o, stage, ask.dialect))], `${salt}:options`);
        answer = options.indexOf(right);
      } else if (stage === 'phrase') {
        const right = text.meanings!;
        meaningOptions = seededShuffle([right, ...meaningChoices(right, pool.meanings, HEAR_OPTIONS - 1, salt)], `${salt}:options`);
        answer = meaningOptions.indexOf(right);
      }
      return {
        key: text.key,
        level: hearItemLevel(ask.difficulty, stage),
        repeat: seen.get(text.key)?.recent === true,
        stage,
        text: text.text,
        meanings: text.meanings,
        clip: randomBytes(16).toString('base64url'),
        recording: variant.ref,
        speaker: variant.speaker,
        newVoice,
        options,
        meaningOptions,
        answer,
        replays: HEAR_REPLAYS[ask.difficulty],
      };
    });
    return { items, meta: {} };
  }

  view(item: HearItem, index: number): HearItItemView {
    return {
      index,
      stage: item.stage,
      clip: item.clip,
      replays: item.replays,
      options: item.options,
      meanings: item.meaningOptions,
      speaker: item.speaker,
      newVoice: item.newVoice,
      level: item.level as GameLevel,
    };
  }

  private verdict(item: HearItem, answer: HearItAnswer, dialect: GameDialect): HearVerdict {
    if (item.stage === 'type') return 'text' in answer ? typedVerdict(answer.text, item.text, dialect) : 'wrong';
    return 'choice' in answer && answer.choice === item.answer ? 'right' : 'wrong';
  }

  grade(item: HearItem, answer: HearItAnswer, dialect: GameDialect): boolean {
    return this.verdict(item, answer, dialect) !== 'wrong';
  }

  hint(item: HearItem, answer: HearItAnswer, dialect: GameDialect): HearItHint {
    if ('text' in answer) return { struck: null, right: wordsInPlace(answer.text, item.text, dialect) };
    return { struck: answer.choice, right: null };
  }

  correction(item: HearItem, last: HearItAnswer | null, dialect: GameDialect): HearItCorrection {
    return {
      text: item.text,
      meanings: item.meanings,
      verdict: last ? this.verdict(item, last, dialect) : 'wrong',
      choice: item.answer,
      speaker: item.speaker,
    };
  }

  why(item: HearItem): string {
    return item.stage;
  }
}
