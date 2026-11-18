/**
 * The Memory Thief: a round of approved passages to study, each then losing a few words to be given back.
 *
 * Passages are published story paragraphs, a few lines at a time of published lesson conversations, and published
 * `passage` rows, in the learner's variety only. Vanishing words have a meaning the passage's own source attests: a
 * story's glossary terms, a row's hidden words, or for a conversation the words its lesson teaches. Each is matched
 * exactly as written, marks and capitals kept (tê is not te, xwe is not xwê, Baran is not baran), so the reveal's
 * meaning is the passage's own. The one forgiven capital is a sentence's first letter (mîr, Mîr); a capital elsewhere
 * marks a name. Short words (two letters or fewer) and names are never taken; a word in two places is one gap twice,
 * and a word taken from one passage is not taken from another in the round while an alternative exists.
 *
 * A story paragraph ending in a colon ("Gur got:") is read with the next one when both fit a passage. Rounds stay calm:
 * a passage with a word of killing, blood, boiling or death (`isCalmPassage`) is never used, though it stays in the
 * story.
 *
 * A round is five passages at the difficulty's levels (stories by their level, conversations by line length), unseen
 * first, at most two per story or conversation, easier first. Beginner rounds take two or three words, intermediate
 * three or four, advanced four to six (`MEMORY_HIDDEN`), and study longer the easier they are.
 *
 * Words are given back from tiles with a few decoys (other approved words not in the passage) or, at advanced, typed
 * and judged like a lesson's typed answer (`typedVerdict`). A passage is right when every gap is; a wrong first try is
 * told which gaps are wrong, never the words; once done every word returns with its meaning.
 *
 * A passage is sent whole while studied and with gaps once the player asks (`begin`, or a first answer), never both,
 * since comparing them would reveal the words; a round resumed after that never shows the passage again. Nothing in the
 * view is derived from the passage text. The pool is built once per variety and cached, and decoys are drawn one at a
 * time from one seeded generator per passage (games/draw.ts).
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
import { gradingKey } from '../content/exercises.js';
import { drawFor } from './draw.js';
import { freshestFirst, seenFor } from './seen.js';
import { itemKey, type StoryPassage, type TrustedSources } from './sources.js';
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
 * Every word of a passage once, by strict key: its first written form, its positions among the passage's words, and
 * whether it is ever capitalised away from a sentence start (a name, never taken).
 */
function wordsOf(lines: readonly string[], dialect: GameDialect): Map<string, { form: string; forms: Set<string>; at: number[]; name: boolean }> {
  const out = new Map<string, { form: string; forms: Set<string>; at: number[]; name: boolean }>();
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
        had.forms.add(p.word.normalize('NFC'));
        had.name ||= capital && !initial;
      } else out.set(key, { form: p.word, forms: new Set([p.word.normalize('NFC')]), at: [at], name: capital && !initial });
      initial = false;
      at++;
    }
  }
  return out;
}

/**
 * Whether a lower-case term is a word the passage capitalises only at sentence starts: every form is the term with its
 * first letter raised, and none stands away from a sentence start (that would be a name).
 */
function sentenceCapitalOnly(term: string, word: { forms: ReadonlySet<string>; name: boolean }): boolean {
  if (word.name || term !== term.toLowerCase()) return false;
  return [...word.forms].every((f) => f === term || f.toLowerCase() === term);
}

/**
 * The words a passage could lose, preferred first: its own glossary terms (a story's, or a row's hidden words), then
 * words its lesson teaches (`taught`, exactly as written). Each is a single word the passage holds exactly as written
 * (marks and capitals kept, except a glossary term capitalised only to start a sentence), three or more letters, not a
 * name, with a meaning (pure, for tests).
 */
export function candidatesIn(
  lines: readonly string[],
  glossary: ReadonlyArray<{ term: string; meanings: Partial<Meanings> | null | undefined }>,
  taught: ReadonlyMap<string, Partial<Meanings>>,
  dialect: GameDialect,
): Candidate[] {
  const words = wordsOf(lines, dialect);
  const out: Candidate[] = [];
  const taken = new Set<string>();
  const keep = (exact: string, meanings: Partial<Meanings> | null | undefined, from: Candidate['from']): void => {
    const key = foldForDialect(exact, dialect);
    const word = words.get(key);
    if (!word || word.name || taken.has(key) || !worthTaking(key) || !hasMeaning(meanings)) return;
    // a word the passage writes otherwise is not the word, unless the only difference is a capital a sentence start gives it
    if (!word.forms.has(exact) && !(from === 'glossary' && sentenceCapitalOnly(exact, word))) return;
    taken.add(key);
    out.push({ term: exact, meanings, from });
  };
  for (const g of glossary) {
    const w = gameWords(g.term);
    if (w.length === 1) keep(w[0]!.normalize('NFC'), g.meanings, 'glossary');
  }
  for (const word of words.values()) for (const form of word.forms) keep(form, taught.get(form), 'vocabulary');
  return out;
}

/**
 * Which words vanish: `count` candidates (fewer if not enough), glossary terms before taught words, rarer words first,
 * and none adjacent to another where avoidable, since two gaps side by side are a guess, not a memory. A word already
 * taken elsewhere in the round (`taken`, by strict key) comes last. Returned in passage order, which is the gap order
 * (pure, for tests).
 */
export function chooseHidden(
  lines: readonly string[],
  candidates: readonly Candidate[],
  count: number,
  seed: string,
  dialect: GameDialect,
  taken: ReadonlySet<string> = new Set(),
): Candidate[] {
  const words = wordsOf(lines, dialect);
  const at = (c: Candidate) => words.get(foldForDialect(c.term, dialect))?.at ?? [];
  const ranked = (['glossary', 'vocabulary'] as const).flatMap((from) =>
    drawFor(`${seed}:${from}`)
      .shuffle(candidates.filter((c) => c.from === from))
      .sort((a, b) => at(a).length - at(b).length),
  );
  const fresh = ranked.filter((c) => !taken.has(foldForDialect(c.term, dialect)));
  const again = ranked.filter((c) => taken.has(foldForDialect(c.term, dialect)));
  const chosen: Candidate[] = [];
  const near = (c: Candidate) => at(c).some((i) => chosen.some((d) => at(d).some((j) => Math.abs(i - j) <= 1)));
  for (const group of [fresh, again]) {
    for (const c of group) if (chosen.length < count && !near(c)) chosen.push(c);
    for (const c of group) if (chosen.length < count && !chosen.includes(c)) chosen.push(c);
  }
  return chosen.sort((a, b) => (at(a)[0] ?? 0) - (at(b)[0] ?? 0));
}

/**
 * The passage as the restore phase lays it out: each line opened by a marker, every place a vanished word stood a gap
 * (the same gap wherever the word stands), the rest as written (pure, for tests).
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
 * Words that keep a passage out of a round, per variety: killing, blood, boiling, death, and graves. Legends and
 * stories tell of them, but a memory game played for fun should not open on them. Each is a whole word as written (mîr,
 * a prince, is not mir, died; li gor, according to, is not gora, a grave). A few that also mean a light or fire going
 * out stay listed, since excluding one passage too many costs nothing and one too few puts a death in a child's round.
 */
export const UNCALM_WORDS: Readonly<Record<GameDialect, readonly string[]>> = {
  kmr: [
    // killing
    'kuşt',
    'kuştin',
    'kuştibû',
    'kuştî',
    'kuştina',
    'dikuşt',
    'dikuje',
    'dikujin',
    'bikuje',
    'bikujin',
    'kujer',
    'komkujî',
    'komkujiyek',
    // blood
    'xwîn',
    'xwînê',
    'xwîna',
    'xwînî',
    // boiling
    'kelandin',
    'kelandî',
    'kelî',
    'dikelînin',
    'bikelînin',
    'serjê',
    // death, the dead and their graves
    'mir',
    'mirin',
    'mirinê',
    'mirina',
    'miribû',
    'mirî',
    'dimire',
    'dimirin',
    'bimirin',
    'vemirî',
    'cendek',
    'darbest',
    'darbesta',
    'gora',
    'goran',
    'goristan',
    'goristanê',
  ],
  ckb: [
    // killing
    'کوشت',
    'کوشتن',
    'کوشتی',
    'کوشتیان',
    'کوشتاری',
    'کوژرا',
    'کوژران',
    'دەکوژێت',
    'دەیکوژن',
    'بیکوژن',
    // blood
    'خوێن',
    'خوێنی',
    'خوێنەکەی',
    'خوێناوی',
    // boiling
    'کوڵا',
    'کوڵاند',
    'کوڵاندن',
    'سەربڕین',
    // death, the dead and their graves
    'مرد',
    'مردن',
    'مردنی',
    'مردبوو',
    'مردووە',
    'مردوویت',
    'دەمرێت',
    'دەمرن',
    'مەرگ',
    'مەرگدا',
    'کوژایەوە',
    'لاشە',
    'تەرمەکەی',
    'گۆڕەکەی',
    'گۆڕەکەدا',
    'گۆڕەکەیان',
    'گۆڕستان',
    'نێژرا',
  ],
};

const uncalmKeys = new Map<GameDialect, Set<string>>();

/** Whether a passage is calm enough for a round: none of its words is one of `UNCALM_WORDS` (pure, for the tests and the decks). */
export function isCalmPassage(lines: readonly string[], dialect: GameDialect): boolean {
  let keys = uncalmKeys.get(dialect);
  if (!keys) {
    keys = new Set(UNCALM_WORDS[dialect].map((w) => foldForDialect(w, dialect)));
    uncalmKeys.set(dialect, keys);
  }
  return !lines.some((l) => gameWords(l).some((w) => keys.has(foldForDialect(w, dialect))));
}

/** A paragraph that hands over to the next one: "Gur got:". */
const INTRODUCES = /:\s*$/u;

/** A story's paragraphs as a round reads them: one passage each, or two read as one. */
export interface StoryWindow {
  storyId: string;
  title: string;
  level: number;
  /** the paragraphs it is made of, in order */
  paragraphs: number[];
  /** one line per paragraph */
  lines: string[];
  glossary: Array<{ term: string; meanings: Partial<Meanings> }>;
}

/**
 * A story's paragraphs as passages: each alone, except one ending in a colon is joined with the next when both fit a
 * passage, since an introduction belongs with its speech (pure, for tests and for the word deck, which must cut stories
 * exactly as the game does).
 */
export function storyWindows(passages: readonly StoryPassage[]): StoryWindow[] {
  const out: StoryWindow[] = [];
  for (let i = 0; i < passages.length; i++) {
    const p = passages[i]!;
    const next = passages[i + 1];
    const joins = next && next.storyId === p.storyId && next.paragraph === p.paragraph + 1 && INTRODUCES.test(p.text) && fits([p.text, next.text]);
    if (joins) {
      const known = new Set(p.glossary.map((g) => g.term));
      out.push({
        storyId: p.storyId,
        title: p.title,
        level: p.level,
        paragraphs: [p.paragraph, next.paragraph],
        lines: [p.text, next.text],
        glossary: [...p.glossary, ...next.glossary.filter((g) => !known.has(g.term))],
      });
      i++;
      continue;
    }
    out.push({ storyId: p.storyId, title: p.title, level: p.level, paragraphs: [p.paragraph], lines: [p.text], glossary: p.glossary });
  }
  return out;
}

/** Words looked at, at most, for decoys close in length to the vanished ones, before any length will do. */
const DECOYS_LOOKED_AT = 800;

/**
 * Decoy tiles for a passage: other approved words, none in the passage, none equal to a vanished word even by the
 * lenient key, close in length to the vanished words, each once (pure, for tests). Drawn one at a time, so a passage
 * looks at a few hundred words at most.
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
  // near ones first, among the first few hundred drawn; anything that fits after
  const far: string[] = [];
  let looked = 0;
  for (const w of drawFor(`${seed}:decoys`).order(words)) {
    if (near(w)) add(w);
    else far.push(w);
    if (out.length >= n || (++looked >= DECOYS_LOOKED_AT && out.length + far.length >= n * 4)) break;
  }
  for (const w of far) add(w);
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
   * Every approved passage of a variety with the words it could lose: published rows first (their hidden words are a
   * reviewer's choice), then published story paragraphs, then lesson conversations a few lines at a time. A story
   * paragraph with the same text as a row is one passage.
   */
  async pool(dialect: GameDialect): Promise<PoolPassage[]> {
    return (await this.read(dialect)).passages;
  }

  /** The pool, and every approved word a decoy may be: the words taught, and every passage's words worth taking; worked out once and kept. */
  private read(dialect: GameDialect): Promise<{ passages: PoolPassage[]; words: string[] }> {
    return this.sources.derived('memory-thief:pool', dialect, () => this.readPool(dialect));
  }

  private async readPool(dialect: GameDialect): Promise<{ passages: PoolPassage[]; words: string[] }> {
    const [rows, stories, conversations, vocabulary] = await Promise.all([
      this.sources.content('passage', dialect),
      this.sources.storyPassages(dialect),
      this.sources.conversationTexts(dialect),
      this.sources.vocabulary(dialect),
    ]);
    const none = new Map<string, Partial<Meanings>>();
    const byKey = new Map<string, PoolPassage>();
    // each passage with its own source's meanings only: a story's glossary, a row's hidden words, a conversation's own lesson
    const add = (
      p: Omit<PoolPassage, 'key' | 'candidates'>,
      glossary: ReadonlyArray<{ term: string; meanings: Partial<Meanings> | null | undefined }>,
      taught: ReadonlyMap<string, Partial<Meanings>> = none,
    ): void => {
      const texts = p.lines.map((l) => l.text);
      if (!fits(texts) || !isCalmPassage(texts, dialect)) return;
      const key = passageKey(dialect, texts);
      const candidates = candidatesIn(texts, glossary, taught, dialect);
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
    for (const s of storyWindows(stories)) {
      const level = Math.min(5, Math.max(1, s.level)) as GameLevel;
      add({ kind: 'story', source: `story:${s.storyId}`, title: s.title, lines: s.lines.map((text) => ({ text, speaker: null })), level }, s.glossary);
    }
    for (const c of conversations) {
      const taught = new Map((c.taught ?? []).map((t) => [t.word, t.meanings]));
      let from = 0;
      for (const size of conversationWindows(c.lines.length)) {
        const lines = c.lines.slice(from, from + size).map((l) => ({ text: l.ku, speaker: l.speaker }));
        from += size;
        add({ kind: 'conversation', source: c.key, title: c.title, lines, level: conversationLevel(lines.map((l) => l.text)) }, [], taught);
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
    const ordered = freshestFirst(drawFor(`${ask.seed}:pick`).shuffle(eligible), seen);
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

    // a word taken from one passage is not taken from the next while another can be
    const taken = new Set<string>();
    const items = round.map((p, i) => {
      const item = this.item(p, i, ask, decoyWords, seen.get(p.key)?.recent === true, taken);
      for (const h of item.hidden) taken.add(foldForDialect(h.term, ask.dialect));
      return item;
    });
    return { items, meta: { mode: memoryAnswerMode(ask.difficulty), begun: [] } };
  }

  /** The passages whose study has given way to their gaps. */
  private static begun(meta: Record<string, unknown>): number[] {
    return Array.isArray(meta.begun) ? meta.begun.filter((n): n is number => typeof n === 'number') : [];
  }

  begin(round: { items: MemoryItem[]; meta: Record<string, unknown> }, index: number): Record<string, unknown> | null {
    const begun = MemoryThiefGame.begun(round.meta);
    if (begun.includes(index) || !round.items[index]) return null;
    return { ...round.meta, begun: [...begun, index].sort((a, b) => a - b) };
  }

  private item(p: PoolPassage, i: number, ask: RoundAsk, decoyWords: readonly string[], repeat: boolean, taken: ReadonlySet<string>): MemoryItem {
    const { dialect, difficulty } = ask;
    const lines = p.lines.map((l) => l.text);
    const want = Math.min(MEMORY_HIDDEN[difficulty].max, p.candidates.length);
    const hidden = chooseHidden(lines, p.candidates, want, `${ask.seed}:${i}`, dialect, taken);
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
      tiles: mode === 'tiles' ? drawFor(`${ask.seed}:${i}:tiles`).shuffle([...tiles, ...decoys]) : null,
      studySeconds: studySeconds(words, difficulty),
      why: hidden.some((h) => h.from === 'glossary') ? 'glossary' : 'vocabulary',
    };
  }

  /** While it is studied, the passage whole and nothing of its gaps; once begun, its gaps and tiles and never the passage again. */
  view(item: MemoryItem, index: number, meta: Record<string, unknown>): MemoryThiefItemView {
    const restore = MemoryThiefGame.begun(meta).includes(index);
    return {
      index,
      phase: restore ? 'restore' : 'study',
      kind: item.kind,
      title: item.title,
      text: restore ? null : item.text,
      parts: restore ? item.parts : null,
      speakers: item.speakers,
      gaps: item.hidden.length,
      studySeconds: item.studySeconds,
      tiles: restore ? item.tiles : null,
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
