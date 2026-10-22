/**
 * The Lessons page as data: what the API sends, an exercise's blank form per
 * type, and the checks an exercise must pass — the same limits as the server's
 * payload schemas (api/src/content/exercises.ts), said in words, so a draft is
 * not sent only to come back refused. The server still decides.
 */
import { CONVERSATION_LIMITS as CONV, SPEAKERS, lessonAudioKey, normalizeKurdish } from '@kurda/shared';

export type ContentStatus = 'draft' | 'in_review' | 'published' | 'archived';

export const EXERCISE_TYPES = ['multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking', 'writing', 'conversation'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const TYPE_NAME: Record<ExerciseType, string> = {
  multiple_choice: 'Multiple choice',
  translate: 'Translate',
  match_pairs: 'Match pairs',
  listening: 'Listening',
  speaking: 'Speaking',
  writing: 'Writing',
  conversation: 'Conversation',
};

export const TYPE_HINT: Record<ExerciseType, string> = {
  multiple_choice: 'A question with 2–6 answers, one of them right.',
  translate: 'Translate a sentence; any of the accepted answers counts.',
  match_pairs: 'Join 2–8 pairs, Kurdish on the left.',
  listening: 'Hear Kurdish and write it down.',
  speaking: 'Say a sentence aloud, then compare it with the native recording.',
  writing: 'Write a longer answer; any of the accepted answers counts.',
  conversation: 'Two to four people talk, line by line; learners read and listen, then answer a question about it. Each part is recorded by its own person.',
};

export const STATUS_NAME: Record<ContentStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
  archived: 'Archived',
};

/** GET /admin/content/lessons — one row per lesson slot. */
export interface LessonRow {
  id: string;
  skillId: string;
  position: number;
  version: number;
  status: ContentStatus;
  titleKu: string;
  titleEn: string;
  exerciseCount: number;
  createdAt: string;
  publishedAt: string | null;
  liveId: string | null;
  course: { id: string; title: string };
  unit: { id: string; title: string; position: number };
  skill: { id: string; title: string; position: number };
}

export interface SkillOption {
  id: string;
  titleEn: string;
  titleKu: string;
  unitTitle: string;
  courseTitle: string;
  nextPosition: number;
}

export interface LessonList {
  lessons: LessonRow[];
  skills: SkillOption[];
  total: number;
}

export type Payload = Record<string, unknown>;

export interface Exercise {
  position: number;
  type: ExerciseType;
  payload: Payload;
}

/** GET /admin/content/lessons/:id */
export interface LessonDetail {
  id: string;
  skillId: string;
  position: number;
  version: number;
  status: ContentStatus;
  titleKu: string;
  titleEn: string;
  lockVersion: number;
  exercises: Exercise[];
  skillTitle?: string;
  unitTitle?: string;
  courseTitle?: string;
}

export interface Issue {
  path: string;
  message: string;
}

/** Where a lesson's sentences are in the audio studio. */
export function recordHref(lesson: { skillId: string; position: number }, missingOnly = false): string {
  return `#/audio/lessons?lesson=${encodeURIComponent(`${lesson.skillId}:${lesson.position}`)}${missingOnly ? '&show=missing' : ''}`;
}

/**
 * A new conversation's id: what its lines' recordings are filed under, kept by
 * every later version of the lesson. Random, so two conversations written at
 * once by two people never share recordings.
 */
export function newConversationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `c${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('')}`.slice(0, 14);
}

/** A new exercise of a type, keeping what carries over from the one it replaces (its prompt, its "say"). */
export function blankPayload(type: ExerciseType, from: Payload = {}): Payload {
  const prompt = typeof from.prompt === 'string' ? from.prompt : '';
  const say = typeof from.say === 'string' && from.say ? { say: from.say } : {};
  switch (type) {
    case 'conversation':
      // two people to start, a woman and a man, each with a line: the smallest conversation there is
      return {
        id: typeof from.id === 'string' && from.id ? from.id : newConversationId(),
        title: '',
        speakers: [
          { name: '', character: 'xezo' },
          { name: '', character: 'hamo' },
        ],
        lines: [
          { speaker: 0, text: '', en: '' },
          { speaker: 1, text: '', en: '' },
        ],
        prompt,
        options: ['', ''],
        correctIndex: 0,
      };
    case 'multiple_choice':
      return { ...say, prompt, options: ['', ''], correctIndex: 0 };
    case 'translate':
      return { ...say, prompt, accepted: [''] };
    case 'match_pairs':
      return { ...say, pairs: [{ left: '', right: '' }, { left: '', right: '' }] };
    case 'listening':
      return { ...say, accepted: [''] };
    case 'speaking':
      return { ...say, prompt, reference: '' };
    case 'writing':
      return { ...say, prompt, accepted: [''] };
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);

/** The limits of the server's schemas, said as an editor would want them. */
export function exerciseIssues(ex: Exercise): Issue[] {
  const p = ex.payload;
  const out: Issue[] = [];
  const need = (field: string, label: string, max: number): void => {
    const v = str(p[field]).trim();
    if (!v) out.push({ path: field, message: `${label} is needed.` });
    else if (v.length > max) out.push({ path: field, message: `${label} is longer than ${max} characters.` });
  };
  const list = (field: string, label: string, min: number, maxItems: number, maxLen: number): void => {
    const items = strings(p[field]);
    const filled = items.filter((s) => s.trim());
    if (filled.length < min) out.push({ path: field, message: min === 1 ? `Add at least one ${label}.` : `Add at least ${min} ${label}s.` });
    if (items.length > maxItems) out.push({ path: field, message: `At most ${maxItems} ${label}s.` });
    items.forEach((s, i) => {
      if (!s.trim()) out.push({ path: `${field}.${i}`, message: `This ${label} is empty: fill it in or remove it.` });
      else if (s.length > maxLen) out.push({ path: `${field}.${i}`, message: `Longer than ${maxLen} characters.` });
    });
  };
  if (str(p.say).length > 300) out.push({ path: 'say', message: '“Say” is longer than 300 characters.' });
  switch (ex.type) {
    case 'multiple_choice': {
      need('prompt', 'The question', 500);
      list('options', 'answer', 2, 6, 200);
      const n = strings(p.options).length;
      const right = typeof p.correctIndex === 'number' ? p.correctIndex : -1;
      if (right < 0 || right >= n) out.push({ path: 'correctIndex', message: 'Choose which answer is right.' });
      break;
    }
    case 'translate':
      need('prompt', 'The sentence to translate', 500);
      list('accepted', 'accepted answer', 1, 12, 300);
      break;
    case 'writing':
      need('prompt', 'The task', 500);
      list('accepted', 'accepted answer', 1, 12, 500);
      break;
    case 'listening':
      list('accepted', 'accepted transcription', 1, 12, 300);
      if (str(p.prompt).length > 500) out.push({ path: 'prompt', message: 'The hint is longer than 500 characters.' });
      break;
    case 'speaking':
      need('prompt', 'The instruction', 500);
      need('reference', 'The sentence to say', 300);
      break;
    case 'conversation':
      conversationIssues(p, out);
      break;
    case 'match_pairs': {
      const pairs = Array.isArray(p.pairs) ? (p.pairs as Array<Record<string, unknown>>) : [];
      if (pairs.length < 2) out.push({ path: 'pairs', message: 'Add at least 2 pairs.' });
      if (pairs.length > 8) out.push({ path: 'pairs', message: 'At most 8 pairs.' });
      pairs.forEach((pair, i) => {
        for (const side of ['left', 'right'] as const) {
          const v = str(pair?.[side]).trim();
          if (!v) out.push({ path: `pairs.${i}.${side}`, message: `Pair ${i + 1}: the ${side} side is empty.` });
          else if (v.length > 120) out.push({ path: `pairs.${i}.${side}`, message: `Pair ${i + 1}: longer than 120 characters.` });
        }
      });
      break;
    }
  }
  return out;
}

/** A conversation's checks: the server's (api/src/content/exercises.ts), in the words an editor needs. */
function conversationIssues(p: Payload, out: Issue[]): void {
  const speakers = Array.isArray(p.speakers) ? (p.speakers as Array<Record<string, unknown>>) : [];
  const lines = Array.isArray(p.lines) ? (p.lines as Array<Record<string, unknown>>) : [];
  if (str(p.title).length > CONV.titleMax) out.push({ path: 'title', message: `The title is longer than ${CONV.titleMax} characters.` });
  if (speakers.length < CONV.speakersMin) out.push({ path: 'speakers', message: 'A conversation needs at least two people.' });
  if (speakers.length > CONV.speakersMax) out.push({ path: 'speakers', message: `At most ${CONV.speakersMax} people.` });
  const names = new Set<string>();
  speakers.forEach((s, i) => {
    const name = normalizeKurdish(str(s.name)).toLowerCase();
    if (!name) out.push({ path: `speakers.${i}.name`, message: `Person ${i + 1} needs a name.` });
    else if (name.length > CONV.nameMax) out.push({ path: `speakers.${i}.name`, message: `Person ${i + 1}: the name is longer than ${CONV.nameMax} characters.` });
    else if (names.has(name)) out.push({ path: `speakers.${i}.name`, message: `Two people are called “${str(s.name).trim()}”: whoever records it must know which is theirs.` });
    names.add(name);
    if (name && !lines.some((l) => l.speaker === i)) out.push({ path: `speakers.${i}`, message: `${str(s.name).trim()} says nothing: give them a line or remove them.` });
  });
  if (lines.length < CONV.linesMin) out.push({ path: 'lines', message: 'Add at least two lines.' });
  if (lines.length > CONV.linesMax) out.push({ path: 'lines', message: `At most ${CONV.linesMax} lines.` });
  lines.forEach((l, i) => {
    const text = str(l.text);
    if (typeof l.speaker !== 'number' || l.speaker < 0 || l.speaker >= speakers.length) out.push({ path: `lines.${i}.speaker`, message: `Line ${i + 1}: choose who says it.` });
    if (!lessonAudioKey(text)) out.push({ path: `lines.${i}.text`, message: `Line ${i + 1} is empty: write what is said, or remove it.` });
    else if (text.length > CONV.lineMax) out.push({ path: `lines.${i}.text`, message: `Line ${i + 1} is longer than ${CONV.lineMax} characters: one recording holds one or two sentences.` });
    if (str(l.en).length > CONV.translationMax) out.push({ path: `lines.${i}.en`, message: `Line ${i + 1}: the meaning is longer than ${CONV.translationMax} characters.` });
  });
  if (!str(p.prompt).trim()) out.push({ path: 'prompt', message: 'The question about the conversation is needed.' });
  else if (str(p.prompt).length > CONV.promptMax) out.push({ path: 'prompt', message: `The question is longer than ${CONV.promptMax} characters.` });
  const options = strings(p.options);
  if (options.filter((o) => o.trim()).length < CONV.optionsMin) out.push({ path: 'options', message: 'Add at least 2 answers.' });
  if (options.length > CONV.optionsMax) out.push({ path: 'options', message: `At most ${CONV.optionsMax} answers.` });
  options.forEach((o, i) => {
    if (!o.trim()) out.push({ path: `options.${i}`, message: 'This answer is empty: fill it in or remove it.' });
    else if (o.length > CONV.optionMax) out.push({ path: `options.${i}`, message: `Longer than ${CONV.optionMax} characters.` });
  });
  const right = typeof p.correctIndex === 'number' ? p.correctIndex : -1;
  if (right < 0 || right >= options.length) out.push({ path: 'correctIndex', message: 'Choose which answer is right.' });
}

/** A conversation as it is sent: optional parts left out when empty (the schema refuses an empty title, meaning or character). */
function conversationForSave(p: Payload): Payload {
  const t = (v: unknown): string => str(v).trim();
  const speakers = (Array.isArray(p.speakers) ? (p.speakers as Array<Record<string, unknown>>) : []).map((s) => ({
    name: t(s.name),
    ...((SPEAKERS as readonly string[]).includes(str(s.character)) ? { character: s.character } : {}),
  }));
  const lines = (Array.isArray(p.lines) ? (p.lines as Array<Record<string, unknown>>) : []).map((l) => ({
    speaker: l.speaker,
    text: t(l.text),
    ...(t(l.en) ? { en: t(l.en) } : {}),
  }));
  return {
    id: p.id,
    ...(t(p.title) ? { title: t(p.title) } : {}),
    speakers,
    lines,
    prompt: t(p.prompt),
    options: strings(p.options).map((o) => o.trim()),
    correctIndex: p.correctIndex,
  };
}

/**
 * What is sent: positions 1, 2, 3… in the order on screen, text trimmed, and
 * optional fields left out when empty (the schemas refuse an empty string
 * where they allow none at all).
 */
export function forSave(exercises: readonly Exercise[]): Exercise[] {
  const trim = (x: unknown): unknown =>
    typeof x === 'string'
      ? x.trim()
      : x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))
        : x;
  return exercises.map((ex, i) => {
    if (ex.type === 'conversation') return { position: i + 1, type: ex.type, payload: conversationForSave(ex.payload) };
    const payload: Payload = {};
    for (const [k, v] of Object.entries(ex.payload)) {
      if (v === undefined || (k === 'strict' && v === false)) continue;
      if (typeof v === 'string') {
        const t = v.trim();
        const optional = k === 'say' || k === 'audioUrl' || (k === 'prompt' && ex.type === 'listening');
        if (!t && optional) continue;
        payload[k] = t;
      } else {
        payload[k] = Array.isArray(v) ? v.map(trim) : v;
      }
    }
    return { position: i + 1, type: ex.type, payload };
  });
}

/**
 * The server's issues for one exercise (`exercises[2].payload.prompt`, or
 * `exercises[2].prompt` as the update route words them), as paths inside it.
 */
export function issuesFor(issues: readonly Issue[], index: number): Issue[] {
  const head = `exercises[${index}]`;
  return issues
    .filter((i) => i.path === head || i.path.startsWith(`${head}.`))
    .map((i) => ({ path: i.path.slice(head.length).replace(/^\./, '').replace(/^payload\.?/, ''), message: i.message }));
}

/** Whether two drafts differ in anything a save would send. */
export function sameDraft(a: { titleKu: string; titleEn: string; exercises: readonly Exercise[] }, b: { titleKu: string; titleEn: string; exercises: readonly Exercise[] }): boolean {
  return (
    a.titleKu.trim() === b.titleKu.trim() &&
    a.titleEn.trim() === b.titleEn.trim() &&
    JSON.stringify(forSave(a.exercises)) === JSON.stringify(forSave(b.exercises))
  );
}

/** Read exercises written as JSON (the advanced editor): an array of { type, payload }. */
export function parseExercisesJson(text: string): { ok: true; exercises: Exercise[] } | { ok: false; problem: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, problem: `That is not valid JSON: ${(err as Error).message}` };
  }
  if (!Array.isArray(raw)) return { ok: false, problem: 'The exercises must be a JSON array: [ { "type": …, "payload": { … } } ].' };
  const out: Exercise[] = [];
  for (const [i, e] of raw.entries()) {
    const ex = e as { type?: unknown; payload?: unknown };
    if (!EXERCISE_TYPES.includes(ex?.type as ExerciseType)) {
      return { ok: false, problem: `Exercise ${i + 1} has no known type. Use one of: ${EXERCISE_TYPES.join(', ')}.` };
    }
    if (!ex.payload || typeof ex.payload !== 'object' || Array.isArray(ex.payload)) {
      return { ok: false, problem: `Exercise ${i + 1} needs a payload object.` };
    }
    out.push({ position: i + 1, type: ex.type as ExerciseType, payload: ex.payload as Payload });
  }
  return { ok: true, exercises: out };
}
