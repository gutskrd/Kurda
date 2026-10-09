import { z } from 'zod';
import { answerKey, foldDiacritics, normalizeKurdish } from '@kurda/shared';
import type { ExerciseType } from './repository.js';
import { SELF_RATINGS, defaultScorer } from './speaking-scorer.js';

/**
 * Exercise payload schemas + server-side answer checkers (KUR-027).
 *
 * The client NEVER decides correctness. Authoring validates the payload
 * against these schemas (KUR-026 authoring / KUR-041 import); grading
 * runs `checkAnswer` on the server (lesson submission, KUR-028).
 */

// ---------- payload schemas (authoring-time) ----------

/**
 * The Kurdish a learner should hear for this item, where it cannot be read off
 * the payload — a multiple-choice item's Kurdish may be in its prompt or among
 * its options. Every type takes it; the audio studio asks for a recording of it
 * (`lessonAudioTargets` in @kurda/shared).
 */
const say = z.string().min(1).max(300).optional();

export const multipleChoicePayloadSchema = z
  .object({
    say,
    prompt: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(6),
    correctIndex: z.number().int().min(0),
  })
  .refine((p) => p.correctIndex < p.options.length, {
    message: 'correctIndex must point at an option',
    path: ['correctIndex'],
  });

/**
 * Strict spelling: a diacritic slip (e for ê, s for ş) is not accepted. Those
 * letters tell words apart, so a spelling or dictation item that forgave them
 * would count its target errors as successes. Off by default — beginners keep
 * the lenient "almost" (see `gradeText`).
 */
const strictSchema = z.boolean().optional();

export const translatePayloadSchema = z.object({
  say,
  prompt: z.string().min(1).max(500),
  /** All accepted answers; the first is the canonical/shown correction. */
  accepted: z.array(z.string().min(1).max(300)).min(1).max(12),
  strict: strictSchema,
});

export const matchPairsPayloadSchema = z.object({
  say,
  pairs: z
    .array(z.object({ left: z.string().min(1).max(120), right: z.string().min(1).max(120) }))
    .min(2)
    .max(8),
});

export const listeningPayloadSchema = z.object({
  say,
  /**
   * CDN URL of the audio clip to play (KUR-013). Optional: a studio recording
   * of the first accepted transcription is played in its place when there is one.
   */
  audioUrl: z.string().min(1).max(2000).optional(),
  /** optional on-screen hint shown alongside the audio */
  prompt: z.string().max(500).optional(),
  /** accepted transcriptions; graded diacritic-tolerantly like translate */
  accepted: z.array(z.string().min(1).max(300)).min(1).max(12),
  strict: strictSchema,
});

export const speakingPayloadSchema = z.object({
  say,
  /** what the learner is asked to say aloud */
  prompt: z.string().min(1).max(500),
  /** the target phrase, passed to the pronunciation scorer (KUR-120) */
  reference: z.string().min(1).max(300),
});

export const writingPayloadSchema = z.object({
  say,
  prompt: z.string().min(1).max(500),
  /** accepted full-text answers; punctuation/case-insensitive, diacritic-tolerant */
  accepted: z.array(z.string().min(1).max(500)).min(1).max(12),
  strict: strictSchema,
});

const PAYLOAD_SCHEMAS = {
  multiple_choice: multipleChoicePayloadSchema,
  translate: translatePayloadSchema,
  match_pairs: matchPairsPayloadSchema,
  listening: listeningPayloadSchema,
  speaking: speakingPayloadSchema,
  writing: writingPayloadSchema,
} as const;

export type MultipleChoicePayload = z.infer<typeof multipleChoicePayloadSchema>;
export type TranslatePayload = z.infer<typeof translatePayloadSchema>;
export type MatchPairsPayload = z.infer<typeof matchPairsPayloadSchema>;
export type ListeningPayload = z.infer<typeof listeningPayloadSchema>;
export type SpeakingPayload = z.infer<typeof speakingPayloadSchema>;
export type WritingPayload = z.infer<typeof writingPayloadSchema>;

export class InvalidExercisePayloadError extends Error {
  constructor(
    public readonly type: ExerciseType,
    public readonly issues: Array<{ path: string; message: string }>,
    message?: string,
  ) {
    super(message ?? `invalid ${type} payload`);
  }
}

/** Validates + returns the typed payload, or throws with per-field issues. */
export function validateExercisePayload(type: ExerciseType, payload: unknown): unknown {
  const schema = PAYLOAD_SCHEMAS[type];
  if (!schema) {
    throw new InvalidExercisePayloadError(
      type,
      [{ path: 'type', message: `unknown exercise type: ${type}` }],
      `unknown exercise type: ${type}`,
    );
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new InvalidExercisePayloadError(
      type,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

// ---------- answer schemas (submission-time) ----------

export const answerSchemas = {
  multiple_choice: z.object({ choice: z.number().int().min(0) }),
  translate: z.object({ text: z.string().max(500) }),
  /** left→right pairing the learner made, as the two texts of each pair. */
  match_pairs: z.object({
    matches: z
      .array(z.object({ left: z.string().max(120), right: z.string().max(120) }))
      .max(8),
  }),
  /** listening is transcription — same shape as translate */
  listening: z.object({ text: z.string().max(500) }),
  /**
   * speaking submits the storage key of the uploaded recording, and how the
   * learner judged it after hearing it beside the native model (optional, so
   * clients from before self-rating still submit)
   */
  speaking: z.object({
    audioKey: z.string().min(1).max(300),
    selfRating: z.enum(SELF_RATINGS).optional(),
  }),
  /** free-text writing */
  writing: z.object({ text: z.string().max(1000) }),
} as const;

// ---------- client-safe sanitization ----------

import { createHmac } from 'node:crypto';
import { DEV_JWT_SECRET } from '../config/env.js';

/**
 * The key the per-session shuffle is made with. A plain hash of the seed was
 * not enough: the seed is a session id and an exercise id, both of which the
 * client is sent, so anyone could recompute the authored order — and with it
 * the right option and the match-pairs pairing — from the response alone.
 * Keyed with a server secret, the order is still the same every time a session
 * asks for it (resume and grading agree) and on every instance, but cannot be
 * reproduced outside the server. Set from the app's JWT secret at start-up.
 */
let shuffleKey: string = DEV_JWT_SECRET;

export function setShuffleKey(key: string): void {
  shuffleKey = key;
}

/** Deterministic shuffle by a seed, so a resumed session sees the same order. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  return items
    .map((value, i) => ({
      value,
      key: createHmac('sha256', shuffleKey).update(`option-shuffle:${seed}:${i}`).digest('hex'),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((x) => x.value);
}

/**
 * The order a multiple-choice item's options are shown in, for a seed:
 * `displayed[i] = options[order[i]]`.
 *
 * Authored order leaked the answer: every seeded item had it first, and a
 * learner who noticed stopped recalling and started tapping the top option.
 * The seed is `${sessionId}:${exerciseId}`, so the order differs between
 * sessions and between items but is the same every time one session asks for
 * it — a resumed lesson shows what it showed before, and grading
 * (`checkAnswer`, same seed) maps the tapped position back to the option.
 */
export function optionOrder(count: number, seed: string): number[] {
  return seededShuffle(
    Array.from({ length: count }, (_, i) => i),
    seed,
  );
}

/**
 * Strips the correct answer from a stored exercise before it goes to the
 * client (KUR-028). The client never receives correctIndex / accepted /
 * the pairing; multiple-choice options and match-pairs sides are shuffled
 * per session with `seed` (`${sessionId}:${exerciseId}`).
 */
export function sanitizeExercise(
  type: ExerciseType,
  payload: unknown,
  seed: string,
): Record<string, unknown> {
  const parsed = PAYLOAD_SCHEMAS[type]?.safeParse(payload);
  if (!parsed || !parsed.success) throw new Error(`stored payload for ${type} is invalid`);

  switch (type) {
    case 'multiple_choice': {
      // the answer comes back as an index into THIS order; grading maps it
      // back with the same seed
      const p = parsed.data as MultipleChoicePayload;
      return { prompt: p.prompt, options: optionOrder(p.options.length, seed).map((i) => p.options[i]!) };
    }
    case 'translate': {
      const p = parsed.data as TranslatePayload;
      return { prompt: p.prompt };
    }
    case 'listening': {
      // send the audio + hint, never the transcription
      const p = parsed.data as ListeningPayload;
      return { audioUrl: p.audioUrl, prompt: p.prompt };
    }
    case 'speaking': {
      // send only the phrase to say; the reference stays server-side
      const p = parsed.data as SpeakingPayload;
      return { prompt: p.prompt };
    }
    case 'writing': {
      const p = parsed.data as WritingPayload;
      return { prompt: p.prompt };
    }
    case 'match_pairs': {
      const p = parsed.data as MatchPairsPayload;
      return {
        lefts: seededShuffle(
          p.pairs.map((pair) => pair.left),
          `${seed}:L`,
        ),
        rights: seededShuffle(
          p.pairs.map((pair) => pair.right),
          `${seed}:R`,
        ),
      };
    }
  }
}

// ---------- grading ----------

/** 'correct' | 'typo' (right word, diacritic slip) | 'wrong'. */
export type Verdict = 'correct' | 'typo' | 'wrong';

export interface CheckResult {
  verdict: Verdict;
  /**
   * true for correct, and for a typo unless the item is strict (a typo then
   * still counts as right, with a nudge). Never true for wrong.
   */
  accepted: boolean;
  /** Canonical correct answer to show on reveal. */
  correction?: string;
}

/** `choice` is a position in the order the learner saw (`optionOrder(…, seed)`). */
function checkMultipleChoice(payload: MultipleChoicePayload, choice: number, seed: string): CheckResult {
  const picked = optionOrder(payload.options.length, seed)[choice];
  const correct = picked === payload.correctIndex;
  return {
    verdict: correct ? 'correct' : 'wrong',
    accepted: correct,
    correction: correct ? undefined : payload.options[payload.correctIndex],
  };
}

/**
 * Diacritic-tolerant translation check. Answers are compared by `answerKey`,
 * so case, spacing, invisible formatting and the keyboard a Soranî answer was
 * typed on do not matter. An exact match against any accepted answer →
 * correct. A match only after folding Kurdish diacritics (ê→e, ş→s, …) is a
 * 'typo': accepted with a nudge ("almost — watch the ê"), unless the item is
 * strict, where the letter is the point and the slip is not accepted.
 * Otherwise wrong.
 */
function gradeText(acceptedAnswers: string[], text: string, strict = false): CheckResult {
  const answer = answerKey(text);
  const accepted = acceptedAnswers.map(answerKey);
  if (accepted.includes(answer)) {
    return { verdict: 'correct', accepted: true };
  }
  const foldedAnswer = foldDiacritics(answer);
  const foldedAccepted = accepted.map((a) => foldDiacritics(a));
  if (answer.length > 0 && foldedAccepted.includes(foldedAnswer)) {
    return { verdict: 'typo', accepted: !strict, correction: acceptedAnswers[0] };
  }
  return { verdict: 'wrong', accepted: false, correction: acceptedAnswers[0] };
}

function checkTranslate(payload: TranslatePayload, text: string): CheckResult {
  return gradeText(payload.accepted, text, payload.strict);
}

/** Listening is graded on the transcription, same rules as translate. */
function checkListening(payload: ListeningPayload, text: string): CheckResult {
  return gradeText(payload.accepted, text, payload.strict);
}

/**
 * Speaking is graded by the pronunciation scorer (KUR-036): today the
 * learner's own judgement after hearing their recording beside the native
 * model (see speaking-scorer.ts). An empty audioKey is still wrong so a
 * skipped/failed upload isn't silently a pass.
 */
function checkSpeaking(payload: SpeakingPayload, answer: SpeakingAnswer): CheckResult {
  if (!answer.audioKey) return { verdict: 'wrong', accepted: false };
  const score = defaultScorer.score({
    reference: payload.reference,
    audioKey: answer.audioKey,
    selfRating: answer.selfRating,
  });
  return {
    verdict: score.verdict,
    accepted: score.accepted,
    correction: score.verdict === 'correct' ? undefined : payload.reference,
  };
}

/**
 * Normalize free text for comparison: `answerKey` (NFC, lowercase, keyboard
 * variants), then punctuation stripped (Latin and Arabic-script) and spaces
 * collapsed.
 */
function normalizeForWriting(text: string): string {
  return answerKey(text)
    .replace(/[.,!?;:"'“”‘’()¡¿…—–\-؟،؛«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Free-text writing (KUR-037): punctuation/case-insensitive, diacritic-
 * tolerant unless strict. Copying the prompt back earns no credit (verdict
 * 'wrong'), checked before the accepted answers so it can't sneak a match.
 */
function checkWriting(payload: WritingPayload, text: string): CheckResult {
  const answer = normalizeForWriting(text);
  if (answer.length === 0) return { verdict: 'wrong', accepted: false, correction: payload.accepted[0] };
  if (answer === normalizeForWriting(payload.prompt)) {
    // pasted the prompt — no credit
    return { verdict: 'wrong', accepted: false, correction: payload.accepted[0] };
  }
  const accepted = payload.accepted.map(normalizeForWriting);
  if (accepted.includes(answer)) return { verdict: 'correct', accepted: true };
  const foldedAccepted = accepted.map((a) => foldDiacritics(a));
  if (foldedAccepted.includes(foldDiacritics(answer))) {
    return { verdict: 'typo', accepted: !payload.strict, correction: payload.accepted[0] };
  }
  return { verdict: 'wrong', accepted: false, correction: payload.accepted[0] };
}

/**
 * Which of a match-pairs item's texts (one side of it) a submitted text is:
 * the one it is exactly, else the only one it is under `answerKey`. Null when
 * it is none of them, or could be more than one.
 *
 * Clients send back the cards they were shown, so the exact text normally
 * decides. `answerKey` is the fallback for a client that re-typed or re-encoded
 * one (an Arabic kaf for a Kurdish one); it is only trusted when it points at a
 * single card, because two cards can share a key — "A" and "a" in an alphabet
 * lesson, or two words that differ only in a final ھ and ە — and a lookup keyed
 * on it alone let one of those cards overwrite the other, grading a right
 * matching wrong.
 */
function resolveCard(sent: string, cards: string[]): string | null {
  const exact = normalizeKurdish(sent);
  if (cards.includes(exact)) return exact;
  const key = answerKey(sent);
  const candidates = new Set(cards.filter((card) => answerKey(card) === key));
  return candidates.size === 1 ? [...candidates][0]! : null;
}

/** Every pair of a match-pairs item, as feedback and results show the right answer. */
function pairsText(payload: MatchPairsPayload): string {
  return payload.pairs.map((pair) => `${pair.left} = ${pair.right}`).join(', ');
}

/**
 * Right only when every pair the learner made is one of the item's pairs, each
 * used once, and all of them are made. A wrong matching comes back with every
 * right pair, as a wrong typed answer comes back with the right text: "not
 * yet" alone tells the learner something is wrong and not what is right.
 */
function checkMatchPairs(
  payload: MatchPairsPayload,
  matches: Array<{ left: string; right: string }>,
): CheckResult {
  const pairs = payload.pairs.map((p) => ({ left: normalizeKurdish(p.left), right: normalizeKurdish(p.right) }));
  const lefts = pairs.map((p) => p.left);
  const rights = pairs.map((p) => p.right);
  const unmade = [...pairs];
  const allRight =
    matches.length === pairs.length &&
    matches.every((m) => {
      const left = resolveCard(m.left, lefts);
      const right = resolveCard(m.right, rights);
      const i = unmade.findIndex((p) => p.left === left && p.right === right);
      if (left === null || right === null || i < 0) return false;
      unmade.splice(i, 1);
      return true;
    });
  return allRight ? { verdict: 'correct', accepted: true } : { verdict: 'wrong', accepted: false, correction: pairsText(payload) };
}

type SpeakingAnswer = z.infer<(typeof answerSchemas)['speaking']>;

/**
 * Grades one answer server-side. `payload` and `answer` are the raw
 * stored/submitted JSON; both are validated here so a malformed answer
 * is simply 'wrong', never a crash. `seed` is the one the exercise was
 * delivered with (`${sessionId}:${exerciseId}`): a multiple-choice answer is a
 * position in the shuffled order that seed produced.
 */
export function checkAnswer(type: ExerciseType, payload: unknown, answer: unknown, seed: string): CheckResult {
  const validPayload = PAYLOAD_SCHEMAS[type].safeParse(payload);
  if (!validPayload.success) throw new Error(`stored payload for ${type} is invalid`);

  const parsedAnswer = answerSchemas[type].safeParse(answer);
  if (!parsedAnswer.success) return { verdict: 'wrong', accepted: false };

  switch (type) {
    case 'multiple_choice':
      return checkMultipleChoice(
        validPayload.data as MultipleChoicePayload,
        (parsedAnswer.data as { choice: number }).choice,
        seed,
      );
    case 'translate':
      return checkTranslate(
        validPayload.data as TranslatePayload,
        (parsedAnswer.data as { text: string }).text,
      );
    case 'listening':
      return checkListening(
        validPayload.data as ListeningPayload,
        (parsedAnswer.data as { text: string }).text,
      );
    case 'speaking':
      return checkSpeaking(validPayload.data as SpeakingPayload, parsedAnswer.data as SpeakingAnswer);
    case 'writing':
      return checkWriting(
        validPayload.data as WritingPayload,
        (parsedAnswer.data as { text: string }).text,
      );
    case 'match_pairs':
      return checkMatchPairs(
        validPayload.data as MatchPairsPayload,
        (parsedAnswer.data as { matches: Array<{ left: string; right: string }> }).matches,
      );
  }
}

/**
 * The kinds of exercise a learner may put off without it counting against
 * them: listening ("Can't listen now", or a clip that will not play) and
 * speaking ("Can't speak now", or the course-wide "skip speaking" setting).
 * Both need something the learner may not have at that moment — sound, a
 * microphone, a quiet room — and not having it is not a wrong answer. One put
 * off and never answered is left out of the score rather than counted as
 * missed (`LessonSessionService.complete`, `PracticeService.complete`).
 */
export const SKIPPABLE_TYPES: readonly ExerciseType[] = ['listening', 'speaking'];

/**
 * What a results screen shows for a missed exercise: the question as it was
 * asked, and the right answer. Read from the stored payload, so it is only
 * ever sent once the session is over. A match-pairs item has no prompt; its
 * answer is every pair.
 */
export function revealExercise(type: ExerciseType, payload: unknown): { prompt?: string; correction?: string } {
  const parsed = PAYLOAD_SCHEMAS[type]?.safeParse(payload);
  if (!parsed || !parsed.success) return {};
  switch (type) {
    case 'multiple_choice': {
      const p = parsed.data as MultipleChoicePayload;
      return { prompt: p.prompt, correction: p.options[p.correctIndex] };
    }
    case 'translate':
    case 'writing': {
      const p = parsed.data as TranslatePayload | WritingPayload;
      return { prompt: p.prompt, correction: p.accepted[0] };
    }
    case 'listening': {
      const p = parsed.data as ListeningPayload;
      return { prompt: p.prompt, correction: p.accepted[0] };
    }
    case 'speaking': {
      const p = parsed.data as SpeakingPayload;
      return { prompt: p.prompt, correction: p.reference };
    }
    case 'match_pairs': {
      const p = parsed.data as MatchPairsPayload;
      return { correction: pairsText(p) };
    }
  }
}
