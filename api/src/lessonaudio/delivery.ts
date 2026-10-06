import type pg from 'pg';
import { lessonAudioKey, primaryAudioTarget } from '@kurda/shared';
import type { ExerciseType } from '../content/repository.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * What a delivered exercise carries of the studio's recordings. Only the
 * fields that have a recording are set.
 */
export interface DeliveredAudio {
  /** listening: the clip to play — the studio's recording of the transcription, else the payload's own clip */
  audioUrl?: string;
  /** a native speaker saying the item's primary text (`primaryAudioTarget`), to hear as the model */
  modelAudioUrl?: string;
  /** recordings of the cards a match-pairs item shows, by the exact text on the card */
  audio?: Record<string, string>;
}

interface Plan {
  listening: string | null;
  primary: string | null;
  /** [text as shown, its key] */
  shown: Array<[string, string]>;
}

function keyOf(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const key = lessonAudioKey(text);
  return key === '' ? null : key;
}

/**
 * Which recordings an exercise could use, as keys.
 *
 * The `audio` map is keyed by the text itself, so it may only hold texts the
 * learner already sees and that give nothing away: the left-hand cards of a
 * match-pairs item. A translation's answer, a listening item's transcription
 * or a multiple-choice item's `say` (which is often the right option) would
 * put the answer in the response in plain text, so they travel only as
 * `modelAudioUrl` — a content-addressed URL with no text in it.
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
  return {
    listening: type === 'listening' && Array.isArray(p.accepted) ? keyOf(p.accepted[0]) : null,
    primary: keyOf(primaryAudioTarget(type, payload)),
    shown,
  };
}

/**
 * The recordings for a batch of exercises, in their order, from ONE query —
 * a lesson's worth of exercises costs one round trip, not one per item. Spread
 * each over the exercise as sanitized for the learner: only fields with a
 * recording are set, so a listening item keeps its own clip when the studio
 * has none.
 */
export async function lessonAudioFor(
  db: Executor,
  exercises: ReadonlyArray<{ type: ExerciseType; payload: unknown }>,
): Promise<DeliveredAudio[]> {
  const plans = exercises.map((ex) => planFor(ex.type, ex.payload));
  const keys = new Set<string>();
  for (const plan of plans) {
    if (plan.listening) keys.add(plan.listening);
    if (plan.primary) keys.add(plan.primary);
    for (const [, key] of plan.shown) keys.add(key);
  }
  if (keys.size === 0) return plans.map(() => ({}));

  const { rows } = await db.query<{ key: string; url: string }>(
    `SELECT key, url FROM lesson_audio WHERE key = ANY($1::text[])`,
    [[...keys]],
  );
  const urls = new Map(rows.map((r) => [r.key, r.url]));

  return plans.map((plan) => {
    const out: DeliveredAudio = {};
    const listening = plan.listening ? urls.get(plan.listening) : undefined;
    if (listening) out.audioUrl = listening;
    const model = plan.primary ? urls.get(plan.primary) : undefined;
    if (model) out.modelAudioUrl = model;
    const audio: Record<string, string> = {};
    for (const [text, key] of plan.shown) {
      const url = urls.get(key);
      if (url) audio[text] = url;
    }
    if (Object.keys(audio).length > 0) out.audio = audio;
    return out;
  });
}

