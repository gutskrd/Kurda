import type pg from 'pg';
import type { DeliveredExercise } from '@kurda/shared';
import { exerciseSeed, sanitizeExercise } from './exercises.js';
import type { ExerciseType } from './repository.js';
import { promptTokens } from './prompt-tokens.js';
import { wordBanks } from './word-bank.js';
import { lessonAudioFor } from '../lessonaudio/delivery.js';
import { englishGlosses } from '../dictionary/glosses.js';

/** What a delivered exercise carries besides who it is: everything a client is shown and played. */
export type DeliveredFields = Omit<DeliveredExercise, 'id' | 'position' | 'type' | 'dialect'>;

/** A stored exercise to deliver, and the variety of Kurdish of its course. */
export interface Deliverable {
  id: string;
  type: ExerciseType;
  payload: unknown;
  dialect?: string | null;
}

/**
 * Exercises as a session's client sees them, whichever kind of session it is
 * (a lesson, a practice session or test to jump ahead, a placement question):
 * answers stripped and options shuffled with the session's seed
 * (`sanitizeExercise`), the studio's recordings (`lessonAudioFor`), the word
 * tiles of a translation or a listening item (`wordBanks`) and the prompt's
 * words with their meanings (`promptTokens`). Every exercise of the session is
 * passed at once: tiles are drawn from the session's other items, meanings from
 * its pairs, and the recordings and the dictionary are one statement each for
 * the whole session.
 */
export async function deliverExercises(db: Pick<pg.Pool, 'query'>, sessionId: string, exercises: readonly Deliverable[]): Promise<DeliveredFields[]> {
  const items = exercises.map((ex) => ({ type: ex.type, payload: ex.payload, dialect: ex.dialect, seed: exerciseSeed(sessionId, ex.id) }));
  const tokens = promptTokens(items);
  const [audio, glosses] = await Promise.all([lessonAudioFor(db, exercises), englishGlosses(db, tokens.lookups)]);
  const banks = wordBanks(items);
  const prompts = tokens.finish(glosses);
  return items.map((item, i) => {
    const bank = banks[i];
    const promptWords = prompts[i];
    return {
      ...(sanitizeExercise(item.type, item.payload, item.seed) as DeliveredFields),
      ...audio[i],
      ...(bank ? { bank } : {}),
      ...(promptWords ? { promptTokens: promptWords } : {}),
    };
  });
}
