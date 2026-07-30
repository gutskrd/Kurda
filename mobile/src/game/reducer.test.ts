import { describe, expect, it } from 'vitest';
import type { GameEvent, ScoreLine } from './events';
import { initGameState, opponentAnswered, reduce, selfResult, type GameState } from './reducer';

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
