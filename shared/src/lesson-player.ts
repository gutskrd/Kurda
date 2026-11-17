/**
 * The lesson player's logic for every client that plays a lesson: which exercise is on screen, what follows an answer,
 * and where a resumed lesson picks up, so the browser and the phone agree on what counts. Pure: no UI, network or clock;
 * the server grades every answer.
 *
 * Mistakes never end a lesson. A missed item comes back once, about `REASK_GAP` exercises later or at the end, graded
 * through the session's retry endpoint, which records nothing: the first answer alone decides the score, the XP and the
 * review schedule.
 */

import type { ConversationLine, ConversationSpeaker } from './conversation.js';
import type { RecordingVoice } from './lipsync/speakers.js';

export type ExerciseType = 'multiple_choice' | 'translate' | 'match_pairs' | 'listening' | 'speaking' | 'writing' | 'conversation';

/** As the server grades: 'correct', 'typo' (the right word with a letter slip) or 'wrong'. */
export type Verdict = 'correct' | 'typo' | 'wrong';

/** How a learner judged their own recording beside the native model. */
export type SelfRating = 'good' | 'close' | 'retry';

/**
 * What an item asks, which names its headline, so the bubble can hold the line alone; an item without one is asked as its
 * type always was. `meaning`: what the Kurdish line means. `picture`: which picture the Kurdish word is (options are
 * `WORD_PICTURES` ids). `reply`: what to answer a character's line, in Kurdish. `missing`: the word for the line's gap
 * (`GAP`). `to-english` and `to-kurdish`: translate the line. `hear`: what the recording says. `repeat`: say the line after
 * its speaker. `choose-kurdish`: which Kurdish says the English line.
 */
export type ExerciseAsk = 'meaning' | 'choose-kurdish' | 'picture' | 'reply' | 'missing' | 'to-english' | 'to-kurdish' | 'hear' | 'repeat';

export const EXERCISE_ASKS: readonly ExerciseAsk[] = ['meaning', 'choose-kurdish', 'picture', 'reply', 'missing', 'to-english', 'to-kurdish', 'hear', 'repeat'];

/** Which asks each exercise type can make. */
export const ASKS_BY_TYPE: Readonly<Partial<Record<ExerciseType, readonly ExerciseAsk[]>>> = {
  multiple_choice: ['meaning', 'choose-kurdish', 'picture', 'reply', 'missing'],
  translate: ['to-english', 'to-kurdish'],
  writing: ['to-kurdish', 'missing'],
  listening: ['hear'],
  speaking: ['repeat'],
};

/** The gap in a `missing` item's line, where the chosen word goes. */
export const GAP = '___';

/** A `missing` item's line around its gap, or null when the line has no single gap. */
export function splitGap(line: string): { before: string; after: string } | null {
  const at = line.indexOf(GAP);
  if (at < 0 || line.indexOf(GAP, at + GAP.length) >= 0) return null;
  return { before: line.slice(0, at), after: line.slice(at + GAP.length) };
}

/** A word an item brings in for the first time, with what it means. */
export interface NewWord {
  ku: string;
  en: string;
}

/** An exercise as the server delivers it: the answer is never in it. */
export interface DeliveredExercise {
  id: string;
  /** a lesson's order; practice items have none */
  position?: number;
  type: ExerciseType;
  /** the line the bubble holds when `ask` is said; otherwise the item's whole question */
  prompt?: string;
  /** what the item asks; absent on items written before asks existed */
  ask?: ExerciseAsk;
  /** a few words of context beside the line, where the line alone could be read two ways */
  cue?: string;
  /** the words this item brings in for the first time, with their meanings */
  newWords?: NewWord[];
  /** multiple choice, in the order this session shows them (picture ids for a `picture` item) */
  options?: string[];
  /** match pairs: the Kurdish cards, and their meanings, each side shuffled */
  lefts?: string[];
  rights?: string[];
  /** match pairs: for each card in `lefts` as shown, the index in `rights` as shown of its meaning */
  pairOf?: number[];
  /** translate and listening: the tiles to build the answer from, its words and a few decoys, in the order shown */
  bank?: string[];
  /** the prompt as its words and what lies between them, in order; joined they give `prompt` back */
  promptTokens?: PromptToken[];
  /** listening: the clip to play */
  audioUrl?: string;
  /** who says `audioUrl` and how their mouth moves, when a character is chosen for it */
  audioVoice?: RecordingVoice;
  /** a native recording that may be played before answering; present only when there is one */
  modelAudioUrl?: string;
  /** who says `modelAudioUrl`, when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
  /** match pairs: recordings of the Kurdish cards, by the card's exact text */
  audio?: Record<string, string>;
  /** who says the cards' recordings, by the same text, for those with a character */
  audioVoices?: Record<string, RecordingVoice>;
  /** conversation: what it is about, when the author named it */
  title?: string;
  /** conversation: who takes part, by the place their lines name */
  speakers?: ConversationSpeaker[];
  /** conversation: what is said, in order; `options` then holds the answers to `prompt`, the question about it */
  lines?: ConversationLine[];
  /** conversation: each line's recording by its place, null when not recorded yet */
  lineAudio?: Array<string | null>;
  /** conversation: who says each line's recording, null where there is none or no character is chosen */
  lineVoices?: Array<RecordingVoice | null>;
  /** The variety of the item's course: a review mixes courses so each item says its own, while a lesson's session says it once. */
  dialect?: string;
}

/** A piece of a prompt: a word, or what lies between two. */
export interface PromptToken {
  text: string;
  /** what this word means, likeliest first (at most 3); absent for spaces, punctuation and words the course does not know */
  meanings?: string[];
}

/** An answer the server has already recorded in this session. */
export interface RecordedAnswer {
  verdict: Verdict;
  accepted: boolean;
}

/** What the player needs of a session: a lesson's session view, or a practice session. */
export interface PlayableSession {
  sessionId: string;
  exercises: DeliveredExercise[];
  /** exercises already answered in a resumed lesson; practice starts with none */
  answered?: Record<string, RecordedAnswer>;
  completed?: boolean;
}

/** How the server graded an answer (`/answers`) or a second try (`/retry`). */
export interface GradeResult {
  verdict: Verdict;
  accepted: boolean;
  correction?: string;
  /** the native recording of the item's Kurdish, to hear now that it is answered */
  modelAudioUrl?: string;
  /** who says `modelAudioUrl`, when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
  /** the server had this answer already (a replay); a retry never does */
  duplicate?: boolean;
}

/** How many other exercises come between a miss and its second try. */
export const REASK_GAP = 3;

/** One turn of the lesson: an exercise, asked for the first time or again. */
export interface Step {
  exerciseId: string;
  /** the second try at a missed item, graded by retry and never recorded */
  reask: boolean;
}

export type PlayerStatus = 'answering' | 'feedback' | 'finished';

export interface Feedback {
  verdict: Verdict;
  accepted: boolean;
  correction?: string;
  modelAudioUrl?: string;
  modelAudioVoice?: RecordingVoice;
  /** what was answered, since a recording is not graded the way typed text is */
  exerciseType?: ExerciseType;
  /** the text the learner typed, for an answer that was typed */
  given?: string;
  /** this was the second try at a missed item */
  reask?: boolean;
  /** this miss will be asked again later in the session */
  comesBack?: boolean;
}

export interface PlayerState {
  exercises: DeliveredExercise[];
  /** every turn, in order: those already taken, then those to come */
  steps: Step[];
  /** the step on screen (`steps.length` once finished) */
  index: number;
  status: PlayerStatus;
  feedback: Feedback | null;
  /** exercises with a first answer recorded */
  answeredCount: number;
  /** exercises whose second try was answered, kept to resume without asking twice */
  reasked: string[];
  /** exercises put off this time ("can't listen now"): neither answered nor mistakes */
  skipped: string[];
  /** The last kind of exercise put off for the rest of the session ("no more listening"), so it can be put back; else null. */
  putAway: PutAway | null;
}

/** The exercises a learner can put off for the rest of a session, all of a kind at once. */
export type PutAwayType = 'listening' | 'speaking';

export interface PutAway {
  type: PutAwayType;
  /** The steps taken out, in order, each with the step after it that stayed (null when it was last), where it goes back. */
  removed: Array<{ step: Step; before: Step | null }>;
}

export type PlayerAction =
  /** `given` is the typed text, so feedback can set it beside the right answer */
  | { type: 'ANSWERED'; result: GradeResult; given?: string }
  | { type: 'CONTINUE' }
  /**
   * Puts the exercise on screen off. With `all`, every exercise of that type still to come goes too, for the rest of the
   * session; `UNSKIP` brings them back.
   */
  | { type: 'SKIP'; all?: PutAwayType }
  | { type: 'UNSKIP' }
  | { type: 'FINISH' };

export interface ResumeMemory {
  /** exercises whose second try was answered before the learner left */
  reasked?: readonly string[];
}

function insertAt<T>(list: T[], at: number, item: T): T[] {
  const next = [...list];
  next.splice(Math.min(Math.max(at, 0), next.length), 0, item);
  return next;
}

/**
 * The player for a session, fresh or resumed. A resumed lesson picks up at the first unanswered exercise in lesson order,
 * so a skipped one is asked again and nothing answered twice. A miss whose second try had not happened comes back as it
 * would have. The server never records second tries, so a client that remembers them passes them in `memory`; without it
 * the learner just gets one extra question.
 */
export function initPlayer(session: PlayableSession, memory: ResumeMemory = {}): PlayerState {
  const answered = session.answered ?? {};
  const reasked = (memory.reasked ?? []).filter((id) => answered[id] && !answered[id].accepted);
  const taken = session.exercises.filter((ex) => ex.id in answered);
  const open = session.exercises.filter((ex) => !(ex.id in answered));
  let steps: Step[] = [...taken, ...open].map((ex) => ({ exerciseId: ex.id, reask: false }));
  const index = taken.length;
  taken
    .filter((ex) => !answered[ex.id]!.accepted && !reasked.includes(ex.id))
    .forEach((ex, k) => {
      steps = insertAt(steps, index + REASK_GAP + k, { exerciseId: ex.id, reask: true });
    });
  const done = session.completed === true || index >= steps.length;
  return {
    exercises: session.exercises,
    steps,
    index: done ? steps.length : index,
    status: done ? 'finished' : 'answering',
    feedback: null,
    answeredCount: taken.length,
    reasked,
    skipped: [],
    putAway: null,
  };
}

export function currentStep(state: PlayerState): Step | null {
  return state.status === 'finished' ? null : (state.steps[state.index] ?? null);
}

export function currentExercise(state: PlayerState): DeliveredExercise | null {
  const step = currentStep(state);
  return step ? (state.exercises.find((ex) => ex.id === step.exerciseId) ?? null) : null;
}

/** Whether the step on screen is a second try, graded by retry and recorded nowhere. */
export function isReask(state: PlayerState): boolean {
  return currentStep(state)?.reask ?? false;
}

/** Progress through the session, 0..1: turns taken of turns there are. A miss adds a turn, so it moves the bar less and never back. */
export function progress(state: PlayerState): number {
  if (state.status === 'finished') return 1;
  if (state.steps.length === 0) return 0;
  return (state.index + (state.status === 'feedback' ? 1 : 0)) / state.steps.length;
}

/** Moves past the last step: the session is finished. */
function advance(state: PlayerState): PlayerState {
  const next = state.index + 1;
  if (next >= state.steps.length) return { ...state, index: state.steps.length, status: 'finished', feedback: null };
  return { ...state, index: next, status: 'answering', feedback: null };
}

/** Whether two steps are the same turn; an exercise is asked at most once first and once again. */
function sameStep(a: Step, b: Step): boolean {
  return a.exerciseId === b.exerciseId && a.reask === b.reask;
}

/**
 * Takes out every later step whose exercise is of `type`, a first ask counted as put off and a second try dropped, each
 * remembering the step that stayed after it so `putBack` can restore it.
 */
function putAway(state: PlayerState, type: PutAwayType): PlayerState {
  const typeOf = new Map(state.exercises.map((ex) => [ex.id, ex.type]));
  const ahead = state.steps.slice(state.index + 1);
  const goes = ahead.map((s) => typeOf.get(s.exerciseId) === type);
  if (!goes.some(Boolean)) return { ...state, putAway: null };
  const removed = ahead.flatMap((step, i) => (goes[i] ? [{ step, before: ahead.find((_, j) => j > i && !goes[j]) ?? null }] : []));
  const firsts = removed.filter((r) => !r.step.reask && !state.skipped.includes(r.step.exerciseId)).map((r) => r.step.exerciseId);
  return {
    ...state,
    steps: [...state.steps.slice(0, state.index + 1), ...ahead.filter((_, i) => !goes[i])],
    skipped: [...state.skipped, ...firsts],
    putAway: { type, removed },
  };
}

/**
 * Puts back what `putAway` took out, each before the step it came before; one whose place has passed is asked next. The
 * exercise that was on screen at the time stays put off, as a single skip leaves it.
 */
function putBack(state: PlayerState, away: PutAway): PlayerState {
  const from = state.index + (state.status === 'feedback' ? 1 : 0);
  const tail = state.steps.slice(from);
  const ahead = (s: Step): boolean => tail.some((t) => sameStep(t, s));
  const before = (anchor: Step): Step[] => away.removed.filter((r) => r.before && sameStep(r.before, anchor)).map((r) => r.step);
  const passed = away.removed.filter((r) => r.before && !ahead(r.before)).map((r) => r.step);
  const last = away.removed.filter((r) => !r.before).map((r) => r.step);
  const back = new Set(away.removed.filter((r) => !r.step.reask).map((r) => r.step.exerciseId));
  return {
    ...state,
    steps: [...state.steps.slice(0, from), ...passed, ...tail.flatMap((t) => [...before(t), t]), ...last],
    skipped: state.skipped.filter((id) => !back.has(id)),
    putAway: null,
  };
}

export function reduce(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'ANSWERED': {
      const step = currentStep(state);
      if (state.status !== 'answering' || !step) return state;
      const { verdict, accepted, correction, modelAudioUrl, modelAudioVoice, duplicate } = action.result;
      const id = step.exerciseId;
      // A miss comes back once: never a second try at a second try.
      const comesBack =
        !step.reask &&
        !accepted &&
        !state.reasked.includes(id) &&
        !state.steps.some((s) => s.reask && s.exerciseId === id);
      const steps = comesBack ? insertAt(state.steps, state.index + 1 + REASK_GAP, { exerciseId: id, reask: true }) : state.steps;
      const feedback: Feedback = {
        verdict,
        accepted,
        correction,
        modelAudioUrl,
        ...(modelAudioVoice ? { modelAudioVoice } : {}),
        exerciseType: state.exercises.find((ex) => ex.id === id)?.type,
        given: action.given,
        ...(step.reask ? { reask: true } : {}),
        ...(comesBack ? { comesBack: true } : {}),
      };
      return {
        ...state,
        steps,
        status: 'feedback',
        feedback,
        // A second try is not an answer, and a replayed one was counted already.
        answeredCount: step.reask || duplicate ? state.answeredCount : state.answeredCount + 1,
        reasked: step.reask ? [...state.reasked, id] : state.reasked,
      };
    }
    case 'CONTINUE':
      return state.status === 'feedback' ? advance(state) : state;
    case 'SKIP': {
      // Put the exercise off ("can't listen now"): no answer, no mistake, no second try.
      const step = currentStep(state);
      if (state.status !== 'answering' || !step) return state;
      const skipped = step.reask || state.skipped.includes(step.exerciseId) ? state.skipped : [...state.skipped, step.exerciseId];
      return advance(action.all ? putAway({ ...state, skipped }, action.all) : { ...state, skipped });
    }
    case 'UNSKIP':
      return state.putAway && state.status !== 'finished' ? putBack(state, state.putAway) : state;
    case 'FINISH':
      return { ...state, index: state.steps.length, status: 'finished', feedback: null };
  }
}

/**
 * What the feedback says of an answer, which must be true of it. A strict spelling item grades a letter slip as a typo that
 * is not accepted, so "almost" comes in two kinds. The server never judges a spoken answer: its verdict is the learner's
 * own rating, and the feedback says so rather than "correct".
 */
export type FeedbackKind = 'correct' | 'almost' | 'almostStrict' | 'notYet' | 'spokenGood' | 'spokenClose' | 'spokenRetry';

export function feedbackKind(feedback: Pick<Feedback, 'verdict' | 'accepted' | 'exerciseType'>): FeedbackKind {
  if (feedback.exerciseType === 'speaking') {
    if (!feedback.accepted) return 'spokenRetry';
    return feedback.verdict === 'correct' ? 'spokenGood' : 'spokenClose';
  }
  if (feedback.verdict === 'typo') return feedback.accepted ? 'almost' : 'almostStrict';
  return feedback.accepted ? 'correct' : 'notYet';
}

/**
 * A run of right answers in a row, shown from this count and called out at a milestone (`runMilestone`). A spoken answer is
 * a self-rating, so it neither extends nor breaks a run; any other miss starts it again.
 */
export const RUN_SHOWN_FROM = 3;

export function nextRun(run: number, feedback: Pick<Feedback, 'accepted' | 'exerciseType'>): number {
  if (feedback.exerciseType === 'speaking') return run;
  return feedback.accepted ? run + 1 : 0;
}

/** The runs worth a cheer: 5, 10, then every fifth from 15, so a milestone keeps its value. */
export function runMilestone(run: number): number | null {
  return run >= 5 && run % 5 === 0 ? run : null;
}

/**
 * When a verdict's parts arrive, in ms from the answer, alike on both apps: the sheet rises (`sheetMs`), the character
 * reacts (`actAtMs`), a milestone's run pill pops (`runAtMs`, over `runMs`), and the native recording plays (`modelAtMs`)
 * after the chime.
 */
export const VERDICT_TIMING = { sheetMs: 200, actAtMs: 120, runAtMs: 160, runMs: 320, modelAtMs: 350 } as const;

/** The first-time misses of a session's results that practice can take ("practise these now"); practice cannot grade speaking. */
export function practisableMistakes(
  mistakes: ReadonlyArray<{ exerciseId: string }>,
  exercises: ReadonlyArray<DeliveredExercise>,
): string[] {
  const types = new Map(exercises.map((ex) => [ex.id, ex.type]));
  return mistakes.map((m) => m.exerciseId).filter((id) => types.has(id) && types.get(id) !== 'speaking');
}

/** An answer waiting for the network. */
export interface PendingAnswer {
  exerciseId: string;
  answer: unknown;
}

/** Submits one pending answer; resolves `null` while still offline. */
export type SubmitFn<R> = (pending: PendingAnswer) => Promise<R | null>;

/**
 * The offline answer buffer: answers made while the network is down queue here and are sent in order on reconnect. A failed
 * send stops the flush and keeps the rest queued, so nothing is lost or reordered.
 */
export class AnswerQueue {
  private items: PendingAnswer[] = [];

  enqueue(pending: PendingAnswer): void {
    this.items.push(pending);
  }

  get pending(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Sends queued answers in order and returns the results of those that went through. `submit` returns null while the
   * network still fails; the flush then stops with that answer and the rest still queued.
   */
  async flush<R>(submit: SubmitFn<R>): Promise<R[]> {
    const sent: R[] = [];
    while (this.items.length > 0) {
      const next = this.items[0]!;
      const result = await submit(next);
      if (result === null) break; // still offline: keep it and stop
      this.items.shift();
      sent.push(result);
    }
    return sent;
  }
}
