import type pg from 'pg';
import { lessonAudioKey, primaryAudioTarget, type RecordingVoice } from '@kurda/shared';
import type { ExerciseType } from '../content/repository.js';
import { voiceColumns, voiceOf, type VoiceRow } from '../speakers/voice.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * What a delivered exercise carries of the studio's recordings. Only the
 * fields that have a recording are set.
 *
 * Each recording's voice (who is shown saying it, and the mouth's timeline)
 * travels beside its URL, only where the URL does and only when a character
 * is chosen for it. It follows the URL's rules exactly, so it can give away
 * nothing the URL could not: a card held back because a listening item plays
 * the same recording is held back with its voice.
 */
export interface DeliveredAudio {
  /** listening: the clip to play — the studio's recording of the transcription, else the payload's own clip */
  audioUrl?: string;
  /** who says `audioUrl` */
  audioVoice?: RecordingVoice;
  /**
   * A native speaker saying the item's primary text (`primaryAudioTarget`),
   * sent with the item only when hearing it before answering gives nothing
   * away: on listening and speaking, where hearing it is the exercise, and on
   * an item whose Kurdish is already in its prompt ("Sê" çend e?), unless a
   * listening item in the same response plays the same recording. Its
   * presence is what tells a client it may play it straight away. Where the
   * text is the answer — a translation, the right option — it comes back with
   * the grading instead (`modelAudioAfterAnswer`).
   */
  modelAudioUrl?: string;
  /** who says `modelAudioUrl` */
  modelAudioVoice?: RecordingVoice;
  /** recordings of the cards a match-pairs item shows, by the exact text on the card */
  audio?: Record<string, string>;
  /** who says the cards' recordings, by the same text: only the cards whose recording has a character */
  audioVoices?: Record<string, RecordingVoice>;
}

interface Plan {
  listening: string | null;
  primary: string | null;
  /** the primary text's recording may travel with the item, before it is answered */
  modelBeforeAnswer: boolean;
  /** keys this item sends a recording of before the answer, and that recording is the answer: a listening clip */
  answerBearing: string[];
  /** [text as shown, its key] */
  shown: Array<[string, string]>;
}

function keyOf(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const key = lessonAudioKey(text);
  return key === '' ? null : key;
}

function keysOf(texts: unknown): string[] {
  return Array.isArray(texts) ? texts.map(keyOf).filter((k): k is string => k !== null) : [];
}

/** a letter, a mark or a digit — or the ZWNJ, which sits inside a Soranî word */
const WORD = String.raw`[\p{L}\p{M}\p{N}‌]`;

/** Whether `key` stands as whole words in what the prompt shows, once keyed the same way. */
function shownIn(prompt: unknown, key: string): boolean {
  if (typeof prompt !== 'string') return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(?<!${WORD})${escaped}(?!${WORD})`, 'u').test(lessonAudioKey(prompt));
}

/**
 * Whether the model may be played before the learner answers.
 *
 * Listening and speaking: yes — hearing it is the exercise, or the sentence to
 * imitate. Translate, writing and multiple choice: only when the text is
 * already on screen in the prompt and is none of the answers. A model of the
 * answer itself ("today" → îro; "Hello" bi kurdî? → Silav) would say it out
 * loud, and since recordings are content-addressed its URL would also match a
 * match-pairs card's in the same response, which names it in plain text. A
 * model the prompt does not show is held back even when it is no option
 * word for word ("What did Kawa light?" → Agir, beside the option "Agir
 * (fire)"): only the author knows how close it is to one.
 */
function modelBeforeAnswer(type: ExerciseType, p: Record<string, unknown>, primary: string): boolean {
  switch (type) {
    case 'listening':
    case 'speaking':
      return true;
    case 'multiple_choice':
      return shownIn(p.prompt, primary) && !keysOf(p.options).includes(primary);
    case 'translate':
    case 'writing':
      return shownIn(p.prompt, primary) && !keysOf(p.accepted).includes(primary);
    default:
      return false;
  }
}

/**
 * Which recordings an exercise could use, as keys.
 *
 * The `audio` map is keyed by the text itself, so it may only hold texts the
 * learner already sees and that give nothing away: the left-hand cards of a
 * match-pairs item. A translation's answer, a listening item's transcription
 * or a multiple-choice item's `say` (which is often the right option) would
 * put the answer in the response in plain text, so they travel only as
 * `modelAudioUrl` — a content-addressed URL with no text in it, and only when
 * `modelBeforeAnswer` allows.
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
  };
}

/**
 * The recordings for a batch of exercises, in their order, from ONE query —
 * a lesson's worth of exercises costs one round trip, not one per item. Spread
 * each over the exercise as sanitized for the learner: only fields with a
 * recording are set, so a listening item keeps its own clip when the studio
 * has none.
 *
 * A batch is one response, which is where URLs could be matched up. A
 * recording that travels beside the text it says — a card, a word the prompt
 * quotes, a speaking item's sentence — goes without when a listening item in
 * the same batch plays the same recording, or it would name the
 * transcription. Such a model still comes with the grading.
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
  }
  if (keys.size === 0) return plans.map(() => ({}));

  const { rows } = await db.query<{ key: string; url: string } & VoiceRow>(
    `SELECT key, url, ${voiceColumns()} FROM lesson_audio WHERE key = ANY($1::text[])`,
    [[...keys]],
  );
  const urls = new Map(rows.map((r) => [r.key, r.url]));
  const voices = new Map<string, RecordingVoice>();
  for (const r of rows) {
    const voice = voiceOf(r);
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
 * The model to play once an item is answered: the native recording of its
 * primary text, for every item that has one — whether or not it was sent
 * with the item — so a client can play the model the same way after every
 * answer, and who says it. Empty when the text is not recorded, or the item
 * has no primary text (match-pairs, multiple choice without `say`).
 */
export async function modelAudioAfterAnswer(db: Executor, type: ExerciseType, payload: unknown): Promise<ModelAudio> {
  const key = keyOf(primaryAudioTarget(type, payload));
  if (!key) return {};
  const { rows } = await db.query<{ url: string } & VoiceRow>(
    `SELECT url, ${voiceColumns()} FROM lesson_audio WHERE key = $1`,
    [key],
  );
  const row = rows[0];
  if (!row) return {};
  const voice = voiceOf(row);
  return voice ? { modelAudioUrl: row.url, modelAudioVoice: voice } : { modelAudioUrl: row.url };
}
