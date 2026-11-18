import {
  DEFAULT_QUESTION_COUNT,
  DEFAULT_TIMER,
  QUESTION_COUNTS_BY_LENGTH,
  STORY_LENGTHS,
  isAllowedQuestionCount,
  type GameAccess,
  type QuestionCount,
  type StoryDialect,
  type StoryGameMode,
  type StoryLength,
  type StoryListItem,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import type { CreateGameInput } from './api';
import type { SoloQuizPrefs } from './prefs';

/**
 * The setup sheet's rules (contract §A1 "Setup sheet"): presets only, and only playable ones. Lengths are offered
 * where the variety has a published story; question counts are those the length allows, and switching length moves
 * an impossible count to its default. The timer follows the mode's default (none solo, a minute together) until
 * picked. A chosen story fixes the length; otherwise the server picks one ("Surprise me", unfinished first).
 */

export interface SetupState {
  mode: StoryGameMode;
  dialect: StoryDialect;
  /** A story the host picked (or the one being read); null for "Surprise me". */
  storyId: string | null;
  length: StoryLength;
  questionCount: QuestionCount;
  timerSeconds: TimerSeconds;
  /** The host changed the timer, so a mode change no longer resets it. */
  timerChosen: boolean;
  textDuring: TextDuring;
  access: GameAccess;
}

/** Lengths with at least one published story in this variety, shortest first. */
export function availableLengths(stories: readonly StoryListItem[], dialect: StoryDialect): StoryLength[] {
  const have = new Set(stories.filter((s) => s.dialect === dialect).map((s) => s.length));
  return STORY_LENGTHS.filter((l) => have.has(l));
}

export function initialSetup(opts: {
  mode: StoryGameMode;
  dialect: StoryDialect;
  story?: Pick<StoryListItem, 'id' | 'length'> | null;
  length?: StoryLength;
  /** What "Quiz yourself" was last set to on this phone (solo only). */
  solo?: SoloQuizPrefs;
}): SetupState {
  const length = opts.story?.length ?? opts.length ?? 'short';
  const remembered = opts.mode === 'solo' ? opts.solo : undefined;
  const count = remembered?.questionCount[length];
  return {
    mode: opts.mode,
    dialect: opts.dialect,
    storyId: opts.story?.id ?? null,
    length,
    questionCount: count && isAllowedQuestionCount(length, count) ? count : DEFAULT_QUESTION_COUNT[length],
    timerSeconds: remembered ? remembered.timerSeconds : DEFAULT_TIMER[opts.mode],
    timerChosen: !!remembered,
    textDuring: remembered?.textDuring ?? 'visible',
    access: 'friends',
  };
}

/** One change, with what it implies for the rest. */
export function changeSetup(state: SetupState, patch: Partial<Omit<SetupState, 'timerChosen'>>): SetupState {
  const next: SetupState = { ...state, ...patch };
  if (patch.timerSeconds !== undefined) next.timerChosen = true;
  if (patch.mode !== undefined && patch.mode !== state.mode && !next.timerChosen) {
    next.timerSeconds = DEFAULT_TIMER[patch.mode];
  }
  // A solo game has nobody to let in.
  if (next.mode === 'solo') next.access = 'friends';
  if (patch.length !== undefined && patch.length !== state.length) {
    // A story of the old length cannot be this length.
    if (patch.storyId === undefined) next.storyId = null;
    if (!isAllowedQuestionCount(next.length, next.questionCount)) next.questionCount = DEFAULT_QUESTION_COUNT[next.length];
  }
  return next;
}

export function questionCountsFor(length: StoryLength): readonly QuestionCount[] {
  return QUESTION_COUNTS_BY_LENGTH[length];
}

/** What POST /story-games is sent. */
export function createInput(state: SetupState, opts: { skipReading?: boolean; extraTime?: boolean } = {}): CreateGameInput {
  return {
    mode: state.mode,
    ...(state.storyId ? { storyId: state.storyId } : { dialect: state.dialect, length: state.length }),
    questionCount: state.questionCount,
    timerSeconds: state.timerSeconds,
    textDuring: state.textDuring,
    access: state.mode === 'solo' ? 'friends' : state.access,
    ...(opts.skipReading ? { skipReading: true } : {}),
    ...(opts.extraTime ? { extraTime: true } : {}),
  };
}

/** The same settings for a lobby made through an invite (POST /play/lobbies, game 'stories'). */
export function inviteSettings(state: SetupState): Record<string, unknown> {
  const mode = state.mode === 'solo' ? 'duo' : state.mode;
  return {
    mode,
    ...(state.storyId ? { storyId: state.storyId } : { dialect: state.dialect, length: state.length }),
    questionCount: state.questionCount,
    timerSeconds: state.timerSeconds,
    textDuring: state.textDuring,
    access: state.access,
  };
}
