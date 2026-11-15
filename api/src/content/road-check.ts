import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  ASKS_BY_TYPE,
  CONVERSATION_ID,
  GAP,
  WORD_PICTURES,
  conversationClips,
  lessonAudioKey,
  lessonAudioTargets,
  roadStoryChapter,
  shownInPrompt,
  storyParagraphs,
  type ExerciseAsk,
} from '@kurda/shared';
import { InvalidExercisePayloadError, validateExercisePayload } from './exercises.js';
import { courseContentSchema } from './import.js';
import type { ExerciseType } from './repository.js';

/**
 * The check for The Kurmanji Road (api/content/lessons/road): the plan, and
 * every unit file written against it.
 *
 * The road is 192 lessons written by several hands over many sessions, and
 * what makes it a course rather than a pile of exercises is that each lesson
 * only uses Kurdish the learner has already met, meets its own new words
 * often enough to learn them, and is recorded mostly by Hamo. None of that
 * can be seen by reading one lesson, so it is checked here, in CI and from
 * the command line (scripts/road-check.ts), with every problem located by
 * unit, lesson, exercise and field so a writer can go straight to it.
 *
 * Exercise `voice` is read from the raw JSON: the payload schemas do not
 * carry it yet, and a parsed payload would have lost it.
 */

export const ROAD_DIR = new URL('../../content/lessons/road/', import.meta.url);
export const ROAD_PLAN_FILE = new URL('plan.json', ROAD_DIR);

export function roadUnitFile(unit: number): URL {
  return new URL(`unit-${String(unit).padStart(2, '0')}.json`, ROAD_DIR);
}

export const ROAD_COURSE = { slug: 'kurmanji-road', dialect: 'kurmanji', titleKu: 'Rêya Kurmancî', titleEn: 'The Kurmanji Road' } as const;
export const ROAD_VOICES = ['hamo', 'xezo', 'hevalo'] as const;
export type RoadVoice = (typeof ROAD_VOICES)[number];
/**
 * Who records the road: Hamo, every line of it, so one person can finish a
 * chapter and see it go online (road-chapters.ts). Xezal and Hevalo still
 * take part — in the scenes, in what Hamo tells, in what Xezal writes — but
 * whatever is heard is Hamo, and a conversation is Hamo talking with the
 * learner, whose own lines nobody records.
 */
export const ROAD_RECORDER: RoadVoice = 'hamo';

/**
 * A line that calls Hamo by name, or calls him uncle, as someone talking to
 * him would: “Spas, Hamo!”, “Xalo, tu baş î?”. Hamo cannot record it — he
 * would be talking to himself — so a line he models for the learner to say
 * back to him leaves the name out, and one only the learner says is theirs.
 */
export function addressesHamo(text: string): boolean {
  return /(^|[,.!?…:;«“]\s*)(hamo|xalo|apo)\s*([,.!?…;»”]|$)/iu.test(text.trim());
}
export const ROAD_FOCUS = ['meet', 'build', 'talk', 'review'] as const;
export type RoadFocus = (typeof ROAD_FOCUS)[number];

export interface RoadItem {
  ku: string;
  en: string;
  pos: string;
  gender?: string;
  /** every lower-case spelling the course uses for the item */
  forms: string[];
}

export interface RoadLesson {
  key: string;
  position: number;
  titleKu: string;
  titleEn: string;
  focus: RoadFocus;
  beat: string;
  voice: RoadVoice;
  new: RoadItem[];
}

export interface RoadSkill {
  position: number;
  titleKu: string;
  titleEn: string;
  grammar: string;
  grammarMd: string;
  lessons: RoadLesson[];
}

export interface RoadUnit {
  number: number;
  cefr: string;
  titleKu: string;
  titleEn: string;
  story: string;
  /**
   * `hamo` once the chapter is written for Hamo alone (`ROAD_RECORDER`): then
   * every line in it is his and no line has him talk to himself. A chapter
   * not rewritten yet keeps the older split of its recordings between the
   * characters, until it is.
   */
  recorder?: RoadVoice;
  skills: RoadSkill[];
}

export interface RoadPlan {
  course: { slug: string; dialect: string; titleKu: string; titleEn: string };
  characters: Record<RoadVoice, string>;
  core: string[];
  names: Array<{ name: string; kind: string; en: string; forms: string[] }>;
  units: RoadUnit[];
  doubts: Array<{ ku: string; reason: string }>;
}

export interface RoadProblem {
  unit?: number;
  /** the lesson key, uNNsNlN */
  lesson?: string;
  /** the exercise's position in its lesson */
  exercise?: number;
  /** where in the exercise or document, e.g. payload.accepted[0] */
  field?: string;
  message: string;
}

export interface RoadStats {
  /** the unit files checked */
  units: number[];
  lessons: number;
  exercises: number;
  /** at fifteen seconds an exercise */
  minutes: number;
  /** the plan’s new items in the units checked */
  newItems: number;
  /** distinct single-sentence recordings, by the voice of their first use */
  recordings: Record<RoadVoice | 'unvoiced', number>;
  /** conversation lines to record, by the character who says them */
  conversationLines: Record<RoadVoice, number>;
}

export interface RoadCheck {
  problems: RoadProblem[];
  stats: RoadStats;
}

export function formatProblem(p: RoadProblem): string {
  const where = [p.lesson ?? (p.unit !== undefined ? `unit ${p.unit}` : 'plan'), p.exercise !== undefined ? `#${p.exercise}` : '', p.field ?? '']
    .filter(Boolean)
    .join(' ');
  return `${where}: ${p.message}`;
}

// ---------- what the road never says ----------

/*
 * The road is written for whole families across the Kurdish and wider Middle Eastern world, and a line that one
 * family hears as warm another can hear as something else. Two things are held out of every line, in Kurdish and in
 * English alike: talk of what a character is not as a man or a woman, and any tie between Hamo and Xezal beyond
 * neighbours in one village. He never calls her his friend, his daughter or niece, his wife or his love, and the
 * course never has him say it about her. Each pattern looks within one sentence.
 */
const NEITHER_MAN_NOR_WOMAN: readonly RegExp[] = [
  /\bne\s+mêr\b[^.!?]*\bne\s+jin\b/i,
  /\bne\s+jin\b[^.!?]*\bne\s+mêr\b/i,
  /\bneither\s+(a\s+)?(man|woman|boy|girl)\b[^.!?]*\bnor\b/i,
];
const XEZAL = String.raw`\bxez(o|al|alê)\b`;
const TIES_KU = String.raw`\b(hevala|hevalê|keça|xwarziya|jina|dergistiya|evîndara|yara)\s+(min|te|wî)\b`;
const TIES_EN = String.raw`\b(my|his)\s+(friend|best\s+friend|girlfriend|daughter|niece|wife|fiancée|love|sweetheart)\b`;
const TIED_TO_XEZAL: readonly RegExp[] = [
  new RegExp(`${XEZAL}[^.!?]*${TIES_KU}`, 'i'),
  new RegExp(`${TIES_KU}[^.!?]*${XEZAL}`, 'i'),
  new RegExp(`${XEZAL}[^.!?]*${TIES_EN}`, 'i'),
  new RegExp(`${TIES_EN}[^.!?]*${XEZAL}`, 'i'),
];

/** Every string in a document, however deep, with where it sits. */
function textsIn(v: unknown, path = ''): Array<{ path: string; text: string }> {
  if (typeof v === 'string') return [{ path, text: v }];
  if (Array.isArray(v)) return v.flatMap((x, i) => textsIn(x, `${path}[${i}]`));
  if (isRecord(v)) return Object.entries(v).flatMap(([k, x]) => textsIn(x, path ? `${path}.${k}` : k));
  return [];
}

/** What a text says that the road never says, one message for each kind found. */
export function familyProblems(text: string): string[] {
  const out: string[] = [];
  if (NEITHER_MAN_NOR_WOMAN.some((re) => re.test(text))) out.push('says what a character is not as a man or a woman: the road never talks about that');
  if (TIED_TO_XEZAL.some((re) => re.test(text))) out.push('ties Xezal to Hamo as friend, family or more: they are neighbours in the village, nothing else');
  return out;
}

// ---------- Kurdish text ----------

/** What a Kurdish field may contain: the Hawar letters, digits, spaces and the punctuation the course writes. */
const HAWAR_TEXT = /^[A-Za-zÇçÊêÎîŞşÛû0-9 .,!?:;«»“”'\-…]*$/;
const HAWAR_FORM = /^[a-zçêîşû]+$/;
/** Letters that look Kurdish but belong to other alphabets, named so the fix is obvious. */
const LOOKALIKES: Record<string, string> = { ı: 'dotless ı', İ: 'dotted İ', ğ: 'ğ', Ğ: 'Ğ', ö: 'ö', Ö: 'Ö', ü: 'ü', Ü: 'Ü', ä: 'ä', Ä: 'Ä' };
const ARABIC = /[؀-ۿݐ-ݿ]/;

/** The words of a Kurdish text, lower case, as the lexicon is written: letters and digits, nothing else. */
export function kurdishWords(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^a-zçêîşû0-9]+/)
    .filter(Boolean);
}

function orthographyProblems(text: string, sentence: boolean): string[] {
  const out: string[] = [];
  const t = text.normalize('NFC');
  if (!HAWAR_TEXT.test(t)) {
    const bad = new Set<string>();
    for (const ch of t) if (!HAWAR_TEXT.test(ch)) bad.add(ch);
    for (const ch of bad) {
      if (LOOKALIKES[ch]) out.push(`“${ch}” (${LOOKALIKES[ch]}) is not a Hawar letter`);
      else if (ARABIC.test(ch)) out.push('Arabic script in a Kurmancî field');
      else out.push(`character “${ch}” (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in Kurmancî text`);
    }
  }
  if (/ {2}/.test(t)) out.push('doubled space');
  if (t !== t.trim()) out.push('space at the start or end');
  if (sentence) {
    // each sentence: the start of the text, and every start after . ! ? and a space
    const starts = [t, ...t.split(/[.!?]\s+/).slice(1)];
    for (const s of starts) {
      const first = s.match(/[A-Za-zÇçÊêÎîŞşÛû]/)?.[0];
      if (first && first === first.toLowerCase()) {
        out.push(`a sentence starts with a capital: “${s.slice(0, 24)}”`);
        break;
      }
    }
  }
  return out;
}

/** A text is a sentence (and so starts with a capital) when it ends like one; single words and bare phrases need not. */
function isSentence(text: string): boolean {
  return /[.!?…]["”»']*$/.test(text.trim());
}

function sentenceLengths(text: string): number[] {
  return text
    .split(/[.!?…]+/)
    .map((s) => kurdishWords(s).length)
    .filter((n) => n > 0);
}

// ---------- recordings ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * What an exercise asks to have recorded. The same as `lessonAudioTargets`,
 * with the rule the platform is moving to: a translate with `say` goes from
 * Kurdish to English, so only `say` is Kurdish and only `say` is recorded.
 * (A multiple-choice item’s targets are exactly its `say`, which is why it
 * stands in for that case here.)
 */
export function recordedTexts(type: string, payload: unknown): string[] {
  if (type === 'conversation') return [];
  if (type === 'translate') {
    const said = lessonAudioTargets('multiple_choice', payload);
    if (said.length > 0) return said;
  }
  return lessonAudioTargets(type, payload);
}

// ---------- the plan’s lexicon ----------

interface LessonEntry {
  unit: RoadUnit;
  skill: RoadSkill;
  lesson: RoadLesson;
  /** 1-based place in the whole course */
  index: number;
}

interface ItemEntry {
  item: RoadItem;
  lesson: string;
  index: number;
}

interface Lexicon {
  lessons: LessonEntry[];
  byKey: Map<string, LessonEntry>;
  /** the first lesson a word may be used in; 0 for core words and names */
  firstUse: Map<string, number>;
  items: ItemEntry[];
  /** words that show an item is being used, to the items they show */
  signs: Map<string, number[]>;
}

const lexicons = new WeakMap<RoadPlan, Lexicon>();

/**
 * The words that show an item is in a sentence. A single word is shown by any
 * of its forms, and so is an item written as alternatives (“im / me”,
 * “meke / mekin”), which is one word in its spellings. A phrase is shown by
 * the forms it brings that nothing before
 * it did — “hez kirin” by hez, not by kirin, which every other sentence has —
 * and not by forms it shares with another item of its own lesson, so two
 * phrases built on the same word are not each counted for the other.
 */
function signsOf(entry: ItemEntry, knownBefore: (w: string) => boolean, sameLesson: Set<string>, core: Set<string>): string[] {
  const { item } = entry;
  if (kurdishWords(item.ku).length <= 1 || item.ku.includes('/')) return item.forms;
  const fresh = item.forms.filter((f) => !knownBefore(f));
  const own = fresh.filter((f) => !sameLesson.has(f));
  if (own.length > 0) return own;
  if (fresh.length > 0) return fresh;
  const notCore = item.forms.filter((f) => !core.has(f));
  return notCore.length > 0 ? notCore : item.forms;
}

function lexiconOf(plan: RoadPlan): Lexicon {
  const cached = lexicons.get(plan);
  if (cached) return cached;
  const lessons: LessonEntry[] = [];
  for (const unit of plan.units) for (const skill of unit.skills) for (const lesson of skill.lessons) lessons.push({ unit, skill, lesson, index: lessons.length + 1 });
  const firstUse = new Map<string, number>();
  const core = new Set(plan.core.map((w) => w.toLowerCase()));
  for (const w of core) firstUse.set(w, 0);
  for (const n of plan.names) for (const f of n.forms) for (const w of kurdishWords(f)) firstUse.set(w, 0);
  const items: ItemEntry[] = [];
  const signs = new Map<string, number[]>();
  for (const entry of lessons) {
    const before = (w: string): boolean => (firstUse.get(w) ?? Infinity) < entry.index;
    const counts = new Map<string, number>();
    for (const item of entry.lesson.new) for (const f of new Set(item.forms)) counts.set(f, (counts.get(f) ?? 0) + 1);
    const shared = new Set([...counts].filter(([, n]) => n > 1).map(([f]) => f));
    for (const item of entry.lesson.new) {
      const ie: ItemEntry = { item, lesson: entry.lesson.key, index: entry.index };
      const id = items.push(ie) - 1;
      for (const s of signsOf(ie, before, shared, core)) {
        const list = signs.get(s);
        if (list) list.push(id);
        else signs.set(s, [id]);
      }
    }
    for (const item of entry.lesson.new) for (const f of item.forms) if (!firstUse.has(f)) firstUse.set(f, entry.index);
  }
  const lex: Lexicon = { lessons, byKey: new Map(lessons.map((l) => [l.lesson.key, l])), firstUse, items, signs };
  lexicons.set(plan, lex);
  return lex;
}

// ---------- loading ----------

export function loadRoadPlan(): RoadPlan {
  return JSON.parse(readFileSync(ROAD_PLAN_FILE, 'utf8')) as RoadPlan;
}

/** The unit files written so far, by number. */
export function roadUnitNumbers(): number[] {
  if (!existsSync(ROAD_DIR)) return [];
  return readdirSync(ROAD_DIR)
    .map((f) => /^unit-(\d{2})\.json$/.exec(f)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

// ---------- the plan ----------

const CEFR: Record<number, string> = { 1: 'A1', 2: 'A1', 3: 'A1', 4: 'A1', 5: 'A2', 6: 'A2', 7: 'A2', 8: 'A2', 9: 'A2', 10: 'B1', 11: 'B1', 12: 'B1' };
export const GRAMMAR_MD_MAX = 1200;

/**
 * The plan on its own: complete (12 units of 4 skills of 4 lessons, keys in
 * order, a role and a voice for each), and a lexicon a check can rely on —
 * 4 to 8 items a lesson, none introduced twice, every form a lower-case word
 * in Hawar letters.
 */
export function checkRoadPlan(plan: RoadPlan): RoadProblem[] {
  const problems: RoadProblem[] = [];
  const add = (message: string, at: Partial<RoadProblem> = {}): void => {
    problems.push({ ...at, message });
  };
  for (const [k, v] of Object.entries(ROAD_COURSE)) if (plan.course?.[k as keyof typeof ROAD_COURSE] !== v) add(`course.${k} should be “${v}”`);
  for (const v of ROAD_VOICES) if (!plan.characters?.[v]) add(`characters.${v} is missing`);
  if (!Array.isArray(plan.core) || plan.core.length > 12) add('core should list at most 12 words');
  for (const w of plan.core ?? []) if (!HAWAR_FORM.test(w)) add(`core word “${w}” is not a lower-case Hawar word`);
  for (const n of plan.names ?? []) {
    if (!n.forms?.includes(n.name)) add(`name ${n.name}: its forms should include the name itself`);
    for (const f of n.forms ?? []) if (!/^[A-ZÇÊÎŞÛ][a-zçêîşû]+$/.test(f)) add(`name form “${f}” is not a capitalised Hawar word`);
  }
  if (!Array.isArray(plan.doubts)) add('doubts should be a list (empty when there are none)');
  for (const t of textsIn({ characters: plan.characters, units: plan.units })) for (const m of familyProblems(t.text)) add(`${t.path}: ${m}`);
  if (plan.units?.length !== 12) add(`there should be 12 units, not ${plan.units?.length ?? 0}`);
  const seen = new Map<string, string>();
  (plan.units ?? []).forEach((unit, ui) => {
    const at = { unit: unit.number };
    if (unit.number !== ui + 1) add(`unit number ${unit.number} is out of order`, at);
    if (unit.cefr !== CEFR[ui + 1]) add(`cefr should be ${CEFR[ui + 1]}`, at);
    if (!unit.titleKu || !unit.titleEn || !unit.story) add('titles and story are required', at);
    for (const p of orthographyProblems(unit.titleKu ?? '', false)) add(`titleKu: ${p}`, at);
    if (unit.skills?.length !== 4) add(`there should be 4 skills, not ${unit.skills?.length ?? 0}`, at);
    (unit.skills ?? []).forEach((skill, si) => {
      if (skill.position !== si + 1) add(`skill ${si + 1} has position ${skill.position}`, at);
      if (!skill.titleKu || !skill.titleEn || !skill.grammar) add(`skill ${si + 1}: titles and grammar are required`, at);
      for (const p of orthographyProblems(skill.titleKu ?? '', false)) add(`skill ${si + 1} titleKu: ${p}`, at);
      if (!skill.grammarMd || skill.grammarMd.length > GRAMMAR_MD_MAX) add(`skill ${si + 1}: grammarMd must be 1–${GRAMMAR_MD_MAX} characters (${skill.grammarMd?.length ?? 0})`, at);
      if (skill.lessons?.length !== 4) add(`skill ${si + 1} should have 4 lessons`, at);
      (skill.lessons ?? []).forEach((lesson, li) => {
        const key = `u${String(ui + 1).padStart(2, '0')}s${si + 1}l${li + 1}`;
        const lat = { unit: unit.number, lesson: lesson.key };
        if (lesson.key !== key) add(`key should be ${key}`, lat);
        if (lesson.position !== li + 1) add(`position should be ${li + 1}`, lat);
        if (lesson.focus !== ROAD_FOCUS[li]) add(`focus should be ${ROAD_FOCUS[li]}`, lat);
        if (unit.recorder !== undefined && unit.recorder !== ROAD_RECORDER) add(`recorder should be ${ROAD_RECORDER}, or left out`, at);
        if (unit.recorder === ROAD_RECORDER ? lesson.voice !== ROAD_RECORDER : !ROAD_VOICES.includes(lesson.voice)) {
          add(unit.recorder === ROAD_RECORDER ? `voice should be ${ROAD_RECORDER}: Hamo records every line of this chapter` : `voice “${lesson.voice}” is not one of ${ROAD_VOICES.join(', ')}`, lat);
        }
        if (!lesson.titleKu || !lesson.titleEn || !lesson.beat) add('titles and beat are required', lat);
        for (const p of orthographyProblems(lesson.titleKu ?? '', false)) add(`titleKu: ${p}`, lat);
        const items = lesson.new ?? [];
        if (items.length < 4 || items.length > 8) add(`introduces ${items.length} items (4–8)`, lat);
        for (const item of items) {
          const id = `${item.ku?.toLowerCase()}|${item.pos}`;
          if (!item.ku || !item.en || !item.pos) add(`item “${item.ku}” needs ku, en and pos`, lat);
          if (seen.has(id)) add(`item “${item.ku}” (${item.pos}) was already introduced in ${seen.get(id)}`, lat);
          seen.set(id, lesson.key);
          if (!item.forms?.length) add(`item “${item.ku}” has no forms`, lat);
          if (new Set(item.forms).size !== item.forms?.length) add(`item “${item.ku}” lists a form twice`, lat);
          for (const f of item.forms ?? []) if (!HAWAR_FORM.test(f)) add(`item “${item.ku}”: form “${f}” is not a lower-case word in Hawar letters`, lat);
          const affix = /^-|-$/.test(item.ku ?? '');
          if (!affix) for (const w of kurdishWords(item.ku ?? '')) if (!item.forms?.includes(w)) add(`item “${item.ku}”: its word “${w}” is missing from its forms`, lat);
        }
      });
    });
  });
  return problems;
}

// ---------- the unit files ----------

const LISTENING = (ex: RawExercise): boolean => ex.type === 'listening' || (ex.type === 'multiple_choice' && typeof ex.payload.say === 'string' && ex.payload.say.trim() !== '');
const PRODUCTION = (ex: RawExercise): boolean =>
  ex.type === 'writing' || ex.type === 'speaking' || (ex.type === 'translate' && !(typeof ex.payload.say === 'string' && ex.payload.say.trim() !== ''));

/** The kinds whose `say` is the sentence they ask about, shown to the learner only in their prompt. */
const QUOTES_SAY: ReadonlySet<string> = new Set(['multiple_choice', 'translate', 'writing']);

interface RawExercise {
  position: number;
  type: string;
  payload: Record<string, unknown>;
}

interface KurdishField {
  field: string;
  text: string;
  /** checked against the lexicon, the alphabet and the lengths */
  strict: boolean;
  /** counted when telling which items an exercise uses */
  counts: boolean;
  /** a whole line of a conversation, which is always a sentence */
  line?: boolean;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const QUOTED = /[“«"]([^”»"]+)[”»"]/g;

/**
 * The Kurdish in an exercise. `strict` fields are certainly Kurdish and are
 * held to every rule; the rest (multiple-choice options, Kurdish quoted in an
 * English prompt, a conversation question in the units whose questions are
 * English) may be either language, so they only count towards meeting an
 * item, and only when every word in them is Kurdish the learner knows.
 */
function kurdishFields(ex: RawExercise, unit: number): KurdishField[] {
  const p = ex.payload;
  const out: KurdishField[] = [];
  const strict = (field: string, text: unknown, counts = true, line = false): void => {
    if (typeof text === 'string') out.push({ field, text, strict: true, counts, line });
  };
  const soft = (field: string, text: unknown): void => {
    if (typeof text === 'string') out.push({ field, text, strict: false, counts: true });
  };
  strict('payload.say', p.say);
  const hasSay = typeof p.say === 'string' && p.say.trim() !== '';
  if ((ex.type === 'translate' && !hasSay) || ex.type === 'writing' || ex.type === 'listening') {
    strings(p.accepted).forEach((a, i) => strict(`payload.accepted[${i}]`, a, i === 0));
  }
  if (ex.type === 'speaking') strict('payload.reference', p.reference);
  if (ex.type === 'match_pairs' && Array.isArray(p.pairs)) {
    p.pairs.forEach((pair, i) => {
      if (isRecord(pair)) strict(`payload.pairs[${i}].left`, pair.left);
    });
  }
  if (ex.type === 'conversation') {
    if (Array.isArray(p.lines)) {
      p.lines.forEach((l, i) => {
        if (isRecord(l)) strict(`payload.lines[${i}].text`, l.text, true, true);
      });
    }
    if (unit >= 5) {
      strict('payload.prompt', p.prompt);
      strings(p.options).forEach((o, i) => strict(`payload.options[${i}]`, o));
    } else {
      soft('payload.prompt', p.prompt);
      strings(p.options).forEach((o, i) => soft(`payload.options[${i}]`, o));
    }
  } else if (typeof p.ask === 'string') {
    // an item that says what it asks holds its line alone: the Kurdish one is held to every rule (its gap left
    // out), and is not counted twice where it is also `say`; a reply's or a missing word's options are Kurdish
    if (KURDISH_LINE_ASKS.has(p.ask as ExerciseAsk) && typeof p.prompt === 'string') strict('payload.prompt', p.prompt.replace(GAP, ' ').replace(/\s+/g, ' '), !hasSay);
    if (ex.type === 'multiple_choice' && (p.ask === 'reply' || p.ask === 'missing' || p.ask === 'choose-kurdish')) strings(p.options).forEach((o, i) => strict(`payload.options[${i}]`, o));
  } else {
    if (ex.type === 'multiple_choice') strings(p.options).forEach((o, i) => soft(`payload.options[${i}]`, o));
    if (typeof p.prompt === 'string') for (const m of p.prompt.matchAll(QUOTED)) soft('payload.prompt', m[1]);
  }
  return out;
}

/** The asks whose line, the item's prompt, is Kurdish; `to-kurdish` and `choose-kurdish` hold English, and `hear` has no line. */
const KURDISH_LINE_ASKS: ReadonlySet<ExerciseAsk> = new Set(['meaning', 'picture', 'reply', 'missing', 'to-english', 'repeat']);

/** The longest an English line to put into Kurdish, and a cue, may be: a line and a few words, never a scene. */
const ENGLISH_LINE_MAX = 120;
const CUE_MAX = 40;

/**
 * 8: an item that says what it asks keeps to it. Its line is the sentence alone — no scene, no quotes around
 * it — since the apps name the task in the headline; a picture's word is the word its right picture shows; a
 * sentence to repeat is the one shown; and a cue is a few words.
 */
function askProblems(ex: RawExercise): Array<{ message: string; field: string }> {
  const p = ex.payload;
  const out: Array<{ message: string; field: string }> = [];
  if (ex.type === 'match_pairs' || ex.type === 'conversation') return out;
  const ask = p.ask;
  if (typeof ask !== 'string') {
    out.push({ message: `says nothing of what it asks: give it an ask (${(ASKS_BY_TYPE[ex.type as ExerciseType] ?? []).join(', ')}) and keep its prompt to the line`, field: 'payload.ask' });
    return out;
  }
  const prompt = typeof p.prompt === 'string' ? p.prompt : '';
  if (ask === 'hear') {
    if (prompt.trim() !== '') out.push({ message: 'a listening item has no prompt: the headline asks, the recording says', field: 'payload.prompt' });
  } else if (/[“”«»"]/.test(prompt)) {
    out.push({ message: 'the line stands alone, without quotes or a scene around it: the headline says what to do', field: 'payload.prompt' });
  }
  if ((ask === 'to-kurdish' || ask === 'choose-kurdish') && prompt.length > ENGLISH_LINE_MAX) out.push({ message: `an English line of ${prompt.length} characters (at most ${ENGLISH_LINE_MAX})`, field: 'payload.prompt' });
  if (ask === 'picture') {
    const right = strings(p.options)[typeof p.correctIndex === 'number' ? p.correctIndex : -1];
    const word = right && Object.hasOwn(WORD_PICTURES, right) ? WORD_PICTURES[right as keyof typeof WORD_PICTURES].ku : undefined;
    if (word !== undefined && lessonAudioKey(word) !== lessonAudioKey(prompt)) out.push({ message: `the right picture is “${word}”, not “${prompt}”`, field: 'payload.prompt' });
  }
  if (ask === 'repeat' && typeof p.reference === 'string' && lessonAudioKey(p.reference) !== lessonAudioKey(prompt)) {
    out.push({ message: 'the line to repeat is the one shown: prompt and reference are the same sentence', field: 'payload.prompt' });
  }
  if (typeof p.cue === 'string' && p.cue.length > CUE_MAX) out.push({ message: `a cue of ${p.cue.length} characters (at most ${CUE_MAX})`, field: 'payload.cue' });
  return out;
}


const share = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);
const pct = (x: number): string => `${Math.round(x * 1000) / 10} %`;

export interface RoadCheckOptions {
  /** the units to check; all unit files that exist when left out */
  units?: number[];
  /** a plan other than plan.json (the test’s small example) */
  plan?: RoadPlan;
  /** unit documents by number, in place of the files */
  docs?: Map<number, unknown>;
}

/**
 * Check unit files against the plan (§4 of the road’s contract): structure
 * and payloads, the alphabet, the lexicon, the lesson recipe, the voices and
 * the lengths. Every problem is reported, not just the first, and with its
 * place, so one run gives a writer the whole list.
 *
 * Hamo’s share of the recordings is held per unit: each unit lands on its
 * own, and a unit that keeps the split cannot pull the course below it.
 */
export function checkRoad(options: RoadCheckOptions = {}): RoadCheck {
  const plan = options.plan ?? loadRoadPlan();
  const lex = lexiconOf(plan);
  const problems: RoadProblem[] = [];
  const available = options.docs ? [...options.docs.keys()].sort((a, b) => a - b) : roadUnitNumbers();
  const wanted = options.units ?? available;
  const docOf = (n: number): unknown => (options.docs ? options.docs.get(n) : JSON.parse(readFileSync(roadUnitFile(n), 'utf8')));

  // conversation ids are unique across the whole course, so every unit present is read for them
  const idsElsewhere = new Map<string, number>();
  for (const n of available) {
    if (wanted.includes(n)) continue;
    for (const id of conversationIds(docOf(n))) idsElsewhere.set(id, n);
  }

  const stats: RoadStats = {
    units: [],
    lessons: 0,
    exercises: 0,
    minutes: 0,
    newItems: 0,
    recordings: { hamo: 0, xezo: 0, hevalo: 0, unvoiced: 0 },
    conversationLines: { hamo: 0, xezo: 0, hevalo: 0 },
  };
  const courseRecordings = new Map<string, RoadVoice | 'unvoiced'>();
  const idsHere = new Map<string, string>();
  // the lessons each item is met in, for rule 10
  const metIn = new Map<number, Set<number>>();

  for (const n of wanted) {
    const planUnit = plan.units.find((u) => u.number === n);
    if (!planUnit) {
      problems.push({ unit: n, message: `the plan has no unit ${n}` });
      continue;
    }
    if (!available.includes(n)) {
      problems.push({ unit: n, message: `unit-${String(n).padStart(2, '0')}.json is not written yet` });
      continue;
    }
    let raw: unknown;
    try {
      raw = docOf(n);
    } catch (err) {
      problems.push({ unit: n, message: `does not parse as JSON: ${(err as Error).message}` });
      continue;
    }
    stats.units.push(n);
    stats.newItems += planUnit.skills.reduce((s, sk) => s + sk.lessons.reduce((t, l) => t + l.new.length, 0), 0);
    checkUnit(n, planUnit, raw, plan, lex, problems, stats, courseRecordings, idsHere, idsElsewhere, metIn);
  }
  problems.push(...returnProblems(lex, stats.units, metIn));
  for (const voice of courseRecordings.values()) stats.recordings[voice] += 1;
  stats.minutes = Math.round((stats.exercises * 15) / 60);
  return { problems, stats };
}

/**
 * Where a word must come back after the lesson that brings it in: soon, while it is fresh; again a little later in
 * the chapter or the next; and again in a later chapter. Gaps that grow are what keep a word, and a word that is met
 * once and never again is forgotten. A window is held only when every lesson in it was checked, and is cut short
 * where the course ends.
 */
export const ROAD_RETURNS: ReadonlyArray<{ from: number; to: number; say: string }> = [
  { from: 1, to: 3, say: 'in the three lessons after it' },
  { from: 4, to: 16, say: '4 to 16 lessons after it' },
  { from: 17, to: 48, say: 'in a later chapter (17 to 48 lessons after it)' },
];

// 10: every new word comes back at growing gaps
function returnProblems(lex: Lexicon, units: readonly number[], metIn: Map<number, Set<number>>): RoadProblem[] {
  const problems: RoadProblem[] = [];
  const checked = new Set(lex.lessons.filter((l) => units.includes(l.unit.number)).map((l) => l.index));
  const last = lex.lessons.length;
  lex.items.forEach((ie, id) => {
    if (!checked.has(ie.index)) return;
    const met = metIn.get(id) ?? new Set<number>();
    for (const w of ROAD_RETURNS) {
      const from = ie.index + w.from;
      const to = Math.min(ie.index + w.to, last);
      if (from > last) continue;
      const window = Array.from({ length: to - from + 1 }, (_, i) => from + i);
      if (!window.every((i) => checked.has(i)) || window.some((i) => met.has(i))) continue;
      const span = from === to ? lex.lessons[from - 1]!.lesson.key : `${lex.lessons[from - 1]!.lesson.key}–${lex.lessons[to - 1]!.lesson.key}`;
      problems.push({ unit: lex.byKey.get(ie.lesson)!.unit.number, lesson: ie.lesson, message: `“${ie.item.ku}” does not come back ${w.say}: bring it into ${span}` });
    }
  });
  return problems;
}

// ---------- the chapters' stories ----------

/** Where the stories Hamo tells at the end of each chapter are kept: seeded with the starter stories (stories/import.ts). */
export const ROAD_STORIES_FILE = new URL('../../content/stories/road.json', import.meta.url);

/** The level of the story at the end of each chapter, as the stories table counts them: A1 1, A2 2, B1 3. */
const STORY_LEVEL: Record<string, number> = { A1: 1, A2: 2, B1: 3 };

/** At most this share of a story's words may be ones the learner has not met by its chapter's end, each glossed. */
export const STORY_NEW_WORDS_MAX = 0.02;

export interface RoadStoryInput {
  slug: string;
  dialect?: string;
  level?: number;
  title?: string;
  body?: string;
  glossary?: Array<{ term?: string; meanings?: { en?: string } }>;
  questions?: Array<{ options?: unknown[]; correctIndex?: number; prompt?: string }>;
}

/**
 * The story at the end of each chapter, held to what the chapter taught: a
 * slug that names its chapter (`road-NN-…`), one story a chapter, Kurmancî at
 * the chapter's level, Hawar letters and a capital at each sentence, and
 * words the learner has met by the chapter's last lesson — at most 2 % new,
 * every one of them glossed (Hu & Nation's 98 % for reading with ease).
 * Questions point at one of their own options.
 */
export function checkRoadStories(plan: RoadPlan, stories: readonly RoadStoryInput[]): RoadProblem[] {
  const lex = lexiconOf(plan);
  const problems: RoadProblem[] = [];
  const seen = new Map<number, string>();
  for (const story of stories) {
    const at = (message: string, field?: string): void => void problems.push({ lesson: story.slug, field, message });
    const n = roadStoryChapter(story.slug);
    const unit = n === null ? undefined : plan.units.find((u) => u.number === n);
    if (n === null || !unit) {
      at('slug should be road-NN-… with NN the chapter it ends (01–12)', 'slug');
      continue;
    }
    if (seen.has(n)) at(`chapter ${n} already has a story: ${seen.get(n)}`, 'slug');
    seen.set(n, story.slug);
    if (story.dialect !== 'kurmanci') at('dialect should be kurmanci', 'dialect');
    if (story.level !== STORY_LEVEL[unit.cefr]) at(`level should be ${STORY_LEVEL[unit.cefr]} (${unit.cefr})`, 'level');
    const body = story.body ?? '';
    if (body.trim() === '') {
      at('has no text', 'body');
      continue;
    }
    for (const p of orthographyProblems(story.title ?? '', false)) at(p, 'title');
    for (const t of textsIn(story)) for (const m of familyProblems(t.text)) at(m, t.path);
    storyParagraphs(body).forEach((paragraph, pi) => {
      for (const p of orthographyProblems(paragraph.replace(/[“”«»]/g, ''), true)) at(p, `body ¶${pi + 1}`);
    });
    // the chapter's last lesson is the furthest the learner has come
    const last = Math.max(...lex.lessons.filter((l) => l.unit.number === n).map((l) => l.index));
    const glossed = new Set((story.glossary ?? []).flatMap((g) => kurdishWords(g.term ?? '')));
    const words = kurdishWords(body).filter((w) => !/^\d+$/.test(w));
    const unmet = words.filter((w) => (lex.firstUse.get(w) ?? Infinity) > last);
    for (const w of new Set(unmet)) if (!glossed.has(w)) at(`“${w}” is not met by the end of chapter ${n}: gloss it, or say it with words the chapter taught`, 'body');
    if (words.length > 0 && unmet.length / words.length > STORY_NEW_WORDS_MAX) {
      at(`${unmet.length} of its ${words.length} words are new by chapter ${n} (at most ${Math.round(STORY_NEW_WORDS_MAX * 100)} %)`, 'body');
    }
    for (const g of story.glossary ?? []) {
      if (!g.term || !body.includes(g.term)) at(`glossary term “${g.term ?? ''}” is not in the story`, 'glossary');
      if (!g.meanings?.en) at(`glossary term “${g.term ?? ''}” has no English meaning`, 'glossary');
    }
    (story.questions ?? []).forEach((q, qi) => {
      const options = Array.isArray(q.options) ? q.options.length : 0;
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= options) at('correctIndex must point at an option', `questions[${qi}]`);
      // a question is read in Kurdish first, so it asks with the words the learner has, as the story does
      const asked = [q.prompt ?? '', ...(Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string') : [])].join(' ');
      for (const w of new Set(kurdishWords(asked).filter((x) => !/^\d+$/.test(x)))) {
        if ((lex.firstUse.get(w) ?? Infinity) > last && !glossed.has(w)) at(`“${w}” is not met by the end of chapter ${n}: ask with words the chapter taught`, `questions[${qi}]`);
      }
    });
  }
  return problems;
}

/** The stories file as written (or another file in its shape, a draft a writer checks), or none while it is not there yet. */
export function loadRoadStories(file: URL | string = ROAD_STORIES_FILE): RoadStoryInput[] {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { stories?: RoadStoryInput[] };
    return Array.isArray(raw.stories) ? raw.stories : [];
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return [];
    throw err;
  }
}

function conversationIds(doc: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isRecord(v)) {
      if (v.type === 'conversation' && isRecord(v.payload) && typeof v.payload.id === 'string') out.push(v.payload.id);
      else Object.values(v).forEach(walk);
    }
  };
  walk(doc);
  return out;
}

function checkUnit(
  n: number,
  planUnit: RoadUnit,
  raw: unknown,
  plan: RoadPlan,
  lex: Lexicon,
  problems: RoadProblem[],
  stats: RoadStats,
  courseRecordings: Map<string, RoadVoice | 'unvoiced'>,
  idsHere: Map<string, string>,
  idsElsewhere: Map<string, number>,
  metIn: Map<number, Set<number>>,
): void {
  const add = (message: string, at: Partial<RoadProblem> = {}): void => {
    problems.push({ unit: n, ...at, message });
  };

  // 1. structure: the import format, the payloads, the plan’s keys and titles, positions without gaps
  const parsed = courseContentSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add(issue.message, { field: issue.path.join('.') });
    return;
  }
  const doc = raw as { course: Record<string, unknown>; units: Array<Record<string, unknown>> };
  for (const k of ['slug', 'dialect', 'titleKu', 'titleEn'] as const) {
    if (doc.course[k] !== plan.course[k]) add(`course.${k} should be “${plan.course[k]}” as in the plan`, { field: `course.${k}` });
  }
  if (doc.units.length !== 1) add(`a unit file holds exactly one unit, not ${doc.units.length}`, { field: 'units' });
  const unit = doc.units[0]!;
  if (unit.position !== n) add(`position should be ${n}`, { field: 'units[0].position' });
  if (unit.titleKu !== planUnit.titleKu) add(`titleKu should be “${planUnit.titleKu}”`, { field: 'units[0].titleKu' });
  if (unit.titleEn !== planUnit.titleEn) add(`titleEn should be “${planUnit.titleEn}”`, { field: 'units[0].titleEn' });
  const skills = unit.skills as Array<Record<string, unknown>>;
  if (skills.length !== planUnit.skills.length) add(`has ${skills.length} skills; the plan has ${planUnit.skills.length}`, { field: 'units[0].skills' });

  const singles = new Map<string, RoadVoice | 'unvoiced'>();
  const lines: Record<RoadVoice, number> = { hamo: 0, xezo: 0, hevalo: 0 };
  // a chapter written for Hamo alone is held to it; one not rewritten yet to the older split
  const hamoOnly = planUnit.recorder === ROAD_RECORDER;
  const limit = n <= 4 ? 12 : 18;

  skills.forEach((skill, si) => {
    const planSkill = planUnit.skills[si];
    const sf = `units[0].skills[${si}]`;
    if (skill.position !== si + 1) add(`position should be ${si + 1}`, { field: `${sf}.position` });
    if (!planSkill) return;
    if (skill.titleKu !== planSkill.titleKu) add(`titleKu should be “${planSkill.titleKu}”`, { field: `${sf}.titleKu` });
    if (skill.titleEn !== planSkill.titleEn) add(`titleEn should be “${planSkill.titleEn}”`, { field: `${sf}.titleEn` });
    const md = typeof skill.grammarMd === 'string' ? skill.grammarMd : '';
    if (md !== planSkill.grammarMd) add('grammarMd should be the plan’s tip for this skill', { field: `${sf}.grammarMd` });
    if (md.length > GRAMMAR_MD_MAX) add(`grammarMd is ${md.length} characters (at most ${GRAMMAR_MD_MAX})`, { field: `${sf}.grammarMd` });
    const lessons = skill.lessons as Array<Record<string, unknown>>;
    if (lessons.length !== planSkill.lessons.length) add(`skill ${si + 1} has ${lessons.length} lessons; the plan has ${planSkill.lessons.length}`, { field: `${sf}.lessons` });

    lessons.forEach((lesson, li) => {
      const planLesson = planSkill.lessons[li];
      const lf = `${sf}.lessons[${li}]`;
      if (lesson.position !== li + 1) add(`position should be ${li + 1}`, { field: `${lf}.position` });
      if (!planLesson) return;
      const key = planLesson.key;
      const at = { lesson: key };
      if (lesson.key !== key) add(`key should be ${key}`, { ...at, field: 'key' });
      if (lesson.titleKu !== planLesson.titleKu) add(`titleKu should be “${planLesson.titleKu}”`, { ...at, field: 'titleKu' });
      if (lesson.titleEn !== planLesson.titleEn) add(`titleEn should be “${planLesson.titleEn}”`, { ...at, field: 'titleEn' });
      const entry = lex.byKey.get(key)!;
      const exercises = (lesson.exercises as Array<Record<string, unknown>>).map((e): RawExercise => ({
        position: e.position as number,
        type: e.type as string,
        payload: isRecord(e.payload) ? e.payload : {},
      }));
      stats.lessons += 1;
      stats.exercises += exercises.length;

      const met = new Map<number, number>();
      // where each word is first met in the lesson, and the new words its items mark
      const firstMet = new Map<string, number>();
      const marked = new Set<string>();
      exercises.forEach((ex, ei) => {
        const eat = { ...at, exercise: ei + 1 };
        if (ex.position !== ei + 1) add(`position should be ${ei + 1}`, { ...eat, field: 'position' });
        try {
          validateExercisePayload(ex.type as ExerciseType, ex.payload);
        } catch (err) {
          if (!(err instanceof InvalidExercisePayloadError)) throw err;
          for (const issue of err.issues) add(issue.message, { ...eat, field: issue.path === 'type' ? 'type' : `payload.${issue.path}` });
        }

        // 2, 3, 6: the alphabet, the lexicon and the lengths, field by field
        const used = new Set<number>();
        for (const f of kurdishFields(ex, n)) {
          const words = kurdishWords(f.text);
          if (f.strict) {
            for (const p of orthographyProblems(f.text, f.line === true || isSentence(f.text))) add(p, { ...eat, field: f.field });
            const unknown = new Set<string>();
            for (const w of words) if (!/^\d+$/.test(w) && (lex.firstUse.get(w) ?? Infinity) > entry.index) unknown.add(w);
            for (const w of unknown) {
              const later = lex.firstUse.get(w);
              add(later === undefined ? `unknown word “${w}”` : `“${w}” is not introduced until ${lex.lessons[later - 1]!.lesson.key}`, { ...eat, field: f.field });
            }
            for (const len of sentenceLengths(f.text)) if (len > limit) add(`a sentence of ${len} words (at most ${limit} in unit ${n})`, { ...eat, field: f.field });
          } else if (!words.every((w) => /^\d+$/.test(w) || (lex.firstUse.get(w) ?? Infinity) <= entry.index)) {
            continue;
          }
          if (!f.counts) continue;
          for (const w of words) for (const id of lex.signs.get(w) ?? []) if (lex.items[id]!.index <= entry.index) used.add(id);
        }
        for (const id of used) met.set(id, (met.get(id) ?? 0) + 1);

        // 7: what the item asks about is on screen. Its Kurdish in `say` is never sent as text, and its recording
        // is played before the answer only when the prompt shows that Kurdish (lessonaudio/delivery.ts), so an
        // item whose prompt does not would ask about a sentence the learner can neither read nor hear.
        // A missing word's line holds its sentence with a gap, so that one is read with the gap filled instead.
        if (
          QUOTES_SAY.has(ex.type) &&
          ex.payload.ask !== 'missing' &&
          typeof ex.payload.say === 'string' &&
          ex.payload.say.trim() !== '' &&
          !shownInPrompt(ex.payload.prompt, ex.payload.say)
        ) {
          add('its Kurdish (say) is not in the prompt, so the learner can neither read nor hear it before answering: show it there', { ...eat, field: 'payload.prompt' });
        }

        // 8: what it asks, and its line alone
        for (const pr of askProblems(ex)) add(pr.message, { ...eat, field: pr.field });

        // 11: nothing the road never says, in any of its strings
        for (const t of textsIn(ex.payload)) for (const m of familyProblems(t.text)) add(m, { ...eat, field: `payload.${t.path}` });

        // 9: a word marked new is one this lesson brings in, met here for the first time in the lesson
        for (const w of Array.isArray(ex.payload.new) ? ex.payload.new : []) {
          const ku = isRecord(w) && typeof w.ku === 'string' ? w.ku : '';
          const words = kurdishWords(ku);
          const mine = lex.items.some((ie) => ie.lesson === key && ie.item.forms.some((f) => words.includes(f)));
          if (!mine) add(`“${ku}” is marked new but is not one of ${key}’s new words`, { ...eat, field: 'payload.new' });
          else if (words.length > 0 && words.every((x) => (firstMet.get(x) ?? Infinity) < ei)) {
            add(`“${ku}” is marked new after it was already met in exercise ${Math.max(...words.map((x) => firstMet.get(x)!)) + 1}`, { ...eat, field: 'payload.new' });
          }
          for (const x of words) marked.add(x);
        }
        for (const f of kurdishFields(ex, n)) for (const w of kurdishWords(f.text)) if (!firstMet.has(w)) firstMet.set(w, ei);

        // 5: who records it — Hamo, every line, and never one said to him
        const texts = recordedTexts(ex.type, ex.payload);
        const voice = ex.payload.voice;
        if (voice !== undefined && !ROAD_VOICES.includes(voice as RoadVoice)) add(`voice “${String(voice)}” is not one of ${ROAD_VOICES.join(', ')}`, { ...eat, field: 'payload.voice' });
        if (texts.length > 0 && ex.type !== 'conversation' && voice === undefined) add('has something to record but no voice', { ...eat, field: 'payload.voice' });
        else if (hamoOnly && texts.length > 0 && ex.type !== 'conversation' && voice !== ROAD_RECORDER) {
          add(`is recorded by ${String(voice)}: Hamo records every line of the road, so tell it through him, or show it written`, { ...eat, field: 'payload.voice' });
        }
        for (const t of voice === ROAD_RECORDER ? texts : []) {
          if (addressesHamo(t)) add(`Hamo would say “${t}” to himself: model it without his name (the learner says it to him)`, eat);
        }
        const v: RoadVoice | 'unvoiced' = ROAD_VOICES.includes(voice as RoadVoice) ? (voice as RoadVoice) : 'unvoiced';
        for (const t of texts) {
          const k = lessonAudioKey(t);
          if (!singles.has(k)) singles.set(k, v);
          if (!courseRecordings.has(k)) courseRecordings.set(k, v);
        }
        if (ex.type === 'conversation') {
          const id = typeof ex.payload.id === 'string' ? ex.payload.id : '';
          if (!/^road[a-z0-9]+$/.test(id) || !CONVERSATION_ID.test(id)) {
            add(`conversation id should be “road” + the lesson key + a letter, e.g. road${key}a (lower-case letters and digits only)`, { ...eat, field: 'payload.id' });
          }
          const twin = idsHere.get(id) ?? (idsElsewhere.has(id) ? `unit ${idsElsewhere.get(id)}` : undefined);
          if (id && twin) add(`conversation id ${id} is already used in ${twin}`, { ...eat, field: 'payload.id' });
          if (id && !twin) idsHere.set(id, `${key} #${ei + 1}`);
          const count = Array.isArray(ex.payload.lines) ? ex.payload.lines.length : 0;
          if (count < 6 || count > 12) add(`a conversation has 6–12 lines, not ${count}`, { ...eat, field: 'payload.lines' });
          // Hamo talking with the learner: he says his lines, the learner says theirs
          const parts = Array.isArray(ex.payload.speakers) ? ex.payload.speakers : [];
          parts.forEach((part, pi) => {
            if (!hamoOnly || !isRecord(part) || part.learner === true || part.character === ROAD_RECORDER) return;
            add(`part ${pi + 1} is ${String(part.character)}: a conversation is Hamo talking with the learner (a part with learner: true)`, { ...eat, field: `payload.speakers[${pi}]` });
          });
          for (const clip of conversationClips(ex.payload)) {
            if (clip.character) lines[clip.character] += 1;
            if (clip.character === ROAD_RECORDER && addressesHamo(clip.text)) add(`Hamo would say “${clip.text}” to himself: give the line to the learner`, { ...eat, field: `payload.lines[${clip.index}].text` });
          }
        }
      });

      // 4: the lesson’s recipe
      const types = new Set(exercises.map((e) => e.type));
      if (exercises.length < 12 || exercises.length > 16) add(`has ${exercises.length} exercises (12–16)`, at);
      if (types.size < 4) add(`uses ${types.size} exercise types (at least 4)`, at);
      if (!exercises.some(LISTENING)) add('has no listening (a listening, or a multiple choice with say)', at);
      if (entry.index > 1 && !exercises.some(PRODUCTION)) add('has no production (translate into Kurdish, writing or speaking)', at);
      if (planLesson.focus === 'meet' && !types.has('match_pairs')) add('a meet lesson has a match_pairs', at);
      if (planLesson.focus === 'talk' && !types.has('conversation')) add('a talk lesson has a conversation', at);
      for (const id of met.keys()) {
        const lessons = metIn.get(id);
        if (lessons) lessons.add(entry.index);
        else metIn.set(id, new Set([entry.index]));
      }
      lex.items.forEach((ie, id) => {
        if (ie.lesson === key && (met.get(id) ?? 0) < 3) add(`new item “${ie.item.ku}” is met in ${met.get(id) ?? 0} exercises (at least 3)`, at);
        // the learner sees each new word marked new where it first comes
        if (ie.lesson === key && !ie.item.forms.some((f) => marked.has(f))) add(`new item “${ie.item.ku}” is never marked new`, at);
      });
      const asks = new Set(exercises.map((e) => e.payload.ask).filter((a): a is string => typeof a === 'string'));
      if (asks.size < 4) add(`asks ${asks.size} kinds of question (at least 4)`, at);
      if (entry.index >= 4) {
        const earlier = [...met.keys()].filter((id) => lex.items[id]!.index < entry.index).length;
        if (earlier < 6) add(`reuses ${earlier} items from earlier lessons (at least 6)`, at);
      }
    });
  });

  // 5: a chapter for Hamo alone has every recording his, which the exercises above hold each one to; one not rewritten
  // yet keeps the older split of its sentences and conversation lines between the characters
  if (!hamoOnly) {
    const counts: Record<RoadVoice | 'unvoiced', number> = { hamo: 0, xezo: 0, hevalo: 0, unvoiced: 0 };
    for (const v of singles.values()) counts[v] += 1;
    const total = singles.size;
    if (total > 0 && share(counts.hamo, total) < 0.65) add(`Hamo records ${pct(share(counts.hamo, total))} of the unit’s sentences (at least 65 %)`);
    if (total > 0 && share(counts.hevalo, total) > 0.1) add(`Hevalo records ${pct(share(counts.hevalo, total))} of the unit’s sentences (at most 10 %)`);
    const lineTotal = lines.hamo + lines.xezo + lines.hevalo;
    if (lineTotal > 0 && share(lines.hamo, lineTotal) < 0.45) add(`Hamo says ${pct(share(lines.hamo, lineTotal))} of the unit’s conversation lines (at least 45 %)`);
    if (lineTotal > 0 && share(lines.hevalo, lineTotal) > 0.1) add(`Hevalo says ${pct(share(lines.hevalo, lineTotal))} of the unit’s conversation lines (at most 10 %)`);
  }
  for (const v of ROAD_VOICES) stats.conversationLines[v] += lines[v];
}
