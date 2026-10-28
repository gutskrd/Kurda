/**
 * The lesson player's logic, once, for every client that plays a lesson.
 *
 * It lived in the phone app (mobile/src/lesson/player.ts), and the browser
 * needed the same thing: which exercise is on screen, what happens after an
 * answer, where a resumed lesson picks up. Two copies of that would disagree
 * about the one thing a learner notices first — what counts — so both clients
 * run this. It is pure: no React, no network, no clock. The server grades every
 * answer; this only decides what comes next.
 *
 * Two rules changed on the way here.
 *
 * Mistakes no longer end a lesson. There were five hearts, and the fifth wrong
 * answer ended the lesson then and there — which ends practice exactly when
 * the learner most needs it, for the learners who most need it. A mistake is
 * feedback now, and nothing else.
 *
 * A missed item comes back once, about three exercises later (`REASK_GAP`), or
 * at the end when fewer are left. Retrieving it again after a gap, with the
 * right answer fresh from the feedback, is the cheapest well-supported way to
 * make it stick; the web alphabet already does the same (`COMEBACK`). The
 * second try is graded through the session's retry endpoint, which records
 * nothing, so it never changes the score, the XP or the review schedule — the
 * first answer is the one that counts.
 */

import type { ConversationLine, ConversationSpeaker } from './conversation.js';
import type { RecordingVoice } from './lipsync/speakers.js';

export type ExerciseType = 'multiple_choice' | 'translate' | 'match_pairs' | 'listening' | 'speaking' | 'writing' | 'conversation';

/** 'correct' | 'typo' (right word, a letter slip) | 'wrong', as the server grades. */
export type Verdict = 'correct' | 'typo' | 'wrong';

/** How a learner judged their own recording, beside the native model. */
export type SelfRating = 'good' | 'close' | 'retry';

/** An exercise as the server delivers it: the answer is never in it. */
export interface DeliveredExercise {
  id: string;
  /** a lesson's order; practice items have none */
  position?: number;
  type: ExerciseType;
  prompt?: string;
  /** multiple choice, in the order this session shows them */
  options?: string[];
  /** match pairs: the Kurdish cards, and their meanings, each side shuffled */
  lefts?: string[];
  rights?: string[];
  /** listening: the clip to play */
  audioUrl?: string;
  /** who says `audioUrl`, and how their mouth moves; only when a character is chosen for it */
  audioVoice?: RecordingVoice;
  /** a native recording that may be played before answering (its presence says so) */
  modelAudioUrl?: string;
  /** who says `modelAudioUrl`; only when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
  /** match pairs: recordings of the Kurdish cards, by the card's exact text */
  audio?: Record<string, string>;
  /** who says the cards' recordings, by the same text; only the ones with a character */
  audioVoices?: Record<string, RecordingVoice>;
  /** conversation: what it is about, when the author named it */
  title?: string;
  /** conversation: who takes part, by the place their lines name */
  speakers?: ConversationSpeaker[];
  /** conversation: what is said, in order; `options` then holds the answers to `prompt`, the question about it */
  lines?: ConversationLine[];
  /** conversation: each line's recording by its place, null for one not recorded yet */
  lineAudio?: Array<string | null>;
  /** conversation: who says each line's recording, null where there is none or no character is chosen */
  lineVoices?: Array<RecordingVoice | null>;
  /**
   * The variety of Kurdish the item's course is in. A review mixes items from
   * any course, so each says its own; a lesson's session says it once for all.
   */
  dialect?: string;
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
  /** exercises already answered (a resumed lesson); practice starts with none */
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
  /** who says `modelAudioUrl`; only when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
  /** the server had this answer already (a replay); a retry never has one */
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
  /** what was answered: a recording is not graded the way typed text is */
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
  /** exercises whose second try has been answered — keep these to resume without asking twice */
  reasked: string[];
  /** exercises put off this time ("can't listen now"): not answered, not mistakes */
  skipped: string[];
  /**
   * The last time a whole kind of exercise was put off for the rest of the
   * session ("no more listening in this lesson"): what was taken out, so it
   * can be put back. Null when nothing was, or once it has been put back.
   */
  putAway: PutAway | null;
}

/** The exercises a learner can put off for the rest of a session, all of a kind at once. */
export type PutAwayType = 'listening' | 'speaking';

export interface PutAway {
  type: PutAwayType;
  /**
   * The steps taken out, in order, each with the step that came after it and
   * stayed (null for one that was last), which is where it goes back.
   */
  removed: Array<{ step: Step; before: Step | null }>;
}

export type PlayerAction =
  /** `given` is the text the learner typed, so feedback can set it beside the right answer */
  | { type: 'ANSWERED'; result: GradeResult; given?: string }
  | { type: 'CONTINUE' }
  /**
   * Put the exercise on screen off. With `all`, every exercise of that type
   * still to come goes with it, for the rest of the session ("can't listen
   * now" meant for the whole lesson); `UNSKIP` puts those back.
   */
  | { type: 'SKIP'; all?: PutAwayType }
  | { type: 'UNSKIP' }
  | { type: 'FINISH' };

export interface ResumeMemory {
  /** exercises whose second try was already answered before the learner left */
  reasked?: readonly string[];
}

function insertAt<T>(list: T[], at: number, item: T): T[] {
  const next = [...list];
  next.splice(Math.min(Math.max(at, 0), next.length), 0, item);
  return next;
}

/**
 * The player for a session, fresh or resumed.
 *
 * A resumed lesson picks up at the first exercise it has no answer for, in the
 * order the lesson asks them — skipping over answered ones, so an exercise put
 * off earlier is asked again and nothing answered is asked twice. A miss whose
 * second try had not happened yet comes back as it would have: `REASK_GAP`
 * exercises on, or at the end. The server knows the answers but not the second
 * tries (they are never recorded), so a client that remembers which it has
 * done passes them in `memory`; one that does not re-asks them, which costs
 * the learner one extra question and nothing else.
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

/** Whether the step on screen is a second try — graded by retry, recorded nowhere. */
export function isReask(state: PlayerState): boolean {
  return currentStep(state)?.reask ?? false;
}

/**
 * How far through the session the learner is, 0..1: turns taken out of turns
 * there are. A miss adds a turn (its second try), so it moves the bar on less
 * than a right answer does, and never back.
 */
export function progress(state: PlayerState): number {
  if (state.status === 'finished') return 1;
  if (state.steps.length === 0) return 0;
  return (state.index + (state.status === 'feedback' ? 1 : 0)) / state.steps.length;
}

/** Past the last step: the session is finished. */
function advance(state: PlayerState): PlayerState {
  const next = state.index + 1;
  if (next >= state.steps.length) return { ...state, index: state.steps.length, status: 'finished', feedback: null };
  return { ...state, index: next, status: 'answering', feedback: null };
}

/** Two steps are the same turn: an exercise is asked at most once first and once again. */
function sameStep(a: Step, b: Step): boolean {
  return a.exerciseId === b.exerciseId && a.reask === b.reask;
}

/**
 * Every step after the one on screen whose exercise is of `type` comes out —
 * a first ask counted as put off and a second try simply dropped, as when one
 * is skipped alone — and each remembers the step that stayed after it, so
 * `putBack` can return it to its place.
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
 * What `putAway` took out goes back, each step before the one it came before.
 * One whose place has gone by meanwhile (an answer was given in between) is
 * asked next, and one that was last is last again. The exercise on screen
 * when they were put away stays put off, as a single skip leaves it.
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
      // a miss comes back once: never a second try at a second try
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
        // a second try is not an answer, and a replayed one was counted already
        answeredCount: step.reask || duplicate ? state.answeredCount : state.answeredCount + 1,
        reasked: step.reask ? [...state.reasked, id] : state.reasked,
      };
    }
    case 'CONTINUE':
      return state.status === 'feedback' ? advance(state) : state;
    case 'SKIP': {
      // put the exercise off: no answer, no mistake, no second try
      // ("can't listen now", KUR-035)
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
 * What the feedback says of an answer, which must be true of it.
 *
 * A strict spelling item grades a letter slip (e for ê) as a typo that is NOT
 * accepted — the letter is what it tests — so "almost" comes in two kinds. A
 * spoken answer is not judged by the server at all: its verdict is the
 * learner's own rating of their recording beside the native model, and the
 * feedback says so rather than "correct".
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
 * A run: right answers in a row. It is shown from `RUN_SHOWN_FROM` ("3 in a
 * row") and named out loud at a milestone (`runMilestone`). A spoken answer
 * is the learner's own rating of a recording, not a grade, so it neither adds
 * to a run nor breaks one; any other miss starts it again.
 */
export const RUN_SHOWN_FROM = 3;

export function nextRun(run: number, feedback: Pick<Feedback, 'accepted' | 'exerciseType'>): number {
  if (feedback.exerciseType === 'speaking') return run;
  return feedback.accepted ? run + 1 : 0;
}

/**
 * The runs worth a word and a cheer: 5, 10, then every fifth from 15. Not
 * every right answer is a milestone, so the moment keeps its value.
 */
export function runMilestone(run: number): number | null {
  return run >= 5 && run % 5 === 0 ? run : null;
}

/**
 * When the parts of a verdict arrive, in ms from the answer, the same on both
 * apps: the sheet rises (`sheetMs`), the character reacts (`actAtMs`), a
 * milestone's run pill pops (`runAtMs`, over `runMs`), and the native
 * recording plays itself (`modelAtMs`) once the chime has had its moment.
 */
export const VERDICT_TIMING = { sheetMs: 200, actAtMs: 120, runAtMs: 160, runMs: 320, modelAtMs: 350 } as const;

/**
 * The exercises answered wrong for the first time in a session's results that
 * practice can take ("practise these now"): practice cannot grade speaking.
 */
export function practisableMistakes(
  mistakes: ReadonlyArray<{ exerciseId: string }>,
  exercises: ReadonlyArray<DeliveredExercise>,
): string[] {
  const types = new Map(exercises.map((ex) => [ex.id, ex.type]));
  return mistakes.map((m) => m.exerciseId).filter((id) => types.has(id) && types.get(id) !== 'speaking');
}

/** A pending answer, waiting for the network (KUR-029 edge case). */
export interface PendingAnswer {
  exerciseId: string;
  answer: unknown;
}

/** Submits one pending answer; resolves `null` while still offline. */
export type SubmitFn<R> = (pending: PendingAnswer) => Promise<R | null>;

/**
 * Offline answer buffer. When the network drops mid-lesson, answers are
 * appended here and flushed in order on reconnect. FIFO and order-preserving:
 * a failed submit stops the flush and keeps the remaining answers queued, so
 * nothing is lost or reordered.
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
   * Flush queued answers in order. `submit` returns the server result, or
   * `null` to signal a still-failing network — flushing halts and the
   * unsent answers (including the failed one) remain queued. Returns the
   * results of the answers that went through, in order.
   */
  async flush<R>(submit: SubmitFn<R>): Promise<R[]> {
    const sent: R[] = [];
    while (this.items.length > 0) {
      const next = this.items[0]!;
      const result = await submit(next);
      if (result === null) break; // still offline — keep it and stop
      this.items.shift();
      sent.push(result);
    }
    return sent;
  }
}
