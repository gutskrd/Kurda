import { z } from 'zod';
import {
  ASKS_BY_TYPE,
  CONVERSATION_ID,
  CONVERSATION_LIMITS as CONV,
  GAP,
  SPEAKERS,
  WORD_PICTURES,
  answerKey,
  conversationSpeaker,
  learnerPart,
  foldDiacritics,
  lessonAudioKey,
  normalizeKurdish,
  splitGap,
  type ConversationPayload,
  type ExerciseAsk,
} from '@kurda/shared';
import type { ExerciseType } from './repository.js';
import { englishKey } from './english-answer.js';
import { SELF_RATINGS, defaultScorer } from './speaking-scorer.js';

/**
 * Exercise payload schemas and server-side answer checkers. The client never decides correctness: authoring and import
 * validate payloads against these schemas, and lesson submission grades with `checkAnswer` on the server.
 */

// ---------- payload schemas (authoring-time) ----------

/**
 * The Kurdish a learner should hear for this item where the payload does not show it (a multiple-choice item's Kurdish
 * may be in the prompt or the options). Every type takes it; the audio studio asks for a recording of it
 * (`lessonAudioTargets` in @kurda/shared).
 */
const say = z.string().min(1).max(300).optional();

/**
 * Who should record this item's Kurdish: the character whose recording plays (`SPEAKERS`). The audio studio lists the
 * item for them (`plannedSpeaker`) so a voice actor can record a character's lines in a row. It is only the plan; the
 * recording itself says who is heard, so nothing sent to learners carries it. A conversation has no `voice`: each line
 * belongs to its part's character.
 */
const voice = z.enum(SPEAKERS, { error: 'must be hevalo, hamo or xezo' }).optional();

/**
 * What the item asks (`ExerciseAsk`), which sets its headline in the apps. With it, `prompt` holds only the line (the
 * Kurdish, or the English to put into Kurdish); without it, the prompt is the whole question as for the type's default.
 */
const askOf = (type: keyof typeof ASKS_BY_TYPE) => z.enum(ASKS_BY_TYPE[type] as [ExerciseAsk, ...ExerciseAsk[]]).optional();

/** A few words of context beside the line, where the line alone could be read two ways ("to two people"). */
const cue = z.string().min(1).max(60).optional();

/** The words the item brings in for the first time, each with its meaning: the apps mark them new. */
const newWords = z
  .array(z.object({ ku: z.string().min(1).max(60), en: z.string().min(1).max(80) }))
  .min(1)
  .max(6)
  .optional();

/** A `missing` line holds one gap, and the line it was cut from, when it is said, is the line with its answer in the gap. */
function checkGap(line: string, answers: readonly string[], whole: string | undefined, ctx: z.RefinementCtx): void {
  const gap = splitGap(line);
  if (!gap) {
    ctx.addIssue({ code: 'custom', path: ['prompt'], message: `a missing-word line holds exactly one ${GAP}` });
    return;
  }
  if (whole !== undefined && !answers.some((a) => lessonAudioKey(`${gap.before}${a}${gap.after}`) === lessonAudioKey(whole))) {
    ctx.addIssue({ code: 'custom', path: ['say'], message: 'is the line with its answer in the gap' });
  }
}

/** A word picture (shared art/word-pictures.ts) that shows what a cue names, drawn in its place. */
const cuePicture = z
  .string()
  .refine((id) => Object.hasOwn(WORD_PICTURES, id), { message: 'is not a word picture' })
  .optional();

export const multipleChoicePayloadSchema = z
  .object({
    say,
    voice,
    ask: askOf('multiple_choice'),
    cue,
    picture: cuePicture,
    new: newWords,
    prompt: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(6),
    correctIndex: z.number().int().min(0),
  })
  .superRefine((p, ctx) => {
    if (p.correctIndex >= p.options.length) {
      ctx.addIssue({ code: 'custom', message: 'correctIndex must point at an option', path: ['correctIndex'] });
      return;
    }
    // a picture item's options are pictures the apps can draw
    if (p.ask === 'picture') {
      p.options.forEach((o, i) => {
        if (!Object.hasOwn(WORD_PICTURES, o)) ctx.addIssue({ code: 'custom', path: ['options', i], message: `is not a word picture: ${o}` });
      });
    }
    if (p.ask === 'missing') checkGap(p.prompt, [p.options[p.correctIndex]!], p.say, ctx);
  });

/**
 * Strict spelling: a diacritic slip (e for ê, s for ş) is not accepted, since those letters tell words apart. Off by
 * default, so beginners get the lenient "almost" (see `gradeText`).
 */
const strictSchema = z.boolean().optional();

export const translatePayloadSchema = z.object({
  say,
  voice,
  ask: askOf('translate'),
  cue,
  new: newWords,
  prompt: z.string().min(1).max(500),
  /** All accepted answers; the first is the canonical/shown correction. */
  accepted: z.array(z.string().min(1).max(300)).min(1).max(12),
  strict: strictSchema,
});

export const matchPairsPayloadSchema = z.object({
  say,
  voice,
  pairs: z
    .array(z.object({ left: z.string().min(1).max(120), right: z.string().min(1).max(120) }))
    .min(2)
    .max(8),
});

export const listeningPayloadSchema = z.object({
  say,
  voice,
  ask: askOf('listening'),
  cue,
  new: newWords,
  /**
   * CDN URL of the clip to play. Optional: a studio recording of the first accepted transcription plays instead when
   * there is one.
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
  voice,
  ask: askOf('speaking'),
  cue,
  new: newWords,
  /** what the learner is asked to say aloud */
  prompt: z.string().min(1).max(500),
  /** the target phrase, passed to the pronunciation scorer */
  reference: z.string().min(1).max(300),
});

export const writingPayloadSchema = z
  .object({
    say,
    voice,
    ask: askOf('writing'),
    cue,
    new: newWords,
    prompt: z.string().min(1).max(500),
    /** accepted full-text answers (a `missing` item's: the word for its gap); punctuation/case-insensitive, diacritic-tolerant */
    accepted: z.array(z.string().min(1).max(500)).min(1).max(12),
    strict: strictSchema,
  })
  .superRefine((p, ctx) => {
    if (p.ask === 'missing') checkGap(p.prompt, p.accepted, p.say, ctx);
  });

/**
 * A conversation (@kurda/shared conversation.ts): its parts, their lines in turn, then a question with one right
 * answer, asked and graded as multiple choice. `id` files the lines' recordings and stays the same across lesson
 * versions.
 *
 * Every line names a part and every part has a line (a silent part could not be recorded). Each part is one character
 * by name, and no character plays two parts. One part may be the learner's own (`learner: true`) when a character talks
 * with them: those lines are theirs to read and are never recorded, so at least one character takes part too.
 */
export const conversationPayloadSchema = z
  .object({
    id: z.string().regex(CONVERSATION_ID, 'must be 6–32 lower-case letters and digits'),
    title: z.string().min(1).max(CONV.titleMax).optional(),
    // each part is one of the characters, called by the character's own name whatever name was sent, or the learner's own
    speakers: z
      .array(
        z
          .object({
            name: z.string().max(CONV.nameMax).optional(),
            // null as well as absent: a stored payload is the parsed one, whose learner part carries `character: null`, and it is parsed again when sent
            character: z.enum(SPEAKERS, { error: 'needs a character: Hevalo, Hamo or Xezo' }).nullish(),
            learner: z.literal(true).optional(),
          })
          .superRefine((s, ctx) => {
            if (s.learner && s.character) ctx.addIssue({ code: 'custom', path: ['character'], message: 'the learner’s own part has no character' });
            if (!s.learner && !s.character) ctx.addIssue({ code: 'custom', path: ['character'], message: 'needs a character: Hevalo, Hamo or Xezo' });
          }),
      )
      .min(CONV.speakersMin)
      .max(CONV.speakersMax)
      .transform((speakers) => speakers.map((s) => (s.learner || !s.character ? learnerPart() : conversationSpeaker(s.character)))),
    lines: z
      .array(
        z.object({
          speaker: z.number().int().min(0),
          text: z.string().min(1).max(CONV.lineMax),
          en: z.string().min(1).max(CONV.translationMax).optional(),
        }),
      )
      .min(CONV.linesMin)
      .max(CONV.linesMax),
    prompt: z.string().min(1).max(CONV.promptMax),
    options: z.array(z.string().min(1).max(CONV.optionMax)).min(CONV.optionsMin).max(CONV.optionsMax),
    correctIndex: z.number().int().min(0),
  })
  .superRefine((p, ctx) => {
    if (p.correctIndex >= p.options.length) {
      ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'correctIndex must point at an option' });
    }
    p.lines.forEach((line, i) => {
      if (line.speaker >= p.speakers.length) {
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'speaker'], message: 'must be one of the speakers' });
      } else if (lessonAudioKey(line.text) === '') {
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'text'], message: 'has nothing to say' });
      }
    });
    const cast = new Set<string>();
    p.speakers.forEach((speaker, i) => {
      // one character plays one part, and the learner one: who says a line is never in doubt
      const who = speaker.character ?? 'learner';
      if (cast.has(who)) {
        ctx.addIssue({ code: 'custom', path: ['speakers', i, speaker.character ? 'character' : 'learner'], message: `${speaker.character ? speaker.name : 'the learner'} already has a part` });
      }
      cast.add(who);
      if (!p.lines.some((line) => line.speaker === i)) {
        ctx.addIssue({ code: 'custom', path: ['speakers', i], message: 'says nothing: give them a line or remove them' });
      }
    });
    // the learner talks with someone: a conversation of theirs alone has nobody to hear
    if (p.speakers.every((speaker) => speaker.character === null)) {
      ctx.addIssue({ code: 'custom', path: ['speakers'], message: 'needs a character for the learner to talk with' });
    }
  });

const PAYLOAD_SCHEMAS = {
  multiple_choice: multipleChoicePayloadSchema,
  translate: translatePayloadSchema,
  match_pairs: matchPairsPayloadSchema,
  listening: listeningPayloadSchema,
  speaking: speakingPayloadSchema,
  writing: writingPayloadSchema,
  conversation: conversationPayloadSchema,
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
   * Speaking submits the learner's own rating after hearing their take beside the native model. The take stays on their
   * device: nothing on the server listens to it, and storing learners' voices (minors' included) would serve no
   * purpose. `audioKey` is still read from older clients that uploaded the take and sent no rating.
   */
  speaking: z.object({
    audioKey: z.string().min(1).max(300).optional(),
    selfRating: z.enum(SELF_RATINGS).optional(),
  }),
  /** free-text writing */
  writing: z.object({ text: z.string().max(1000) }),
  /** the answer to the question after the conversation, as a position in the order shown */
  conversation: z.object({ choice: z.number().int().min(0) }),
} as const;

// ---------- client-safe sanitization ----------

import { createHmac } from 'node:crypto';
import { DEV_JWT_SECRET } from '../config/env.js';

/**
 * The key the per-session shuffle uses. The seed (session id and exercise id) is sent to the client, so a plain hash
 * would let anyone recompute the authored order and the right option. Keyed with a server secret, the order is stable
 * for a session (resume and grading agree) and across instances, but not reproducible outside the server. Set from the
 * app's JWT secret at start-up.
 */
let shuffleKey: string = DEV_JWT_SECRET;

export function setShuffleKey(key: string): void {
  shuffleKey = key;
}

/**
 * A secret digest of a seed under the same server key as the shuffles: what a round's random draws start from
 * (games/draw.ts), one hash per draw. The label keeps it apart from shuffle digests.
 */
export function keyedDigest(seed: string): Buffer {
  return createHmac('sha256', shuffleKey).update(`game-draw:${seed}`).digest();
}

/**
 * Deterministic shuffle by seed, so a resumed session sees the same order. Positions depend only on index and seed,
 * never on the items, so equal-length lists shuffle alike.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  return items
    .map((value, i) => ({
      value,
      key: createHmac('sha256', shuffleKey).update(`option-shuffle:${seed}:${i}`).digest('hex'),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((x) => x.value);
}

/**
 * The order a multiple-choice item's options are shown in for a seed: `displayed[i] = options[order[i]]`. Authored
 * order would leak the answer (seeded items had it first). The seed is `${sessionId}:${exerciseId}`, so the order
 * varies by session and item but is stable within a session, and grading (`checkAnswer`, same seed) maps the tapped
 * position back to the option.
 */
export function optionOrder(count: number, seed: string): number[] {
  return seededShuffle(
    Array.from({ length: count }, (_, i) => i),
    seed,
  );
}

/** The seed an exercise is delivered and graded with in a session (a lesson's, a practice session's, a placement's). */
export function exerciseSeed(sessionId: string, exerciseId: string): string {
  return `${sessionId}:${exerciseId}`;
}

/** What an item asks, its cue and the words it brings in, as the apps are sent them: only what it says. */
function asked(p: { ask?: ExerciseAsk; cue?: string; new?: Array<{ ku: string; en: string }> }): Record<string, unknown> {
  return {
    ...(p.ask ? { ask: p.ask } : {}),
    ...(p.cue ? { cue: p.cue } : {}),
    ...(p.new ? { newWords: p.new.map((w) => ({ ku: w.ku, en: w.en })) } : {}),
  };
}

/**
 * Strip the answer from a stored exercise before it goes to the client: never correctIndex or accepted, nor `voice`
 * (the recording plan; who is heard travels with each recording, lessonaudio/delivery.ts). Multiple-choice options and
 * match-pairs sides are shuffled per session with `seed` (`${sessionId}:${exerciseId}`). Match pairs is the one
 * exception: answered pair by pair, it says which meaning each card pairs with (`pairOf`); the full matching is still
 * graded here when sent.
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
      return {
        prompt: p.prompt,
        ...asked(p),
        ...(p.picture ? { cuePicture: p.picture } : {}),
        options: optionOrder(p.options.length, seed).map((i) => p.options[i]!),
      };
    }
    case 'translate': {
      const p = parsed.data as TranslatePayload;
      return { prompt: p.prompt, ...asked(p) };
    }
    case 'listening': {
      // send the audio + hint, never the transcription
      const p = parsed.data as ListeningPayload;
      return { audioUrl: p.audioUrl, prompt: p.prompt, ...asked(p) };
    }
    case 'speaking': {
      // send only the phrase to say; the reference stays server-side
      const p = parsed.data as SpeakingPayload;
      return { prompt: p.prompt, ...asked(p) };
    }
    case 'writing': {
      const p = parsed.data as WritingPayload;
      return { prompt: p.prompt, ...asked(p) };
    }
    case 'conversation': {
      // the whole conversation is the reading; the answer is only in correctIndex
      const p = parsed.data as ConversationPayload;
      return {
        ...(p.title ? { title: p.title } : {}),
        speakers: p.speakers.map((s) => (s.learner ? { name: s.name, character: null, learner: true as const } : { name: s.name, character: s.character })),
        lines: p.lines.map((l) => (l.en ? { speaker: l.speaker, text: l.text, en: l.en } : { speaker: l.speaker, text: l.text })),
        prompt: p.prompt,
        options: optionOrder(p.options.length, seed).map((i) => p.options[i]!),
      };
    }
    case 'match_pairs': {
      // each side's order as places in `pairs`, so a card is followed to its partner by its pair, never by its text
      const p = parsed.data as MatchPairsPayload;
      const places = p.pairs.map((_, i) => i);
      const lefts = seededShuffle(places, `${seed}:L`);
      const rights = seededShuffle(places, `${seed}:R`);
      return {
        lefts: lefts.map((i) => p.pairs[i]!.left),
        rights: rights.map((i) => p.pairs[i]!.right),
        pairOf: lefts.map((i) => rights.indexOf(i)),
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
   * True when correct, and for a typo unless the item is strict (a typo counts as right with a nudge). Never true when
   * wrong.
   */
  accepted: boolean;
  /** Canonical correct answer to show on reveal. */
  correction?: string;
}

/**
 * `choice` is a position in the order the learner saw (`optionOrder(…, seed)`). A conversation's question is graded the
 * same way.
 */
function checkMultipleChoice(payload: Pick<MultipleChoicePayload, 'options' | 'correctIndex'>, choice: number, seed: string): CheckResult {
  const picked = optionOrder(payload.options.length, seed)[choice];
  const correct = picked === payload.correctIndex;
  return {
    verdict: correct ? 'correct' : 'wrong',
    accepted: correct,
    correction: correct ? undefined : payload.options[payload.correctIndex],
  };
}

/**
 * Latin and Arabic-script punctuation as a regex character class: what grading reads as a space and what a word tile is
 * trimmed of.
 */
export const PUNCTUATION = String.raw`[.,!?;:"'“”‘’()¡¿…—–\-؟،؛«»]`;

const PUNCTUATION_ANYWHERE = new RegExp(PUNCTUATION, 'gu');

/**
 * A typed answer as grading compares it: `answerKey` (NFC, lowercase, keyboard variants), then punctuation stripped and
 * spaces collapsed.
 */
export function gradingKey(text: string): string {
  return answerKey(text).replace(PUNCTUATION_ANYWHERE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Diacritic-tolerant text check. Answers compare by `gradingKey`, so case, punctuation, spacing, invisible formatting
 * and the Soranî keyboard used do not matter (a tile-built answer has no punctuation and is as right as the sentence).
 * An exact match with any accepted answer is correct, and so, for an English answer, is one that differs only in its
 * articles or contractions (`englishKey`). A match only after folding Kurdish diacritics (ê→e, ş→s, …) is a 'typo',
 * accepted with a nudge unless the item is strict. Otherwise wrong.
 */
function gradeText(acceptedAnswers: string[], text: string, { strict = false, english = false }: { strict?: boolean; english?: boolean } = {}): CheckResult {
  const answer = gradingKey(text);
  const accepted = acceptedAnswers.map(gradingKey);
  if (answer.length > 0 && accepted.includes(answer)) {
    return { verdict: 'correct', accepted: true };
  }
  if (english && answer.length > 0) {
    const key = englishKey(answer);
    if (key.length > 0 && accepted.some((a) => englishKey(a) === key)) return { verdict: 'correct', accepted: true };
  }
  const foldedAnswer = foldDiacritics(answer);
  const foldedAccepted = accepted.map((a) => foldDiacritics(a));
  if (answer.length > 0 && foldedAccepted.includes(foldedAnswer)) {
    return { verdict: 'typo', accepted: !strict, correction: acceptedAnswers[0] };
  }
  return { verdict: 'wrong', accepted: false, correction: acceptedAnswers[0] };
}

function checkTranslate(payload: TranslatePayload, text: string): CheckResult {
  return gradeText(payload.accepted, text, { strict: payload.strict, english: payload.ask === 'to-english' });
}

/** Listening is graded on the transcription, same rules as translate. */
function checkListening(payload: ListeningPayload, text: string): CheckResult {
  return gradeText(payload.accepted, text, { strict: payload.strict });
}

/**
 * Speaking is graded by the pronunciation scorer, currently the learner's own rating after hearing their take beside
 * the native model (speaking-scorer.ts). An answer with neither a rating nor (from older clients) a recording is wrong,
 * so skipping is never a pass.
 */
function checkSpeaking(payload: SpeakingPayload, answer: SpeakingAnswer): CheckResult {
  if (!answer.selfRating && !answer.audioKey) return { verdict: 'wrong', accepted: false };
  const score = defaultScorer.score({
    reference: payload.reference,
    selfRating: answer.selfRating,
  });
  return {
    verdict: score.verdict,
    accepted: score.accepted,
    correction: score.verdict === 'correct' ? undefined : payload.reference,
  };
}

/**
 * Free-text writing is graded like translate. Copying the prompt back is 'wrong', checked before the accepted answers
 * so it cannot match one.
 */
function checkWriting(payload: WritingPayload, text: string): CheckResult {
  const answer = gradingKey(text);
  if (answer.length > 0 && answer === gradingKey(payload.prompt)) {
    // pasted the prompt — no credit
    return { verdict: 'wrong', accepted: false, correction: payload.accepted[0] };
  }
  return gradeText(payload.accepted, text, { strict: payload.strict });
}

/**
 * Which of a match-pairs side's texts a submitted text is: the exact one, else the only one with the same `answerKey`;
 * null when none or ambiguous.
 *
 * Clients send back the cards they were shown, so the exact text usually decides. `answerKey` covers a client that
 * re-encoded a card (an Arabic kaf for a Kurdish one) and is trusted only when it points to one card, because cards can
 * share a key ("A" and "a", or words differing only in a final ھ and ە).
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
 * Right only when every pair the learner made is one of the item's pairs, each used once, and all are made. A wrong
 * matching returns every right pair, as a wrong typed answer returns the right text.
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
 * Grade one answer server-side. `payload` and `answer` are raw stored and submitted JSON, validated here so a malformed
 * answer is 'wrong', never a crash. `seed` is the one the exercise was delivered with (`${sessionId}:${exerciseId}`): a
 * multiple-choice answer is a position in that shuffled order.
 */
export function checkAnswer(type: ExerciseType, payload: unknown, answer: unknown, seed: string): CheckResult {
  const validPayload = PAYLOAD_SCHEMAS[type].safeParse(payload);
  if (!validPayload.success) throw new Error(`stored payload for ${type} is invalid`);

  const parsedAnswer = answerSchemas[type].safeParse(answer);
  if (!parsedAnswer.success) return { verdict: 'wrong', accepted: false };

  switch (type) {
    case 'multiple_choice':
    case 'conversation':
      return checkMultipleChoice(
        validPayload.data as MultipleChoicePayload | ConversationPayload,
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
 * Exercise kinds a learner may put off without penalty: listening ("Can't listen now", or a clip that will not play)
 * and speaking ("Can't speak now", or the "skip speaking" setting), since lacking sound, a microphone or a quiet room
 * is not a wrong answer. One put off and never answered is left out of the score (`LessonSessionService.complete`,
 * `PracticeService.complete`).
 */
export const SKIPPABLE_TYPES: readonly ExerciseType[] = ['listening', 'speaking'];

/**
 * What a results screen shows for a missed exercise: the question as asked and the right answer, read from the stored
 * payload, so only ever sent once the session is over. Match pairs has no prompt; its answer is every pair.
 */
export function revealExercise(type: ExerciseType, payload: unknown): { prompt?: string; correction?: string } {
  const parsed = PAYLOAD_SCHEMAS[type]?.safeParse(payload);
  if (!parsed || !parsed.success) return {};
  switch (type) {
    case 'multiple_choice':
    case 'conversation': {
      const p = parsed.data as MultipleChoicePayload | ConversationPayload;
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
