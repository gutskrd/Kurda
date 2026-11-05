/**
 * The Memory Thief: a round of approved passages to study, each of which then
 * loses a few of its words to the thief, to be given back.
 *
 * The passages are published stories' paragraphs, a few lines at a time of
 * published lessons' conversations, and published `passage` rows, in the
 * learner's variety only. The words that vanish are approved ones with an
 * approved meaning: a story's glossary terms first (a row's own hidden words
 * for a row), then words the published lessons teach that the passage holds.
 * Short words (two letters or fewer) and names are never taken; a word taken
 * from two places is one gap twice.
 *
 * A round is five passages at the difficulty's levels (stories by their own
 * level, conversations by how long their lines are), never-met passages
 * first and no more than two from one story or conversation, the easier ones
 * first. Beginner rounds take two or three words, intermediate three or four,
 * advanced four to six (`MEMORY_HIDDEN`), and study longer the easier they are.
 *
 * Words are given back from tiles with a few decoys — other approved words
 * the passage does not hold — or, at the advanced difficulty, typed with the
 * key bar and taken as a lesson takes a typed answer (`typedVerdict`). A
 * passage is right when every gap is; a wrong first try is told which gaps
 * are still wrong, never the words; once a passage is done every word comes
 * back with what it means.
 */
import type pg from 'pg';
import { z } from 'zod';
import {
  DIFFICULTY_LEVELS,
  MEMORY_CONVERSATION_LINES,
  MEMORY_DECOYS,
  MEMORY_HIDDEN,
  MEMORY_PASSAGE_WORDS,
  MEMORY_ROUND_PASSAGES,
  PASSAGE_HIDDEN,
  difficultyOfLevel,
  foldForDialect,
  gameWords,
  memoryAnswerMode,
  sameInDialect,
  studySeconds,
  type GameDialect,
  type GameDifficulty,
  type GameLevel,
  type Meanings,
  type MemoryPart,
  type MemoryThiefAnswer,
  type MemoryThiefCorrection,
  type MemoryThiefHint,
  type MemoryThiefItemView,
  type MemoryVerdict,
  type MemoryWhy,
  type SpeakerId,
} from '@kurda/shared';
import { gradingKey, seededShuffle } from '../content/exercises.js';
import { freshestFirst, seenFor } from './seen.js';
import { itemKey, type TrustedSources } from './sources.js';
import type { RoundAsk, SoloEngine, StoredItem } from './solo.js';
import { typedVerdict } from './typed.js';

export const MEMORY_THIEF = 'memory-thief' as const;

/** A word a passage could lose: as it is written there, what it means, and which approved source says so. */
export interface Candidate {
  term: string;
  meanings: Partial<Meanings>;
  from: 'glossary' | 'vocabulary';
}

/** A passage a round can use. */
export interface PoolPassage {
  /** stable for the passage's text, wherever it was read */
  key: string;
  kind: 'story' | 'conversation';
  /** the story or conversation it is part of: a round takes no more than two passages of one */
  source: string;
  title: string | null;
  lines: Array<{ text: string; speaker: SpeakerId | null }>;
  level: GameLevel;
  /** the words it could lose, in the order they are preferred */
  candidates: Candidate[];
}

/** A passage as a round keeps it, answers and all. */
export interface MemoryItem extends StoredItem {
  kind: 'story' | 'conversation';
  title: string | null;
  text: string;
  speakers: Array<SpeakerId | null>;
  parts: MemoryPart[];
  /** the vanished words, by gap: as written in the passage, the tile it is given back from, and what it means */
  hidden: Array<{ term: string; tile: string; meanings: Partial<Meanings> | null; from: 'glossary' | 'vocabulary' }>;
  tiles: string[] | null;
  studySeconds: number;
  why: MemoryWhy;
}

const answerSchema: z.ZodType<MemoryThiefAnswer> = z.object({ gaps: z.array(z.string().max(80)).min(1).max(PASSAGE_HIDDEN.max) });

const hasMeaning = (m: Partial<Meanings> | null | undefined): m is Partial<Meanings> =>
  !!m && Object.values(m).some((v) => typeof v === 'string' && v.trim() !== '');

/** A word long enough to be worth taking: "ez", "li" and "û" are not. */
const worthTaking = (folded: string): boolean => [...folded.replace(/\s/g, '')].length >= 3;

// ---------- reading a passage ----------

/** A line as pieces: words (`word` set, as gameWords reads them) and what lies between them, in order. */
export function pieces(line: string): Array<{ text: string; word: string | null }> {
  const out: Array<{ text: string; word: string | null }> = [];
  for (const chunk of line.normalize('NFC').split(/(\s+)/u)) {
    if (chunk === '') continue;
    if (/^\s+$/u.test(chunk)) {
      out.push({ text: chunk, word: null });
      continue;
    }
    const lead = /^[^\p{L}\p{N}]+/u.exec(chunk)?.[0] ?? '';
    const rest = chunk.slice(lead.length);
    const trail = /[^\p{L}\p{N}]+$/u.exec(rest)?.[0] ?? '';
    const core = rest.slice(0, rest.length - trail.length);
    if (lead) out.push({ text: lead, word: null });
    if (core) out.push({ text: core, word: core });
    if (trail) out.push({ text: trail, word: null });
  }
  return out;
}

const SENTENCE_END = /[.!?…؟]\s*$/u;

/**
 * Every word of a passage once, by its strict key: as first written, where
 * it stands (its places among the passage's words), and whether it is ever
 * written with a capital where no sentence starts — a name, which is never
 * taken.
 */
function wordsOf(lines: readonly string[], dialect: GameDialect): Map<string, { form: string; at: number[]; name: boolean }> {
  const out = new Map<string, { form: string; at: number[]; name: boolean }>();
  let at = 0;
  for (const line of lines) {
    let initial = true;
    for (const p of pieces(line)) {
      if (p.word === null) {
        if (SENTENCE_END.test(p.text)) initial = true;
        continue;
      }
      const key = foldForDialect(p.word, dialect);
      const capital = p.word[0] !== p.word[0]!.toLowerCase();
      const had = out.get(key);
      if (had) {
        had.at.push(at);
        had.name ||= capital && !initial;
      } else out.set(key, { form: p.word, at: [at], name: capital && !initial });
      initial = false;
      at++;
    }
  }
  return out;
}

/**
 * The words a passage could lose, preferred first: its glossary terms (a
 * story's, or a row's own hidden words), then the words published lessons
 * teach that it holds. Each is a single word the passage has as written, at
 * least three letters long, not a name, with a meaning (pure, for the tests).
 */
export function candidatesIn(
  lines: readonly string[],
  glossary: ReadonlyArray<{ term: string; meanings: Partial<Meanings> | null | undefined }>,
  lexicon: ReadonlyMap<string, Partial<Meanings>>,
  dialect: GameDialect,
): Candidate[] {
  const words = wordsOf(lines, dialect);
  const out: Candidate[] = [];
  const taken = new Set<string>();
  const keep = (key: string, meanings: Partial<Meanings> | null | undefined, from: Candidate['from']): void => {
    const word = words.get(key);
    if (!word || word.name || taken.has(key) || !worthTaking(key) || !hasMeaning(meanings)) return;
    taken.add(key);
    out.push({ term: word.form, meanings, from });
  };
  for (const g of glossary) {
    const w = gameWords(g.term);
    if (w.length === 1) keep(foldForDialect(w[0]!, dialect), g.meanings, 'glossary');
  }
  for (const key of words.keys()) keep(key, lexicon.get(key), 'vocabulary');
  return out;
}

/**
 * Which words vanish: `count` of the candidates (fewer when there are not
 * that many), glossary terms before taught words, a word met once before one
 * met twice, and none right beside another where that can be helped — two
 * gaps side by side are a guess, not a memory. Returned in the order they
 * stand in the passage, which is their gaps' order (pure, for the tests).
 */
export function chooseHidden(
  lines: readonly string[],
  candidates: readonly Candidate[],
  count: number,
  seed: string,
  dialect: GameDialect,
): Candidate[] {
  const words = wordsOf(lines, dialect);
  const at = (c: Candidate) => words.get(foldForDialect(c.term, dialect))?.at ?? [];
  const ranked = (['glossary', 'vocabulary'] as const).flatMap((from) =>
    seededShuffle(
      candidates.filter((c) => c.from === from),
      `${seed}:${from}`,
    ).sort((a, b) => at(a).length - at(b).length),
  );
  const chosen: Candidate[] = [];
  const near = (c: Candidate) => at(c).some((i) => chosen.some((d) => at(d).some((j) => Math.abs(i - j) <= 1)));
  for (const c of ranked) if (chosen.length < count && !near(c)) chosen.push(c);
  for (const c of ranked) if (chosen.length < count && !chosen.includes(c)) chosen.push(c);
  return chosen.sort((a, b) => (at(a)[0] ?? 0) - (at(b)[0] ?? 0));
}

/**
 * The passage as the restore phase lays it out: each line opened by a line
 * marker, every place a vanished word stood a gap (the same gap wherever the
 * word stands), the rest as it is written (pure, for the tests).
 */
export function passageParts(lines: readonly string[], hidden: readonly string[], dialect: GameDialect): MemoryPart[] {
  const gapOf = new Map(hidden.map((term, i) => [foldForDialect(term, dialect), i]));
  const out: MemoryPart[] = [];
  const text = (t: string): void => {
    const last = out.at(-1);
    if (last && 'text' in last) last.text += t;
    else out.push({ text: t });
  };
  lines.forEach((line, n) => {
    out.push({ line: n });
    for (const p of pieces(line)) {
      const gap = p.word === null ? undefined : gapOf.get(foldForDialect(p.word, dialect));
      if (gap === undefined) text(p.text);
      else out.push({ gap });
    }
  });
  return out;
}

/** How a conversation of `n` lines is cut into passages: as many of three or four lines as fit, none shorter. */
export function conversationWindows(n: number): number[] {
  const count = Math.floor(n / MEMORY_CONVERSATION_LINES.min);
  if (count === 0) return [];
  const base = Math.floor(n / count);
  return Array.from({ length: count }, (_, i) => base + (i < n % count ? 1 : 0));
}

/** A conversation passage's level, from how long its lines are: short lines are the first lessons'. */
export function conversationLevel(lines: readonly string[]): GameLevel {
  const words = lines.reduce((sum, l) => sum + gameWords(l).length, 0) / Math.max(1, lines.length);
  return words <= 5 ? 1 : words <= 7 ? 2 : words <= 9 ? 3 : words <= 12 ? 4 : 5;
}

/** A passage's key, by its Kurdish as grading reads it: the same text is the same passage, from a story or a row. */
export function passageKey(dialect: GameDialect, lines: readonly string[]): string {
  return itemKey('mt', dialect, gradingKey(lines.join('\n')));
}

const fits = (lines: readonly string[]): boolean => {
  const n = lines.reduce((sum, l) => sum + gameWords(l).length, 0);
  return n >= MEMORY_PASSAGE_WORDS.min && n <= MEMORY_PASSAGE_WORDS.max;
};

/**
 * Decoy tiles for a passage: other approved words, none the passage holds,
 * none the same as a vanished word even by the lenient key, close in length
 * to the vanished words, each once (pure, for the tests).
 */
export function chooseDecoys(
  hidden: readonly string[],
  words: readonly string[],
  inPassage: ReadonlySet<string>,
  n: number,
  seed: string,
  dialect: GameDialect,
): string[] {
  if (n <= 0) return [];
  const lenient = new Set(hidden.map((h) => foldForDialect(h, dialect, true)));
  const lengths = hidden.map((h) => [...h].length);
  const span = { min: Math.min(...lengths) - 2, max: Math.max(...lengths) + 2 };
  const ok = (w: string) => !inPassage.has(foldForDialect(w, dialect)) && !lenient.has(foldForDialect(w, dialect, true)) && worthTaking(foldForDialect(w, dialect));
  const near = (w: string) => [...w].length >= span.min && [...w].length <= span.max;
  const out: string[] = [];
  const add = (w: string) => {
    if (out.length >= n || !ok(w)) return;
    lenient.add(foldForDialect(w, dialect, true));
    out.push(w);
  };
  const shuffled = seededShuffle(words, `${seed}:decoys`);
  for (const w of shuffled) if (near(w)) add(w);
  for (const w of shuffled) add(w);
  return out;
}

/** A tile's spelling: a word that only has its capital because a sentence starts with it is given back in lower case. */
function tileOf(term: string, dialect: GameDialect): string {
  return dialect === 'kmr' ? term.toLocaleLowerCase('ku') : term;
}

// ---------- the game ----------

export class MemoryThiefGame implements SoloEngine<MemoryItem, MemoryThiefItemView, MemoryThiefAnswer, MemoryThiefHint, MemoryThiefCorrection> {
  readonly game = MEMORY_THIEF;
  readonly answer = answerSchema;

  constructor(private readonly sources: TrustedSources) {}

  /**
   * Every approved passage of a variety, with the words it could lose: the
   * published rows first (a row's hidden words are a reviewer's choice), then
   * published stories' paragraphs, then lesson conversations a few lines at
   * a time. A story paragraph with the same text as a row is one passage.
   */
  async pool(dialect: GameDialect): Promise<PoolPassage[]> {
    return (await this.read(dialect)).passages;
  }

  /** The pool, and every approved word a decoy may be: the words taught, and every passage's words worth taking. */
  private async read(dialect: GameDialect): Promise<{ passages: PoolPassage[]; words: string[] }> {
    const [rows, stories, conversations, vocabulary] = await Promise.all([
      this.sources.content('passage', dialect),
      this.sources.storyPassages(dialect),
      this.sources.conversationTexts(dialect),
      this.sources.vocabulary(dialect),
    ]);
    const lexicon = new Map<string, Partial<Meanings>>();
    for (const w of vocabulary) {
      const key = foldForDialect(w.ku, dialect);
      if (!lexicon.has(key)) lexicon.set(key, w.meanings);
    }
    const byKey = new Map<string, PoolPassage>();
    const add = (p: Omit<PoolPassage, 'key' | 'candidates'>, glossary: ReadonlyArray<{ term: string; meanings: Partial<Meanings> | null | undefined }>): void => {
      const texts = p.lines.map((l) => l.text);
      if (!fits(texts)) return;
      const key = passageKey(dialect, texts);
      const candidates = candidatesIn(texts, glossary, lexicon, dialect);
      const had = byKey.get(key);
      if (had) {
        // the same text read twice: a row's choice of words first, then anything the story adds
        const known = new Set(had.candidates.map((c) => foldForDialect(c.term, dialect)));
        had.candidates.push(...candidates.filter((c) => !known.has(foldForDialect(c.term, dialect))));
        return;
      }
      byKey.set(key, { ...p, key, candidates });
    };
    for (const row of rows) {
      const lines = row.payload.text.split(/\n+/u).map((l) => l.trim()).filter((l) => l !== '');
      const kind = row.payload.origin?.type === 'conversation' ? 'conversation' : 'story';
      add(
        { kind, source: `gc:${row.id}`, title: row.payload.title ?? null, lines: lines.map((text) => ({ text, speaker: null })), level: row.level as GameLevel },
        row.payload.hidden,
      );
    }
    for (const s of stories) {
      const level = Math.min(5, Math.max(1, s.level)) as GameLevel;
      add({ kind: 'story', source: `story:${s.storyId}`, title: s.title, lines: [{ text: s.text, speaker: null }], level }, s.glossary);
    }
    for (const c of conversations) {
      let from = 0;
      for (const size of conversationWindows(c.lines.length)) {
        const lines = c.lines.slice(from, from + size).map((l) => ({ text: l.ku, speaker: l.speaker }));
        from += size;
        add({ kind: 'conversation', source: c.key, title: c.title, lines, level: conversationLevel(lines.map((l) => l.text)) }, []);
      }
    }
    const passages = [...byKey.values()];
    const words = new Map<string, string>();
    for (const term of [...passages.flatMap((p) => p.candidates.map((c) => c.term)), ...vocabulary.map((w) => w.ku)]) {
      const key = foldForDialect(term, dialect);
      if (!words.has(key)) words.set(key, tileOf(term, dialect));
    }
    return { passages, words: [...words.values()] };
  }

  /** Whether a passage can be played at a difficulty: one of its levels, with enough words to take. */
  private static playable(p: PoolPassage, difficulty: GameDifficulty): boolean {
    return DIFFICULTY_LEVELS[difficulty].includes(p.level) && p.candidates.length >= MEMORY_HIDDEN[difficulty].min;
  }

  /** How many passages each level can be played with, for the availability count. */
  async levels(dialect: GameDialect): Promise<Record<GameLevel, number>> {
    const out: Record<GameLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const p of await this.pool(dialect)) if (MemoryThiefGame.playable(p, difficultyOfLevel(p.level))) out[p.level]++;
    return out;
  }

  async build(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: MemoryItem[]; meta: Record<string, unknown> } | null> {
    const [{ passages: pool, words: decoyWords }, seen] = await Promise.all([this.read(ask.dialect), seenFor(db, ask.userId, MEMORY_THIEF)]);
    const eligible = pool.filter((p) => MemoryThiefGame.playable(p, ask.difficulty));
    if (eligible.length < MEMORY_ROUND_PASSAGES) return null;
    const ordered = freshestFirst(seededShuffle(eligible, `${ask.seed}:pick`), seen);
    const round: PoolPassage[] = [];
    const per = new Map<string, number>();
    for (const p of ordered) {
      if (round.length >= MEMORY_ROUND_PASSAGES) break;
      if ((per.get(p.source) ?? 0) >= 2) continue;
      per.set(p.source, (per.get(p.source) ?? 0) + 1);
      round.push(p);
    }
    for (const p of ordered) if (round.length < MEMORY_ROUND_PASSAGES && !round.includes(p)) round.push(p);
    // a round starts with its easier passages
    round.sort((a, b) => a.level - b.level);

    const items = round.map((p, i) => this.item(p, i, ask, decoyWords, seen.get(p.key)?.recent === true));
    return { items, meta: { mode: memoryAnswerMode(ask.difficulty) } };
  }

  private item(p: PoolPassage, i: number, ask: RoundAsk, decoyWords: readonly string[], repeat: boolean): MemoryItem {
    const { dialect, difficulty } = ask;
    const lines = p.lines.map((l) => l.text);
    const want = Math.min(MEMORY_HIDDEN[difficulty].max, p.candidates.length);
    const hidden = chooseHidden(lines, p.candidates, want, `${ask.seed}:${i}`, dialect);
    const tiles = hidden.map((h) => tileOf(h.term, dialect));
    const inPassage = new Set(lines.flatMap((l) => gameWords(l)).map((w) => foldForDialect(w, dialect)));
    const mode = memoryAnswerMode(difficulty);
    const decoys = mode === 'tiles' ? chooseDecoys(tiles, decoyWords, inPassage, MEMORY_DECOYS[difficulty], `${ask.seed}:${i}`, dialect) : [];
    const words = lines.reduce((sum, l) => sum + gameWords(l).length, 0);
    return {
      key: p.key,
      level: p.level,
      repeat,
      kind: p.kind,
      title: p.title,
      text: lines.join('\n'),
      speakers: p.lines.map((l) => l.speaker),
      parts: passageParts(
        lines,
        hidden.map((h) => h.term),
        dialect,
      ),
      hidden: hidden.map((h, n) => ({ term: h.term, tile: tiles[n]!, meanings: h.meanings, from: h.from })),
      tiles: mode === 'tiles' ? seededShuffle([...tiles, ...decoys], `${ask.seed}:${i}:tiles`) : null,
      studySeconds: studySeconds(words, difficulty),
      why: hidden.some((h) => h.from === 'glossary') ? 'glossary' : 'vocabulary',
    };
  }

  view(item: MemoryItem, index: number): MemoryThiefItemView {
    return {
      index,
      key: item.key,
      kind: item.kind,
      title: item.title,
      parts: item.parts,
      text: item.text,
      speakers: item.speakers,
      gaps: item.hidden.length,
      studySeconds: item.studySeconds,
      tiles: item.tiles,
      level: item.level as GameLevel,
    };
  }

  /** How each gap's word was given back: from tiles it is the word or not; typed, a slip of a mark is a typo. */
  verdicts(item: MemoryItem, answer: MemoryThiefAnswer, dialect: GameDialect): MemoryVerdict[] {
    return item.hidden.map((h, n) => {
      const given = answer.gaps[n] ?? '';
      if (item.tiles) return sameInDialect(given, h.term, dialect) ? 'right' : 'wrong';
      return typedVerdict(given, h.term, dialect);
    });
  }

  grade(item: MemoryItem, answer: MemoryThiefAnswer, dialect: GameDialect): boolean {
    return this.verdicts(item, answer, dialect).every((v) => v !== 'wrong');
  }

  hint(item: MemoryItem, answer: MemoryThiefAnswer, dialect: GameDialect): MemoryThiefHint {
    return { wrong: this.verdicts(item, answer, dialect).flatMap((v, n) => (v === 'wrong' ? [n] : [])) };
  }

  correction(item: MemoryItem, last: MemoryThiefAnswer | null, dialect: GameDialect): MemoryThiefCorrection {
    const verdicts = last ? this.verdicts(item, last, dialect) : null;
    return {
      words: item.hidden.map((h, n) => ({
        gap: n,
        term: h.term,
        meanings: h.meanings,
        given: last ? (last.gaps[n] ?? '') : null,
        verdict: verdicts?.[n] ?? 'wrong',
      })),
    };
  }

  why(item: MemoryItem): string {
    return item.why;
  }
}
