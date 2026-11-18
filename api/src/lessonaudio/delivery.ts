import type pg from 'pg';
import { conversationLineKey, isSpeakerId, lessonAudioKey, primaryAudioTarget, shownInPrompt, type RecordingVoice, type SpeakerId } from '@kurda/shared';
import type { ExerciseType } from '../content/repository.js';
import { voiceColumns, voiceOf, type VoiceRow } from '../speakers/voice.js';

type Executor = Pick<pg.Pool, 'query'>;

/** What a delivery reads of a recording: its URL and its voice, with the words and length it says them in. */
const RECORDING_COLUMNS = `url, text, duration_ms, ${voiceColumns()}`;

type RecordingRow = { url: string; text: string; duration_ms: number } & VoiceRow;

/** Its voice, with a timeline made from its words when a speaker has none stored. */
function voiceOfRecording(row: RecordingRow): RecordingVoice | undefined {
  return voiceOf(row, { text: row.text, durationMs: row.duration_ms });
}

/**
 * The studio recordings a delivered exercise carries; only fields with a recording are set. Each voice (who is shown
 * saying it and the mouth's timeline) travels only beside its URL, under the URL's exact rules, so it reveals
 * nothing the URL could not.
 */
export interface DeliveredAudio {
  /** Listening: the clip to play, the studio's recording of the transcription or else the payload's own clip. */
  audioUrl?: string;
  /** who says `audioUrl` */
  audioVoice?: RecordingVoice;
  /**
   * A native speaker saying the item's primary text, sent with the item only when hearing it first gives nothing away:
   * on listening and speaking, and where the Kurdish is already in the prompt, unless a listening item in the same
   * response plays the same recording. Its presence tells the client it may play it at once. Where the text is the
   * answer it comes with the grading instead (`modelAudioAfterAnswer`).
   */
  modelAudioUrl?: string;
  /** who says `modelAudioUrl` */
  modelAudioVoice?: RecordingVoice;
  /** recordings of the cards a match-pairs item shows, by the exact text on the card */
  audio?: Record<string, string>;
  /** Who says the cards' recordings, keyed by text, for cards whose recording has a character. */
  audioVoices?: Record<string, RecordingVoice>;
  /**
   * A conversation's recordings, one per line by place, null where not recorded. The lines are on screen in full, and
   * a line's recording is filed under its conversation and part, so its URL never matches another item's.
   */
  lineAudio?: Array<string | null>;
  /** Who says each line's recording, null where none: always the part's character, with the recording's own timeline. */
  lineVoices?: Array<RecordingVoice | null>;
}

interface Plan {
  listening: string | null;
  primary: string | null;
  /** the primary text's recording may travel with the item, before it is answered */
  modelBeforeAnswer: boolean;
  /** Keys whose recording this item sends before the answer and which are the answer: a listening clip. */
  answerBearing: string[];
  /** [text as shown, its key] */
  shown: Array<[string, string]>;
  /** a conversation's line keys, by the line's place ('' for a line with nothing to file) */
  lines: string[];
  /** the character playing each line's part, by the line's place */
  cast: Array<SpeakerId | null>;
}

function keyOf(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const key = lessonAudioKey(text);
  return key === '' ? null : key;
}

function keysOf(texts: unknown): string[] {
  return Array.isArray(texts) ? texts.map(keyOf).filter((k): k is string => k !== null) : [];
}

/**
 * Whether the model may play before the learner answers. Listening and speaking: yes, hearing it is the exercise.
 * Translate, writing and multiple choice: only when the text is already in the prompt and is none of the answers;
 * a model of the answer would say it aloud, and its content-addressed URL could match a match-pairs card that names
 * it. A model the prompt does not show is held back even when it is no option verbatim, since only the author knows
 * how close it is.
 */
function modelBeforeAnswer(type: ExerciseType, p: Record<string, unknown>, primary: string): boolean {
  switch (type) {
    case 'listening':
    case 'speaking':
      return true;
    case 'multiple_choice':
      return shownInPrompt(p.prompt, primary) && !keysOf(p.options).includes(primary);
    case 'translate':
    case 'writing':
      return shownInPrompt(p.prompt, primary) && !keysOf(p.accepted).includes(primary);
    default:
      return false;
  }
}

/**
 * Which recordings an exercise could use, as keys. The `audio` map is keyed by the text itself, so it holds only
 * texts the learner already sees that give nothing away: match-pairs' left-hand cards. Answers, transcriptions and a
 * multiple-choice `say` travel only as `modelAudioUrl`, a URL with no text in it, when `modelBeforeAnswer` allows.
 */
function planFor(type: ExerciseType, payload: unknown): Plan {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  const shown: Array<[string, string]> = [];
  if (type === 'match_pairs' && Array.isArray(p.pairs)) {
    for (const pair of p.pairs as Array<{ left?: unknown }>) {
      const key = keyOf(pair?.left);
      if (key) shown.push([pair.left as string, key]);
    }
  }
  const listening = type === 'listening' && Array.isArray(p.accepted) ? keyOf(p.accepted[0]) : null;
  const primary = keyOf(primaryAudioTarget(type, payload));
  return {
    listening,
    primary,
    modelBeforeAnswer: primary !== null && modelBeforeAnswer(type, p, primary),
    answerBearing: type === 'listening' ? [listening, primary].filter((k): k is string => k !== null) : [],
    shown,
    lines: type === 'conversation' ? lineKeys(p) : [],
    cast: type === 'conversation' ? lineCast(p) : [],
  };
}

/** Each line's key, by its place: '' for one too malformed to file. */
function lineKeys(p: Record<string, unknown>): string[] {
  if (typeof p.id !== 'string' || !Array.isArray(p.lines)) return [];
  return (p.lines as Array<{ speaker?: unknown; text?: unknown }>).map((line) =>
    typeof line?.speaker === 'number' && typeof line.text === 'string' ? conversationLineKey(p.id as string, line.speaker, line.text) : '',
  );
}

/** Who plays each line's part, by its place: null where its part has no character. */
function lineCast(p: Record<string, unknown>): Array<SpeakerId | null> {
  if (!Array.isArray(p.lines)) return [];
  const speakers = Array.isArray(p.speakers) ? (p.speakers as Array<{ character?: unknown } | null>) : [];
  return (p.lines as Array<{ speaker?: unknown }>).map((line) => {
    const character = typeof line?.speaker === 'number' ? speakers[line.speaker]?.character : undefined;
    return isSpeakerId(character) ? character : null;
  });
}

/**
 * The recordings for a batch of exercises in order, from one query, spread over each sanitized exercise (only fields
 * with a recording are set, so a listening item keeps its own clip when the studio has none). A recording that
 * travels beside the text it says is withheld when a listening item in the same response plays the same recording,
 * or it would name the transcription; it still comes with the grading.
 */
export async function lessonAudioFor(
  db: Executor,
  exercises: ReadonlyArray<{ type: ExerciseType; payload: unknown }>,
): Promise<DeliveredAudio[]> {
  const plans = exercises.map((ex) => planFor(ex.type, ex.payload));
  const heardAsAnswer = new Set(plans.flatMap((plan) => plan.answerBearing));
  const cardKey = (key: string): boolean => !heardAsAnswer.has(key);
  // a listening item's own model is its clip, which names nothing
  const modelKey = (plan: Plan): string | null =>
    plan.primary !== null && plan.modelBeforeAnswer && (plan.answerBearing.includes(plan.primary) || cardKey(plan.primary))
      ? plan.primary
      : null;

  const keys = new Set<string>();
  for (const plan of plans) {
    if (plan.listening) keys.add(plan.listening);
    const model = modelKey(plan);
    if (model) keys.add(model);
    for (const [, key] of plan.shown) if (cardKey(key)) keys.add(key);
    for (const key of plan.lines) if (key) keys.add(key);
  }
  if (keys.size === 0) return plans.map(() => ({}));

  const { rows } = await db.query<RecordingRow & { key: string }>(
    `SELECT key, ${RECORDING_COLUMNS} FROM lesson_audio WHERE key = ANY($1::text[])`,
    [[...keys]],
  );
  const urls = new Map(rows.map((r) => [r.key, r.url]));
  // A line's take is its own recording, but the same file uploaded as a listening clip has the same URL, and the
  // line's text beside it would name the transcription.
  const heardUrls = new Set(plans.map((plan) => (plan.listening ? urls.get(plan.listening) : undefined)).filter((u): u is string => !!u));
  const lineUrl = (key: string): string | undefined => {
    const url = key ? urls.get(key) : undefined;
    return url && !heardUrls.has(url) ? url : undefined;
  };
  const voices = new Map<string, RecordingVoice>();
  for (const r of rows) {
    const voice = voiceOfRecording(r);
    if (voice) voices.set(r.key, voice);
  }

  return plans.map((plan) => {
    const out: DeliveredAudio = {};
    const listening = plan.listening ? urls.get(plan.listening) : undefined;
    if (listening) {
      out.audioUrl = listening;
      const voice = voices.get(plan.listening!);
      if (voice) out.audioVoice = voice;
    }
    const modelAt = modelKey(plan);
    const model = modelAt ? urls.get(modelAt) : undefined;
    if (model) {
      out.modelAudioUrl = model;
      const voice = voices.get(modelAt!);
      if (voice) out.modelAudioVoice = voice;
    }
    const audio: Record<string, string> = {};
    const audioVoices: Record<string, RecordingVoice> = {};
    for (const [text, key] of plan.shown) {
      const url = cardKey(key) ? urls.get(key) : undefined;
      if (!url) continue;
      audio[text] = url;
      const voice = voices.get(key);
      if (voice) audioVoices[text] = voice;
    }
    if (Object.keys(audio).length > 0) out.audio = audio;
    if (Object.keys(audioVoices).length > 0) out.audioVoices = audioVoices;
    if (plan.lines.some((key) => lineUrl(key))) {
      out.lineAudio = plan.lines.map((key) => lineUrl(key) ?? null);
      out.lineVoices = plan.lines.map((key, i) => {
        if (!lineUrl(key)) return null;
        const voice = voices.get(key) ?? null;
        const who = plan.cast[i];
        return who ? { ...voice, speaker: who } : voice;
      });
    }
    return out;
  });
}

/** The model a grading result carries, to spread over it: nothing when there is none. */
export interface ModelAudio {
  modelAudioUrl?: string;
  /** who says it, when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
}

/**
 * The model to play once an item is answered: the native recording of its primary text and who says it, for every
 * item with one, so clients can play it after every answer. Empty when unrecorded or with no primary text.
 */
export async function modelAudioAfterAnswer(db: Executor, type: ExerciseType, payload: unknown): Promise<ModelAudio> {
  const key = keyOf(primaryAudioTarget(type, payload));
  if (!key) return {};
  const { rows } = await db.query<RecordingRow>(`SELECT ${RECORDING_COLUMNS} FROM lesson_audio WHERE key = $1`, [key]);
  const row = rows[0];
  if (!row) return {};
  const voice = voiceOfRecording(row);
  return voice ? { modelAudioUrl: row.url, modelAudioVoice: voice } : { modelAudioUrl: row.url };
}
