import { z } from 'zod';
import { foldDiacritics, normalizeKurdish } from '@kurda/shared';
import type { ExerciseType } from './repository.js';
import { defaultScorer } from './speaking-scorer.js';

/**
 * Exercise payload schemas + server-side answer checkers (KUR-027).
 *
 * The client NEVER decides correctness. Authoring validates the payload
 * against these schemas (KUR-026 authoring / KUR-041 import); grading
 * runs `checkAnswer` on the server (lesson submission, KUR-028).
 */

// ---------- payload schemas (authoring-time) ----------

export const multipleChoicePayloadSchema = z
  .object({
    prompt: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(6),
    correctIndex: z.number().int().min(0),
  })
  .refine((p) => p.correctIndex < p.options.length, {
    message: 'correctIndex must point at an option',
    path: ['correctIndex'],
  });

export const translatePayloadSchema = z.object({
  prompt: z.string().min(1).max(500),
  /** All accepted answers; the first is the canonical/shown correction. */
  accepted: z.array(z.string().min(1).max(300)).min(1).max(12),
});

export const matchPairsPayloadSchema = z.object({
  pairs: z
    .array(z.object({ left: z.string().min(1).max(120), right: z.string().min(1).max(120) }))
    .min(2)
    .max(8),
});

export const listeningPayloadSchema = z.object({
  /** CDN URL of the audio clip to play (KUR-013). */
  audioUrl: z.string().min(1).max(2000),
  /** optional on-screen hint shown alongside the audio */
  prompt: z.string().max(500).optional(),
  /** accepted transcriptions; graded diacritic-tolerantly like translate */
  accepted: z.array(z.string().min(1).max(300)).min(1).max(12),
});

export const speakingPayloadSchema = z.object({
  /** what the learner is asked to say aloud */
  prompt: z.string().min(1).max(500),
  /** the target phrase, passed to the pronunciation scorer (KUR-120) */
  reference: z.string().min(1).max(300),
});

export const writingPayloadSchema = z.object({
  prompt: z.string().min(1).max(500),
  /** accepted full-text answers; punctuation/case-insensitive, diacritic-tolerant */
  accepted: z.array(z.string().min(1).max(500)).min(1).max(12),
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
  /** speaking submits the storage key of the uploaded recording */
  speaking: z.object({ audioKey: z.string().min(1).max(300) }),
  /** free-text writing */
  writing: z.object({ text: z.string().max(1000) }),
} as const;

// ---------- client-safe sanitization ----------

import { createHash } from 'node:crypto';

/** Deterministic shuffle by a seed, so a resumed session sees the same order. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  return items
    .map((value, i) => ({
      value,
      key: createHash('sha1').update(`${seed}:${i}`).digest('hex'),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((x) => x.value);
}

/**
 * Strips the correct answer from a stored exercise before it goes to the
 * client (KUR-028). The client never receives correctIndex / accepted /
 * the pairing; match-pairs sides are shuffled independently per session.
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
      // options stay in authored order — the answer is submitted as an
      // index into this array, so it must match the stored order
      const p = parsed.data as MultipleChoicePayload;
      return { prompt: p.prompt, options: p.options };
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
  /** true for correct AND typo (a typo still counts as right, with a nudge). */
  accepted: boolean;
  /** Canonical correct answer to show on reveal. */
  correction?: string;
}

function checkMultipleChoice(payload: MultipleChoicePayload, choice: number): CheckResult {
  const correct = choice === payload.correctIndex;
  return {
    verdict: correct ? 'correct' : 'wrong',
    accepted: correct,
    correction: correct ? undefined : payload.options[payload.correctIndex],
  };
}

/**
 * Diacritic-tolerant translation check. Exact (normalised) match against
 * any accepted answer → correct. A match only after folding Kurdish
 * diacritics (ê→e, ş→s, …) → accepted, but flagged as a 'typo' so the UI
 * can nudge ("almost — watch the ê"). Otherwise wrong.
 */
function gradeText(acceptedAnswers: string[], text: string): CheckResult {
  const answer = normalizeKurdish(text).toLowerCase();
  const accepted = acceptedAnswers.map((a) => normalizeKurdish(a).toLowerCase());
  if (accepted.includes(answer)) {
    return { verdict: 'correct', accepted: true };
  }
  const foldedAnswer = foldDiacritics(answer);
  const foldedAccepted = accepted.map((a) => foldDiacritics(a));
  if (answer.length > 0 && foldedAccepted.includes(foldedAnswer)) {
    return { verdict: 'typo', accepted: true, correction: acceptedAnswers[0] };
  }
  return { verdict: 'wrong', accepted: false, correction: acceptedAnswers[0] };
}

function checkTranslate(payload: TranslatePayload, text: string): CheckResult {
  return gradeText(payload.accepted, text);
}

/** Listening is graded on the transcription, same rules as translate. */
function checkListening(payload: ListeningPayload, text: string): CheckResult {
  return gradeText(payload.accepted, text);
}

/**
 * Speaking is graded by the pronunciation scorer (KUR-036), which is a stub
 * that accepts any recording in v1 (real model: KUR-120). An empty audioKey
 * is still wrong so a skipped/failed upload isn't silently a pass.
 */
function checkSpeaking(payload: SpeakingPayload, audioKey: string): CheckResult {
  if (!audioKey) return { verdict: 'wrong', accepted: false };
  const score = defaultScorer.score({ reference: payload.reference, audioKey });
  return { verdict: score.pass ? 'correct' : 'wrong', accepted: score.pass };
}

/** Normalize free text for comparison: NFC, lowercase, strip punctuation, collapse spaces. */
function normalizeForWriting(text: string): string {
  return normalizeKurdish(text)
    .toLowerCase()
    .replace(/[.,!?;:"'“”‘’()¡¿…—–\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Free-text writing (KUR-037): punctuation/case-insensitive, diacritic-
 * tolerant. Copying the prompt back earns no credit (verdict 'wrong'),
 * checked before the accepted answers so it can't sneak a match.
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
    return { verdict: 'typo', accepted: true, correction: payload.accepted[0] };
  }
  return { verdict: 'wrong', accepted: false, correction: payload.accepted[0] };
}

function checkMatchPairs(
  payload: MatchPairsPayload,
  matches: Array<{ left: string; right: string }>,
): CheckResult {
  const truth = new Map(
    payload.pairs.map((p) => [normalizeKurdish(p.left), normalizeKurdish(p.right)]),
  );
  const allRight =
    matches.length === payload.pairs.length &&
    matches.every((m) => truth.get(normalizeKurdish(m.left)) === normalizeKurdish(m.right));
  return { verdict: allRight ? 'correct' : 'wrong', accepted: allRight };
}

/**
 * Grades one answer server-side. `payload` and `answer` are the raw
 * stored/submitted JSON; both are validated here so a malformed answer
 * is simply 'wrong', never a crash.
 */
export function checkAnswer(type: ExerciseType, payload: unknown, answer: unknown): CheckResult {
  const validPayload = PAYLOAD_SCHEMAS[type].safeParse(payload);
  if (!validPayload.success) throw new Error(`stored payload for ${type} is invalid`);

  const parsedAnswer = answerSchemas[type].safeParse(answer);
  if (!parsedAnswer.success) return { verdict: 'wrong', accepted: false };

  switch (type) {
    case 'multiple_choice':
      return checkMultipleChoice(
        validPayload.data as MultipleChoicePayload,
        (parsedAnswer.data as { choice: number }).choice,
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
      return checkSpeaking(
        validPayload.data as SpeakingPayload,
        (parsedAnswer.data as { audioKey: string }).audioKey,
      );
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
