import type { GameEvent, ScoreLine } from './events';

/**
 * Pure 1v1 game state (KUR-054). Consumes server events (KUR-051–053) and a
 * couple of local actions, producing the state the UI renders. No timers, no
 * sockets — the socket hook feeds events in and the screen reads state out,
 * so the whole match flow is unit-testable.
 */

export type GamePhase = 'connecting' | 'lobby' | 'countdown' | 'question' | 'reveal' | 'results';

export interface CurrentQuestion {
  index: number;
  total: number;
  prompt: string;
  options: string[];
  endsAt: number;
}

export interface GameState {
  selfId: string;
  phase: GamePhase;
  countdownStartsAt: number | null;
  question: CurrentQuestion | null;
  /** the option this player chose for the current question (null = not yet) */
  myChoice: number | null;
  /** userIds who have answered the current question (opponent thinking/answered) */
  answered: string[];
  reveal: { index: number; correctIndex: number; answers: Record<string, number | null> } | null;
  scoreboard: ScoreLine[];
  results: { provisional: boolean; scores: ScoreLine[] } | null;
  /** set when the server rejected this player's last answer (too late) */
  rejected: boolean;
}

/**
 * `GET /games/:roomId/state` — the reconnect snapshot, exactly as the engine
 * sends it (`GameEngine.getSnapshot`). Note what is *not* on `currentQuestion`:
 * there is no `total`, so the count comes from `questionCount` alongside it.
 */
export interface GameSnapshot {
  phase: GamePhase;
  questionIndex: number;
  questionCount: number;
  players: Array<{ id: string; username: string; answeredCurrent?: boolean }>;
  currentQuestion?: { index: number; prompt: string; options: string[]; endsAt: number };
  scores?: ScoreLine[];
}

export type GameAction =
  | { type: 'server'; event: GameEvent }
  | { type: 'choose'; choice: number }
  | { type: 'snapshot'; snapshot: GameSnapshot };

export function initGameState(selfId: string): GameState {
  return {
    selfId,
    phase: 'connecting',
    countdownStartsAt: null,
    question: null,
    myChoice: null,
    answered: [],
    reveal: null,
    scoreboard: [],
    results: null,
    rejected: false,
  };
}

export function reduce(state: GameState, action: GameAction): GameState {
  /*
   * Rejoining a game already in progress.
   *
   * The socket only ever brought events, so a phone that reconnected — or opened
   * the room a second time after being backgrounded — sat on a spinner until the
   * *next* question, missing the one on screen. The engine has answered this
   * since KUR-051 and the route comment says so ("resume lands here"); nothing
   * on the phone had asked.
   *
   * Never applied over a finished game: a late snapshot must not reopen results
   * somebody is already reading.
   */
  if (action.type === 'snapshot') {
    if (state.phase === 'results') return state;
    const s = action.snapshot;
    return {
      ...state,
      phase: s.phase,
      question: s.currentQuestion
        ? {
            index: s.currentQuestion.index,
            // the count lives beside `currentQuestion`, not inside it
            total: s.questionCount,
            prompt: s.currentQuestion.prompt,
            options: s.currentQuestion.options,
            endsAt: s.currentQuestion.endsAt,
          }
        : state.question,
      // who has answered the open question, which the snapshot reports per player
      answered: s.players.filter((p) => p.answeredCurrent).map((p) => p.id),
      scoreboard: s.scores ?? state.scoreboard,
      results: s.phase === 'results' && s.scores ? { provisional: false, scores: s.scores } : state.results,
    };
  }

  if (action.type === 'choose') {
    // one answer per question, only while it's open
    if (state.phase !== 'question' || state.myChoice !== null) return state;
    return { ...state, myChoice: action.choice, rejected: false };
  }

  const e = action.event;
  switch (e.type) {
    case 'countdown':
      return { ...state, phase: 'countdown', countdownStartsAt: e.startsAt, results: null };
    case 'question':
      return {
        ...state,
        phase: 'question',
        question: { index: e.index, total: e.total, prompt: e.prompt, options: e.options, endsAt: e.endsAt },
        myChoice: null,
        answered: [],
        reveal: null,
        rejected: false,
      };
    case 'player_answered':
      if (state.answered.includes(e.userId)) return state;
      return { ...state, answered: [...state.answered, e.userId] };
    case 'reveal':
      return { ...state, phase: 'reveal', reveal: { index: e.index, correctIndex: e.correctIndex, answers: e.answers } };
    case 'scoreboard':
      return { ...state, scoreboard: e.scores };
    case 'results':
      return { ...state, phase: 'results', results: { provisional: e.provisional, scores: e.scores } };
    case 'answer_rejected':
      // clear the optimistic choice so the UI stops showing it as accepted
      return { ...state, myChoice: null, rejected: true };
  }
}

/** Did the opponent answer the current question? (self excluded) */
export function opponentAnswered(state: GameState): boolean {
  return state.answered.some((id) => id !== state.selfId);
}

/** This player's final rank/line, if results are in. */
export function selfResult(state: GameState): ScoreLine | null {
  return state.results?.scores.find((s) => s.userId === state.selfId) ?? null;
}
