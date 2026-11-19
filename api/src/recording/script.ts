/**
 * Everything the course asks someone to say aloud, as one script per voice, behind the "Record by person" page. Lines
 * come from lessons (drafts included), stories, word sets, the alphabet and the learning games, each keyed as the
 * studio keys it (`lessonAudioKey`, `conversationLineKey`, or an alphabet clip key), so a take from this script plays
 * everywhere the text is said and earlier studio takes show as done.
 *
 * A text said in several places is one line, filed where the course first says it, listing every place. It belongs
 * to the voice of the first place in course order that plans a character for it (a conversation part, an exercise's
 * `voice`, a game line's speaker), as `plannedSpeaker` decides, else to its variety's narrator. Pure: the service
 * supplies tables and files, so order, keys and merging are tested without a database.
 */
import {
  GAME_NAMES,
  ALPHABET_CLIP_GROUPS,
  CHARACTER_NAMES,
  CONVERSATION_ID,
  LESSON_AUDIO_TEXT_MAX,
  LETTER_CLIPS,
  SPEAKERS,
  WORD_SET_CLIPS,
  conversationClips,
  conversationLineKey,
  isConversationLineKey,
  isSpeakerId,
  lessonAudioKey,
  lessonAudioTargets,
  normalizeKurdish,
  roadStoryChapter,
  storyAudioSentences,
  storyParagraphs,
  toDialect,
  type AlphabetClip,
  type AlphabetClipGroup,
  type SpeakerId,
} from '@kurda/shared';

/** The two varieties, as the alphabet's clips and the games name them. */
export type ScriptDialect = 'kmr' | 'ckb';
/** The table a take is kept in: the lessons' (also stories' and games'), or the alphabet's (also word sets'). */
export type LineStore = 'lesson' | 'alphabet';
/** How far the place a line comes from has got: learners meet only what is published. */
export type SourceStatus = 'draft' | 'in_review' | 'published';
export type LineStatusFilter = 'todo' | 'done' | 'all';

/**
 * A voice as the page and links name it: a character (`hamo`, `xezo`, `hevalo`), an uncast part (`cast-<name>`), or
 * a variety's narrator (`narrator-kmr`, `narrator-ckb`).
 */
export type VoiceId = string;

export const NARRATOR: Readonly<Record<ScriptDialect, VoiceId>> = { kmr: 'narrator-kmr', ckb: 'narrator-ckb' };

/** The shape of a voice's name, which the links table checks too. */
export const VOICE_ID = /^(?:hevalo|hamo|xezo|narrator-kmr|narrator-ckb|cast-[a-z0-9-]{1,40})$/;

export function isVoiceId(v: unknown): v is VoiceId {
  return typeof v === 'string' && VOICE_ID.test(v);
}

/** The course the owner writes the voice plan for, first in every script. */
export const ROAD_COURSE = 'kurmanji-road';

/** Where the course's name for a character differs from the apps' label: the niece is Xezal, Xezo only to her uncle. */
const PLAN_NAMES: Partial<Record<SpeakerId, string>> = { xezo: 'Xezal' };

const DIALECT_NAME: Record<ScriptDialect, string> = { kmr: 'Kurmancî', ckb: 'Soranî' };

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'multiple choice',
  translate: 'translate',
  match_pairs: 'match pairs',
  listening: 'listening',
  speaking: 'speaking',
  writing: 'writing',
};

/** The learning games whose lines are spoken, in listing order, with their page names; rows of any other kind belong to retired games. */
const GAME_KINDS = ['case_file', 'question_template'] as const;
const GAME_NAME: Record<(typeof GAME_KINDS)[number], string> = {
  case_file: GAME_NAMES.detective,
  question_template: GAME_NAMES['who-am-i'],
};

// ---------- what the service hands in ----------

/** One exercise of one lesson version, from the tables or, for an unseeded lesson, the course files. */
export interface ExerciseInput {
  courseSlug: string;
  courseTitle: string;
  /** as the courses table spells it: 'kurmanji', 'sorani' */
  courseDialect: string;
  unitPosition: number;
  unitTitle: string;
  skillPosition: number;
  lessonPosition: number;
  /** null for a lesson that is only in the course files so far */
  lessonId: string | null;
  lessonTitle: string;
  status: string;
  version: number;
  exercisePosition: number;
  type: string;
  payload: unknown;
}

export interface StoryInput {
  id: string;
  /** A story whose slug names a road chapter (`road-01-…`) is Hamo's, told at that chapter's end. */
  slug?: string;
  /** 'kurmanci' or 'sorani' */
  dialect: string;
  title: string;
  status: string;
  body: string;
}

export interface GameInput {
  id: string;
  kind: string;
  /** 'kmr' or 'ckb' */
  dialect: string;
  status: string;
  payload: unknown;
}

/** What the course's voice plan (api/content/lessons/road/plan.json) says about its people and words. */
export interface PlanInput {
  /** the characters with a part, in the plan's order */
  characters: readonly SpeakerId[];
  /** who each one is, in the plan's words */
  about: Partial<Record<SpeakerId, string>>;
  /** the words each lesson teaches, with what they mean */
  words: ReadonlyArray<{ ku: string; en: string }>;
}

export interface ScriptInput {
  exercises: readonly ExerciseInput[];
  stories: readonly StoryInput[];
  games: readonly GameInput[];
  plan: PlanInput;
  /** the alphabet's and the word sets' sounds: every one, unless a test gives fewer */
  letters?: readonly AlphabetClip[];
  words?: readonly AlphabetClip[];
}

// ---------- what comes out ----------

/** One place a line is said. */
export interface LinePlace {
  kind: 'lesson' | 'conversation' | 'story' | 'words' | 'alphabet' | 'game';
  /** "Unit 3 · Lesson 2 · conversation ‘Nexşeya kevn’, line 4" */
  label: string;
  status: SourceStatus;
  /** who this place plans the line for */
  voice: VoiceId;
  /** where it is edited in the console, when it is edited anywhere */
  ref: { page: 'lessons' | 'stories' | 'game-content'; id: string } | null;
}

export interface ScriptLine {
  /** `<store>|<key>`: one line, wherever it is said */
  id: string;
  /** its place in the whole script, which every voice's list keeps: the page's cursor */
  seq: number;
  store: LineStore;
  /** what the take is filed under, exactly as the studio files it */
  key: string;
  /** what to say, as the first place writes it */
  text: string;
  dialect: ScriptDialect;
  voice: VoiceId;
  /** The character a take is saved as spoken by; null for narrator lines and uncast parts. */
  speaker: SpeakerId | null;
  /** what it means in English, when anything says */
  meaning: string | null;
  /** how to say it, where the text alone could be read two ways (a letter's sound) */
  hint: string | null;
  /** what is happening when it is said: the exercise's prompt, who a case's card comes from */
  cue: string | null;
  /** A conversation line is recorded with its conversation and part (`&line=`); `name` is the part's as written. */
  conversation: { id: string; part: number; title: string | null; name: string | null } | null;
  /** the line before it, to act from */
  before: { name: string | null; text: string; meaning: string | null } | null;
  /** the heading it is listed under: a unit, a story, a word set, a game */
  section: { id: string; label: string };
  places: LinePlace[];
  /** some place that says it is published: learners meet it today */
  live: boolean;
}

/** One person who lends a voice. */
export interface Person {
  id: VoiceId;
  kind: 'character' | 'cast' | 'narrator';
  /** the character drawn for them, for a character */
  speaker: SpeakerId | null;
  name: string;
  about: string | null;
  /** a narrator's variety; null for a character, who may speak in either */
  dialect: ScriptDialect | null;
}

export interface Tally {
  total: number;
  done: number;
  todo: number;
}

// ---------- small readers ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** A text cut to `max` characters at a word, for a label. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function sayable(text: string): boolean {
  return lessonAudioKey(text) !== '' && normalizeKurdish(text).length <= LESSON_AUDIO_TEXT_MAX;
}

function dialectOf(value: string): ScriptDialect {
  return toDialect(value) ?? 'kmr';
}

function sourceStatus(status: string): SourceStatus {
  return status === 'published' ? 'published' : status === 'in_review' ? 'in_review' : 'draft';
}

const STATUS_RANK: Record<SourceStatus, number> = { draft: 0, in_review: 1, published: 2 };

/** The character an exercise's payload plans its Kurdish for, when it names one. */
export function plannedVoice(payload: unknown): SpeakerId | null {
  const voice = isRecord(payload) ? payload.voice : undefined;
  return isSpeakerId(voice) ? voice : null;
}

/** A conversation part no character plays, by its name: `cast-nazê` → `cast-naze`. */
export function castVoice(name: string): VoiceId {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `cast-${slug || 'part'}`;
}

/** What a character is called in the course: Hamo, Xezal, Hevalo. */
export function characterName(id: SpeakerId): string {
  return PLAN_NAMES[id] ?? CHARACTER_NAMES[id];
}

/** The quoted parts of a prompt (“…” or "…"), in order. */
function quotedIn(prompt: string): string[] {
  return [...prompt.matchAll(/[“"]([^”"]+)[”"]/g)].map((m) => m[1]!.trim()).filter(Boolean);
}

/** A text without the quotation marks around it. */
function unquoted(text: string): string {
  return text.replace(/^[“"‘']+|[”"’']+$/g, '').trim();
}

/**
 * A multiple-choice question asking what the Kurdish says ("What does he say?"), so its right option is the English
 * meaning. Other questions' options are not translations and are not read.
 */
const ASKS_WHAT_IT_SAYS =
  /\bwhat (?:does|did) (?:he|she|it|they|[A-ZÇÊÎŞÛ][a-zçêîşû]+) (?:say|mean|ask|tell (?:you|him|her|them))\?|\bwhat (?:is|was|are) (?:he|she|it|they) (?:saying|asking|telling (?:you|him|her|them)|shouting)\?/i;

/**
 * What an exercise's Kurdish means, from the exercise itself: `sure` is a pairing it states outright (a card and its
 * pair, a sentence and its accepted English); `guess` comes from the prompt's wording and is kept only when nothing
 * surer is known and it is not itself a Kurdish line of the course.
 */
export function exerciseMeaning(type: string, payload: unknown, text: string): { sure: string | null; guess: string | null } {
  const p = isRecord(payload) ? payload : {};
  const key = lessonAudioKey(text);
  const other = (s: string | null): string | null => (s && lessonAudioKey(s) !== key ? s : null);
  const prompt = str(p.prompt);
  const first = Array.isArray(p.accepted) ? str(p.accepted[0]) : null;
  const say = str(p.say);
  switch (type) {
    case 'match_pairs': {
      const pairs = Array.isArray(p.pairs) ? p.pairs : [];
      const pair = pairs.find((x) => isRecord(x) && typeof x.left === 'string' && lessonAudioKey(x.left) === key);
      return { sure: isRecord(pair) ? str(pair.right) : null, guess: null };
    }
    case 'translate':
      // with `say`, the Kurdish goes to English, and the first accepted answer is the English
      if (say && lessonAudioKey(say) === key) return { sure: other(first), guess: null };
      return { sure: null, guess: prompt ? other(quotedIn(prompt).at(-1) ?? null) : null };
    case 'speaking': {
      const m = prompt ? /\(([^()]+)\)\s*$/.exec(prompt) : null;
      return { sure: null, guess: other(m ? m[1]!.trim() : null) };
    }
    case 'writing': {
      const m = prompt ? /\bWrite:\s*(.+)$/.exec(prompt) : null;
      return { sure: null, guess: other(m ? unquoted(m[1]!) : prompt ? (quotedIn(prompt).at(-1) ?? null) : null) };
    }
    case 'multiple_choice': {
      if (!say || lessonAudioKey(say) !== key) return { sure: null, guess: null };
      const options = Array.isArray(p.options) ? p.options : [];
      const right = typeof p.correctIndex === 'number' ? str(options[p.correctIndex]) : null;
      // an item that asks what its line means says so in its right option
      if (p.ask === 'meaning') return { sure: other(right), guess: null };
      if (!prompt || !ASKS_WHAT_IT_SAYS.test(prompt)) return { sure: null, guess: null };
      return { sure: null, guess: other(right) };
    }
    default:
      return { sure: null, guess: null };
  }
}

/**
 * Where a game line's take is filed: the conversation line's key the importer recorded (`recording`), else the words'
 * own key. A recorded key that no longer matches these words under that conversation and part (the line was edited)
 * is not trusted.
 */
export function gameLineKey(ku: string, recording: unknown): { key: string; conversation: { id: string; part: number } | null } {
  const plain = lessonAudioKey(ku);
  if (typeof recording === 'string' && isConversationLineKey(recording)) {
    const [id = '', part = ''] = recording.split('\u2060');
    if (CONVERSATION_ID.test(id) && /^\d{1,2}$/.test(part) && conversationLineKey(id, Number(part), ku) === recording) {
      return { key: recording, conversation: { id, part: Number(part) } };
    }
  }
  return { key: plain, conversation: null };
}

// ---------- building the script ----------

interface Draft extends Omit<ScriptLine, 'voice' | 'speaker' | 'meaning' | 'seq' | 'live'> {
  planned: VoiceId | null;
  fallback: VoiceId;
  /** a part's character, kept even when the part's voice is a name of its own */
  partSpeaker: SpeakerId | null | undefined;
  sure: string | null;
  guesses: string[];
}

interface Entry {
  store: LineStore;
  key: string;
  text: string;
  dialect: ScriptDialect;
  planned: VoiceId | null;
  place: LinePlace;
  section: { id: string; label: string };
  sure?: string | null;
  guess?: string | null;
  hint?: string | null;
  cue?: string | null;
  conversation?: ScriptLine['conversation'];
  before?: ScriptLine['before'];
  partSpeaker?: SpeakerId | null;
}

class Builder {
  private readonly drafts = new Map<string, Draft>();
  private readonly order: Draft[] = [];

  add(e: Entry): void {
    if (e.key === '') return;
    const id = `${e.store}|${e.key}`;
    const found = this.drafts.get(id);
    if (found) {
      const same = found.places.find((p) => p.kind === e.place.kind && p.label === e.place.label);
      if (same) {
        if (STATUS_RANK[e.place.status] > STATUS_RANK[same.status]) same.status = e.place.status;
        same.ref ??= e.place.ref;
      } else {
        found.places.push(e.place);
      }
      found.planned ??= e.planned;
      found.sure ??= e.sure ?? null;
      if (e.guess) found.guesses.push(e.guess);
      found.conversation ??= e.conversation ?? null;
      if (found.partSpeaker === undefined && e.partSpeaker !== undefined) found.partSpeaker = e.partSpeaker;
      return;
    }
    const draft: Draft = {
      id,
      store: e.store,
      key: e.key,
      text: e.text,
      dialect: e.dialect,
      hint: e.hint ?? null,
      cue: e.cue ?? null,
      conversation: e.conversation ?? null,
      before: e.before ?? null,
      section: e.section,
      places: [e.place],
      planned: e.planned,
      fallback: NARRATOR[e.dialect],
      partSpeaker: e.partSpeaker,
      sure: e.sure ?? null,
      guesses: e.guess ? [e.guess] : [],
    };
    this.drafts.set(id, draft);
    this.order.push(draft);
  }

  finish(glossary: ReadonlyMap<string, string>): ScriptLine[] {
    // Every Kurdish line of the course; a guessed meaning that is one of these is Kurdish, not a meaning.
    const kurdish = new Set(this.order.map((d) => lessonAudioKey(d.text)));
    // Meanings stated somewhere; a story sentence or alphabet word learns its meaning from a lesson.
    const stated = new Map(glossary);
    for (const d of this.order) {
      const k = lessonAudioKey(d.text);
      if (d.sure && !stated.has(k)) stated.set(k, d.sure);
    }
    return this.order.map((d, seq) => {
      const voice = d.planned ?? d.fallback;
      const speaker = d.partSpeaker !== undefined ? d.partSpeaker : isSpeakerId(voice) ? voice : null;
      const guess = d.guesses.find((g) => !kurdish.has(lessonAudioKey(g))) ?? null;
      return {
        id: d.id,
        seq,
        store: d.store,
        key: d.key,
        text: d.text,
        dialect: d.dialect,
        voice,
        speaker,
        meaning: d.sure ?? stated.get(lessonAudioKey(d.text)) ?? guess,
        hint: d.hint,
        cue: d.cue,
        conversation: d.conversation,
        before: d.before,
        section: d.section,
        places: d.places,
        live: d.places.some((p) => p.status === 'published'),
      };
    });
  }
}

/** Road first, then other courses by slug; within a course by unit, skill and lesson, newest version first, then exercises. */
function courseOrder(a: ExerciseInput, b: ExerciseInput): number {
  const road = Number(b.courseSlug === ROAD_COURSE) - Number(a.courseSlug === ROAD_COURSE);
  return (
    road ||
    a.courseSlug.localeCompare(b.courseSlug) ||
    a.unitPosition - b.unitPosition ||
    a.skillPosition - b.skillPosition ||
    a.lessonPosition - b.lessonPosition ||
    b.version - a.version ||
    a.exercisePosition - b.exercisePosition
  );
}

function addLessons(builder: Builder, exercises: readonly ExerciseInput[], afterRoadChapter: (unit: number, section: { id: string; label: string }) => void = () => undefined): void {
  const sorted = [...exercises].sort(courseOrder);
  // a road chapter's story is listed right after the chapter's lessons, under the chapter
  let roadUnit: { n: number; section: { id: string; label: string } } | null = null;
  const closeRoadUnit = (): void => {
    if (roadUnit) afterRoadChapter(roadUnit.n, roadUnit.section);
    roadUnit = null;
  };
  // a lesson's number in its unit, counted across the unit's skills in course order
  const slots = new Map<string, string[]>();
  const ordinal = (ex: ExerciseInput): number => {
    const unit = `${ex.courseSlug}\u0000${ex.unitPosition}`;
    const slot = `${ex.skillPosition}:${ex.lessonPosition}`;
    let list = slots.get(unit);
    if (!list) slots.set(unit, (list = []));
    if (!list.includes(slot)) list.push(slot);
    return list.indexOf(slot) + 1;
  };

  for (const ex of sorted) {
    const dialect = dialectOf(ex.courseDialect);
    const prefix = ex.courseSlug === ROAD_COURSE ? '' : `${ex.courseTitle} · `;
    const lesson = `${prefix}Unit ${ex.unitPosition} · Lesson ${ordinal(ex)}`;
    const section = { id: `${ex.courseSlug}:${ex.unitPosition}`, label: `${prefix}Unit ${ex.unitPosition}${ex.unitTitle ? ` · ${ex.unitTitle}` : ''}` };
    const onRoad = ex.courseSlug === ROAD_COURSE;
    if (roadUnit && (!onRoad || roadUnit.n !== ex.unitPosition)) closeRoadUnit();
    if (onRoad && !roadUnit) roadUnit = { n: ex.unitPosition, section };
    const status = sourceStatus(ex.status);
    const ref = ex.lessonId ? { page: 'lessons' as const, id: ex.lessonId } : null;
    const p = isRecord(ex.payload) ? ex.payload : {};

    if (ex.type === 'conversation') {
      const lines = Array.isArray(p.lines) ? p.lines : [];
      const speakers = Array.isArray(p.speakers) ? p.speakers : [];
      const title = str(p.title);
      const nameOf = (part: unknown): string | null => {
        const who = typeof part === 'number' ? speakers[part] : undefined;
        if (!isRecord(who)) return null;
        // the learner's own line, which they say back: the one acted to
        if (who.learner === true) return 'You (the learner)';
        return isSpeakerId(who.character) ? characterName(who.character) : str(who.name);
      };
      for (const c of conversationClips(ex.payload)) {
        const voice = c.character ?? castVoice(c.name);
        const own = lines[c.index];
        const prev = c.index > 0 ? lines[c.index - 1] : undefined;
        // A road line is recorded once under its words, so a line the lesson taught is not recorded again for its scene.
        const plain = onRoad && c.character !== null;
        builder.add({
          store: 'lesson',
          key: plain ? lessonAudioKey(c.text) : c.key,
          text: c.text,
          dialect,
          planned: voice,
          partSpeaker: c.character,
          place: {
            kind: 'conversation',
            label: `${lesson} · conversation ${title ? `‘${title}’` : `(exercise ${ex.exercisePosition})`}, line ${c.index + 1}`,
            status,
            voice,
            ref,
          },
          section,
          sure: isRecord(own) ? str(own.en) : null,
          cue: plain && title ? `In the conversation ‘${title}’.` : null,
          conversation: plain ? null : { id: String(p.id), part: c.part, title, name: c.name },
          before:
            isRecord(prev) && typeof prev.text === 'string'
              ? { name: nameOf(prev.speaker), text: prev.text, meaning: str(prev.en) }
              : null,
        });
      }
      continue;
    }

    const planned = plannedVoice(ex.payload);
    const prompt = str(p.prompt);
    for (const text of lessonAudioTargets(ex.type, ex.payload)) {
      const meaning = exerciseMeaning(ex.type, ex.payload, text);
      builder.add({
        store: 'lesson',
        key: lessonAudioKey(text),
        text,
        dialect,
        planned,
        place: {
          kind: 'lesson',
          label: `${lesson} · exercise ${ex.exercisePosition} (${TYPE_LABEL[ex.type] ?? ex.type})`,
          status,
          voice: planned ?? NARRATOR[dialect],
          ref,
        },
        section,
        sure: meaning.sure,
        guess: meaning.guess,
        cue: prompt ? clip(prompt, 280) : null,
      });
    }
  }
  closeRoadUnit();
}

function addStories(builder: Builder, stories: readonly StoryInput[], chapterSection: { id: string; label: string } | null = null): void {
  for (const story of stories) {
    const dialect = dialectOf(story.dialect);
    // a road chapter's story is Hamo's, and listed with its chapter
    const hamo = story.slug !== undefined && roadStoryChapter(story.slug) !== null;
    const section = chapterSection ?? { id: `story:${story.id}`, label: `Story · ${story.title}` };
    const status = sourceStatus(story.status);
    let before: string | null = null;
    storyParagraphs(story.body).forEach((paragraph, p) => {
      let n = 0;
      for (const text of storyAudioSentences(paragraph)) {
        // a sentence no recording can hold is the editor's to split, as the studio leaves it out
        if (normalizeKurdish(text).length > LESSON_AUDIO_TEXT_MAX) continue;
        n += 1;
        builder.add({
          store: 'lesson',
          key: lessonAudioKey(text),
          text,
          dialect,
          planned: hamo ? 'hamo' : null,
          place: {
            kind: 'story',
            label: `${hamo ? 'Hamo’s story' : 'Story'} ‘${story.title}’ · paragraph ${p + 1}, sentence ${n}`,
            status,
            voice: hamo ? 'hamo' : NARRATOR[dialect],
            ref: { page: 'stories', id: story.id },
          },
          section,
          before: before ? { name: null, text: before, meaning: null } : null,
        });
        before = text;
      }
    });
  }
}

function groupTitle(group: AlphabetClipGroup): string {
  return ALPHABET_CLIP_GROUPS.find((g) => g.group === group)?.title ?? group;
}

function addClips(builder: Builder, clips: readonly AlphabetClip[], kind: 'words' | 'alphabet'): void {
  const area = kind === 'words' ? 'Word sets' : 'Alphabet';
  for (const c of clips) {
    const dialect: ScriptDialect = c.script === 'ckb' ? 'ckb' : 'kmr';
    const title = groupTitle(c.group);
    // a word set's word is shown as what it means (a colour, a number, a day); a letter as itself
    const shown = kind === 'words' && lessonAudioKey(c.letter) !== lessonAudioKey(c.say) ? c.letter : null;
    builder.add({
      store: 'alphabet',
      key: c.key,
      text: c.say,
      dialect,
      planned: null,
      place: { kind, label: `${area} · ${title} · ${c.letter}`, status: 'published', voice: NARRATOR[dialect], ref: null },
      section: { id: `${kind}:${c.group}`, label: `${area} · ${title}` },
      sure: shown,
      hint: c.hint ?? (c.group.endsWith('-word') ? `the example word for ${c.letter}` : null),
    });
  }
}

function addGames(builder: Builder, games: readonly GameInput[]): void {
  const rank = (kind: string): number => GAME_KINDS.indexOf(kind as (typeof GAME_KINDS)[number]);
  const sorted = games.filter((g) => rank(g.kind) >= 0 && g.status !== 'archived').sort((a, b) => rank(a.kind) - rank(b.kind));
  for (const row of sorted) {
    const kind = row.kind as (typeof GAME_KINDS)[number];
    const dialect: ScriptDialect = row.dialect === 'ckb' ? 'ckb' : 'kmr';
    const status = sourceStatus(row.status);
    const ref = { page: 'game-content' as const, id: row.id };
    const section = { id: `games:${kind}`, label: GAME_NAME[kind] };
    const p = isRecord(row.payload) ? row.payload : {};
    const en = (m: unknown): string | null => (isRecord(m) ? str(m.en) : null);
    const say = (
      ku: unknown,
      recording: unknown,
      planned: SpeakerId | null,
      label: string,
      extra: Pick<Entry, 'sure' | 'cue'>,
    ): void => {
      if (typeof ku !== 'string' || !sayable(ku)) return;
      const found = gameLineKey(ku, recording);
      // a road conversation's lines are recorded under their words (see addLessons), and so is a card copied from one
      const { key, conversation } = found.conversation?.id.startsWith('road') ? { key: lessonAudioKey(ku), conversation: null } : found;
      const voice = planned ?? NARRATOR[dialect];
      builder.add({
        store: 'lesson',
        key,
        text: ku,
        dialect,
        planned,
        place: { kind: 'game', label, status, voice, ref },
        section,
        conversation: conversation ? { ...conversation, title: null, name: null } : null,
        ...extra,
      });
    };

    if (kind === 'case_file') {
      const title = en(p.title);
      const suspects = new Map(
        (Array.isArray(p.suspects) ? p.suspects : []).filter(isRecord).map((s) => [String(s.id), str(s.name) ?? String(s.id)]),
      );
      const evidence = Array.isArray(p.evidence) ? p.evidence.filter(isRecord) : [];
      evidence.forEach((e, i) => {
        const from = typeof e.from === 'string' ? suspects.get(e.from) : undefined;
        const label = [GAME_NAME.case_file, title ? `case ‘${clip(title, 60)}’` : 'a case', `${str(e.kind) ?? 'evidence'} ${i + 1}`].join(' · ');
        say(e.ku, e.recording, isSpeakerId(e.speaker) ? e.speaker : null, label, { sure: en(e.meanings), cue: from ? `From ${from}.` : null });
      });
    } else {
      // Every question of the deck in both varieties: the asking player reads it aloud, and the recording is its model.
      say(p.ku, undefined, null, `${GAME_NAME.question_template} · a question the player reads out loud`, { sure: en(p.meanings) });
    }
  }
}

/**
 * The whole script, every voice's lines in course order: lessons unit by unit (the Kurmanji Road first, conversations
 * line by line), then stories by paragraph and sentence, word sets, the alphabet and the learning games.
 */
export function buildScript(input: ScriptInput): ScriptLine[] {
  const builder = new Builder();
  const chapterOf = (s: StoryInput): number | null => (s.slug !== undefined ? roadStoryChapter(s.slug) : null);
  const told = new Set<string>();
  addLessons(builder, input.exercises, (unit, section) => {
    const theirs = input.stories.filter((s) => chapterOf(s) === unit);
    for (const s of theirs) told.add(s.id);
    addStories(builder, theirs, section);
  });
  // the rest, and a chapter's story whose chapter has no lessons here
  addStories(
    builder,
    input.stories.filter((s) => !told.has(s.id)),
  );
  addClips(builder, input.words ?? WORD_SET_CLIPS, 'words');
  addClips(builder, input.letters ?? LETTER_CLIPS, 'alphabet');
  addGames(builder, input.games);
  const glossary = new Map<string, string>();
  for (const w of input.plan.words) {
    const key = lessonAudioKey(w.ku);
    if (key && w.en && !glossary.has(key)) glossary.set(key, w.en);
  }
  return builder.finish(glossary);
}

/**
 * Everyone who lends a voice: the plan's characters in plan order (with or without lines), other characters lines
 * are planned for, uncast conversation parts by name, then a narrator per variety.
 */
export function peopleOf(lines: readonly ScriptLine[], plan: PlanInput): Person[] {
  const voices = new Set(lines.map((l) => l.voice));
  const out: Person[] = [];
  const character = (id: SpeakerId): Person => ({ id, kind: 'character', speaker: id, name: characterName(id), about: plan.about[id] ?? null, dialect: null });
  for (const id of plan.characters) out.push(character(id));
  for (const id of SPEAKERS) if (!plan.characters.includes(id) && voices.has(id)) out.push(character(id));
  const cast = new Map<VoiceId, string>();
  for (const l of lines) {
    if (l.voice.startsWith('cast-') && !cast.has(l.voice)) cast.set(l.voice, l.conversation?.name ?? l.voice.slice(5).replace(/-/g, ' '));
  }
  for (const [id, name] of cast) out.push({ id, kind: 'cast', speaker: null, name, about: 'A part in a conversation that none of the characters plays.', dialect: null });
  for (const dialect of ['kmr', 'ckb'] as const) {
    out.push({
      id: NARRATOR[dialect],
      kind: 'narrator',
      speaker: null,
      name: `Narrator · ${DIALECT_NAME[dialect]}`,
      about: `The words, the alphabet, the stories and every line no character says, in ${DIALECT_NAME[dialect]}.`,
      dialect,
    });
  }
  return out;
}

/** What is recorded and what is not among `lines`, in all and by variety. */
export function tally(lines: readonly ScriptLine[], done: (line: ScriptLine) => boolean): Tally & { dialects: Array<Tally & { dialect: ScriptDialect }> } {
  const by = new Map<ScriptDialect, Tally>();
  let total = 0;
  let recorded = 0;
  for (const l of lines) {
    const t = by.get(l.dialect) ?? { total: 0, done: 0, todo: 0 };
    t.total += 1;
    total += 1;
    if (done(l)) {
      t.done += 1;
      recorded += 1;
    } else t.todo += 1;
    by.set(l.dialect, t);
  }
  const dialects = (['kmr', 'ckb'] as const).flatMap((dialect) => {
    const t = by.get(dialect);
    return t ? [{ dialect, ...t }] : [];
  });
  return { total, done: recorded, todo: total - recorded, dialects };
}

export interface LineFilter {
  voice: VoiceId;
  dialect?: ScriptDialect | null;
  status?: LineStatusFilter;
}

/** One voice's lines in script order, filtered by variety and recorded status. */
export function linesFor(lines: readonly ScriptLine[], filter: LineFilter, done: (line: ScriptLine) => boolean): ScriptLine[] {
  const status = filter.status ?? 'all';
  return lines.filter(
    (l) =>
      l.voice === filter.voice &&
      (!filter.dialect || l.dialect === filter.dialect) &&
      (status === 'all' || (status === 'done') === done(l)),
  );
}

/** The page after `cursor` (the previous page's last `seq`): its lines and the next cursor, null at the end. */
export function pageAfter<T extends Pick<ScriptLine, 'seq'>>(lines: readonly T[], cursor: number | null, limit: number): { lines: T[]; next: number | null } {
  const from = cursor === null ? 0 : lines.findIndex((l) => l.seq > cursor);
  if (from === -1) return { lines: [], next: null };
  const page = lines.slice(from, from + limit);
  const more = from + limit < lines.length;
  return { lines: page, next: more && page.length > 0 ? page[page.length - 1]!.seq : null };
}

/** The headings a voice's lines fall under, in order, with their recorded counts, for the unit filter. */
export function sectionsOf(lines: readonly ScriptLine[], done: (line: ScriptLine) => boolean): Array<{ id: string; label: string } & Tally> {
  const out = new Map<string, { id: string; label: string } & Tally>();
  for (const l of lines) {
    const s = out.get(l.section.id) ?? { ...l.section, total: 0, done: 0, todo: 0 };
    s.total += 1;
    if (done(l)) s.done += 1;
    else s.todo += 1;
    out.set(l.section.id, s);
  }
  return [...out.values()];
}
