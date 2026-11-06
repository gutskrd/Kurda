import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CONVERSATION_ID, conversationClips, lessonAudioKey, lessonAudioTargets, shownInPrompt } from '@kurda/shared';
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
        if (!ROAD_VOICES.includes(lesson.voice)) add(`voice “${lesson.voice}” is not one of ${ROAD_VOICES.join(', ')}`, lat);
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
  } else {
    if (ex.type === 'multiple_choice') strings(p.options).forEach((o, i) => soft(`payload.options[${i}]`, o));
    if (typeof p.prompt === 'string') for (const m of p.prompt.matchAll(QUOTED)) soft('payload.prompt', m[1]);
  }
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
    checkUnit(n, planUnit, raw, plan, lex, problems, stats, courseRecordings, idsHere, idsElsewhere);
  }
  for (const voice of courseRecordings.values()) stats.recordings[voice] += 1;
  stats.minutes = Math.round((stats.exercises * 15) / 60);
  return { problems, stats };
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
        if (QUOTES_SAY.has(ex.type) && typeof ex.payload.say === 'string' && ex.payload.say.trim() !== '' && !shownInPrompt(ex.payload.prompt, ex.payload.say)) {
          add('its Kurdish (say) is not in the prompt, so the learner can neither read nor hear it before answering: quote it there', { ...eat, field: 'payload.prompt' });
        }

        // 5: who records it
        const texts = recordedTexts(ex.type, ex.payload);
        const voice = ex.payload.voice;
        if (voice !== undefined && !ROAD_VOICES.includes(voice as RoadVoice)) add(`voice “${String(voice)}” is not one of ${ROAD_VOICES.join(', ')}`, { ...eat, field: 'payload.voice' });
        if (texts.length > 0 && ex.type !== 'conversation' && voice === undefined) add('has something to record but no voice', { ...eat, field: 'payload.voice' });
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
          for (const clip of conversationClips(ex.payload)) if (clip.character) lines[clip.character] += 1;
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
      lex.items.forEach((ie, id) => {
        if (ie.lesson === key && (met.get(id) ?? 0) < 3) add(`new item “${ie.item.ku}” is met in ${met.get(id) ?? 0} exercises (at least 3)`, at);
      });
      if (entry.index >= 4) {
        const earlier = [...met.keys()].filter((id) => lex.items[id]!.index < entry.index).length;
        if (earlier < 6) add(`reuses ${earlier} items from earlier lessons (at least 6)`, at);
      }
    });
  });

  // 5: the unit’s split of the recordings
  const counts: Record<RoadVoice | 'unvoiced', number> = { hamo: 0, xezo: 0, hevalo: 0, unvoiced: 0 };
  for (const v of singles.values()) counts[v] += 1;
  const total = singles.size;
  if (total > 0 && share(counts.hamo, total) < 0.65) add(`Hamo records ${pct(share(counts.hamo, total))} of the unit’s sentences (at least 65 %)`);
  if (total > 0 && share(counts.hevalo, total) > 0.1) add(`Hevalo records ${pct(share(counts.hevalo, total))} of the unit’s sentences (at most 10 %)`);
  const lineTotal = lines.hamo + lines.xezo + lines.hevalo;
  if (lineTotal > 0 && share(lines.hamo, lineTotal) < 0.45) add(`Hamo says ${pct(share(lines.hamo, lineTotal))} of the unit’s conversation lines (at least 45 %)`);
  if (lineTotal > 0 && share(lines.hevalo, lineTotal) > 0.1) add(`Hevalo says ${pct(share(lines.hevalo, lineTotal))} of the unit’s conversation lines (at most 10 %)`);
  for (const v of ROAD_VOICES) stats.conversationLines[v] += lines[v];
}
