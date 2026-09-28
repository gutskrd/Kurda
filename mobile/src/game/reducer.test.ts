import { describe, expect, it } from 'vitest';
import type { GameEvent, ScoreLine } from './events';
import { initGameState, opponentAnswered, reduce, selfResult, type GameSnapshot, type GameState } from './reducer';

const SELF = 'me';
const OPP = 'them';

function apply(state: GameState, ...events: GameEvent[]): GameState {
  return events.reduce((s, event) => reduce(s, { type: 'server', event }), state);
}

const question: GameEvent = { type: 'question', index: 0, total: 3, prompt: 'Q', options: ['a', 'b', 'c', 'd'], endsAt: 1000 };

describe('reduce — flow', () => {
  it('starts connecting and moves through countdown → question', () => {
    let s = initGameState(SELF);
    expect(s.phase).toBe('connecting');
    s = apply(s, { type: 'countdown', startsAt: 500 });
    expect(s.phase).toBe('countdown');
    s = apply(s, question);
    expect(s.phase).toBe('question');
    expect(s.question?.total).toBe(3);
    expect(s.myChoice).toBeNull();
  });

  it('records this player\'s choice once, only while the question is open', () => {
    let s = apply(initGameState(SELF), question);
    s = reduce(s, { type: 'choose', choice: 2 });
    expect(s.myChoice).toBe(2);
    // second choice ignored
    s = reduce(s, { type: 'choose', choice: 1 });
    expect(s.myChoice).toBe(2);
  });

  it('ignores a choice outside the question phase', () => {
    const s = reduce(initGameState(SELF), { type: 'choose', choice: 0 });
    expect(s.myChoice).toBeNull();
  });

  it('tracks the opponent answering in real time', () => {
    let s = apply(initGameState(SELF), question);
    expect(opponentAnswered(s)).toBe(false);
    s = apply(s, { type: 'player_answered', userId: OPP, index: 0 });
    expect(opponentAnswered(s)).toBe(true);
    // self answering doesn't count as "opponent answered"
    s = apply(initGameState(SELF), question, { type: 'player_answered', userId: SELF, index: 0 });
    expect(opponentAnswered(s)).toBe(false);
  });

  it('resets per-question state on the next question', () => {
    let s = apply(initGameState(SELF), question);
    s = reduce(s, { type: 'choose', choice: 0 });
    s = apply(s, { type: 'player_answered', userId: OPP, index: 0 });
    s = apply(s, { type: 'question', index: 1, total: 3, prompt: 'Q2', options: ['a', 'b', 'c', 'd'], endsAt: 2000 });
    expect(s.myChoice).toBeNull();
    expect(s.answered).toEqual([]);
    expect(s.reveal).toBeNull();
  });

  it('applies reveal, scoreboard and final results', () => {
    const scores: ScoreLine[] = [
      { userId: SELF, username: 'Me', points: 1200, rank: 1, correct: 2 },
      { userId: OPP, username: 'Them', points: 800, rank: 2, correct: 1 },
    ];
    let s = apply(initGameState(SELF), question,
      { type: 'reveal', index: 0, correctIndex: 2, answers: { [SELF]: 2, [OPP]: 1 } },
      { type: 'scoreboard', index: 0, scores },
    );
    expect(s.phase).toBe('reveal');
    expect(s.reveal?.correctIndex).toBe(2);
    expect(s.scoreboard).toHaveLength(2);

    s = apply(s, { type: 'results', provisional: false, scores });
    expect(s.phase).toBe('results');
    expect(selfResult(s)).toMatchObject({ rank: 1, points: 1200 });
  });

  it('clears the optimistic choice when the server rejects a late answer', () => {
    let s = apply(initGameState(SELF), question);
    s = reduce(s, { type: 'choose', choice: 3 });
    s = apply(s, { type: 'answer_rejected', index: 0, code: 'ANSWER_TOO_LATE' });
    expect(s.myChoice).toBeNull();
    expect(s.rejected).toBe(true);
  });
});

describe('reduce — the reconnect snapshot', () => {
  const snap = (over: Partial<GameSnapshot> = {}): GameSnapshot => ({
    phase: 'question',
    questionIndex: 1,
    questionCount: 3,
    players: [{ id: SELF, username: 'me' }, { id: OPP, username: 'them' }],
    ...over,
  });

  /**
   * The count is the reason this action exists rather than reusing `question`.
   * `GameEngine.getSnapshot` puts `index`, `prompt`, `options` and `endsAt` on
   * `currentQuestion` and leaves the total *outside* it, as `questionCount` — so
   * anything that takes `currentQuestion` at face value renders "question 2 of
   * undefined". The browser's copy of this does exactly that.
   */
  it('takes the question count from beside the question, not from inside it', () => {
    const s = reduce(initGameState(SELF), {
      type: 'snapshot',
      snapshot: snap({ currentQuestion: { index: 1, prompt: 'Q2', options: ['a', 'b'], endsAt: 9000 } }),
    });
    expect(s.phase).toBe('question');
    expect(s.question).toEqual({ index: 1, total: 3, prompt: 'Q2', options: ['a', 'b'], endsAt: 9000 });
  });

  it('reads who has already answered the open question', () => {
    const s = reduce(initGameState(SELF), {
      type: 'snapshot',
      snapshot: snap({
        players: [{ id: SELF, username: 'me' }, { id: OPP, username: 'them', answeredCurrent: true }],
        currentQuestion: { index: 1, prompt: 'Q2', options: ['a'], endsAt: 9000 },
      }),
    });
    expect(s.answered).toEqual([OPP]);
    expect(opponentAnswered(s)).toBe(true);
  });

  /* lobby and countdown carry no question; the phase alone is the news */
  it('keeps the phase without inventing a question', () => {
    const s = reduce(initGameState(SELF), { type: 'snapshot', snapshot: snap({ phase: 'lobby' }) });
    expect(s.phase).toBe('lobby');
    expect(s.question).toBeNull();
  });

  it('restores the scores of a finished game', () => {
    const scores: ScoreLine[] = [
      { userId: SELF, username: 'me', points: 3, correct: 3, rank: 1 },
      { userId: OPP, username: 'them', points: 1, correct: 1, rank: 2 },
    ];
    const s = reduce(initGameState(SELF), { type: 'snapshot', snapshot: snap({ phase: 'results', scores }) });
    expect(s.phase).toBe('results');
    expect(selfResult(s)?.rank).toBe(1);
  });

  /**
   * The one ordering that would be visible and wrong. A snapshot in flight when
   * the results land would otherwise reopen a finished game underneath somebody
   * reading their score.
   */
  it('never reopens a game that has already finished', () => {
    const finished = apply(initGameState(SELF), {
      type: 'results',
      provisional: false,
      scores: [{ userId: SELF, username: 'me', points: 2, correct: 2, rank: 1 }],
    });
    const s = reduce(finished, {
      type: 'snapshot',
      snapshot: snap({ currentQuestion: { index: 1, prompt: 'Q2', options: ['a'], endsAt: 9000 } }),
    });
    expect(s).toBe(finished);
  });
});
