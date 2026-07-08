import { describe, expect, it } from 'vitest';
import {
  STARTING_HEARTS,
  currentExercise,
  initPlayer,
  outOfHearts,
  progress,
  reduce,
  type PlayerState,
} from './player';
import type { AnswerResult, Exercise, SessionView } from './types';

const exercises: Exercise[] = [
  { id: 'a', position: 1, type: 'multiple_choice', prompt: '1', options: ['x', 'y'] },
  { id: 'b', position: 2, type: 'translate', prompt: 'apple' },
  { id: 'c', position: 3, type: 'match_pairs', lefts: ['sêv'], rights: ['apple'] },
];

const view = (over: Partial<SessionView> = {}): SessionView => ({
  sessionId: 's1',
  lessonId: 'l1',
  expiresAt: '2999-01-01T00:00:00Z',
  completed: false,
  exercises,
  answered: {},
  ...over,
});

const answer = (over: Partial<AnswerResult> = {}): AnswerResult => ({
  verdict: 'correct',
  accepted: true,
  duplicate: false,
  ...over,
});

describe('initPlayer', () => {
  it('starts fresh at the first exercise with full hearts', () => {
    const s = initPlayer(view());
    expect(s.index).toBe(0);
    expect(s.hearts).toBe(STARTING_HEARTS);
    expect(s.status).toBe('answering');
    expect(progress(s)).toBe(0);
  });

  it('resumes at the first unanswered exercise, keeping lost hearts', () => {
    const s = initPlayer(
      view({
        answered: {
          a: { verdict: 'correct', accepted: true },
          b: { verdict: 'wrong', accepted: false },
        },
      }),
    );
    expect(s.index).toBe(2); // c is next
    expect(s.answeredCount).toBe(2);
    expect(s.hearts).toBe(STARTING_HEARTS - 1); // one wrong earlier
  });

  it('is finished when the session is already complete', () => {
    const s = initPlayer(view({ completed: true }));
    expect(s.status).toBe('finished');
  });

  it('is finished when every exercise is answered', () => {
    const s = initPlayer(
      view({
        answered: {
          a: { verdict: 'correct', accepted: true },
          b: { verdict: 'correct', accepted: true },
          c: { verdict: 'correct', accepted: true },
        },
      }),
    );
    expect(s.status).toBe('finished');
  });
});

describe('reduce', () => {
  const start = (): PlayerState => initPlayer(view());

  it('shows feedback and advances on a correct answer', () => {
    let s = start();
    s = reduce(s, { type: 'ANSWERED', result: answer() });
    expect(s.status).toBe('feedback');
    expect(s.feedback).toMatchObject({ verdict: 'correct', accepted: true });
    expect(s.hearts).toBe(STARTING_HEARTS);
    expect(s.answeredCount).toBe(1);

    s = reduce(s, { type: 'CONTINUE' });
    expect(s.status).toBe('answering');
    expect(s.index).toBe(1);
    expect(currentExercise(s)?.id).toBe('b');
  });

  it('accepts a typo without costing a heart, shows the correction', () => {
    let s = start();
    s = reduce(s, { type: 'ANSWERED', result: answer({ verdict: 'typo', correction: 'sêv' }) });
    expect(s.hearts).toBe(STARTING_HEARTS);
    expect(s.feedback?.correction).toBe('sêv');
  });

  it('loses a heart on a wrong answer', () => {
    let s = start();
    s = reduce(s, { type: 'ANSWERED', result: answer({ verdict: 'wrong', accepted: false }) });
    expect(s.hearts).toBe(STARTING_HEARTS - 1);
  });

  it('does not charge a heart for a duplicate replay', () => {
    let s = start();
    s = reduce(s, {
      type: 'ANSWERED',
      result: answer({ verdict: 'wrong', accepted: false, duplicate: true }),
    });
    expect(s.hearts).toBe(STARTING_HEARTS);
    expect(s.answeredCount).toBe(0);
  });

  it('finishes after the last exercise', () => {
    let s = start();
    for (let i = 0; i < exercises.length; i++) {
      s = reduce(s, { type: 'ANSWERED', result: answer() });
      s = reduce(s, { type: 'CONTINUE' });
    }
    expect(s.status).toBe('finished');
    expect(progress(s)).toBe(1);
  });

  it('ends the lesson when hearts run out', () => {
    let s = initPlayer(view(), 1); // a single heart
    s = reduce(s, { type: 'ANSWERED', result: answer({ verdict: 'wrong', accepted: false }) });
    expect(outOfHearts(s)).toBe(true);
    s = reduce(s, { type: 'CONTINUE' });
    expect(s.status).toBe('finished'); // failed out before the end
    expect(s.index).toBe(0); // did not advance
  });

  it('SKIP defers the exercise: advances with no heart lost and no mistake', () => {
    let s = start();
    s = reduce(s, { type: 'SKIP' });
    expect(s.index).toBe(1);
    expect(s.hearts).toBe(STARTING_HEARTS);
    expect(s.answeredCount).toBe(0); // not counted
    expect(s.status).toBe('answering');
  });

  it('SKIP on the last exercise finishes the lesson', () => {
    let s = start();
    s = reduce(s, { type: 'SKIP' });
    s = reduce(s, { type: 'SKIP' });
    s = reduce(s, { type: 'SKIP' }); // skip the 3rd/last
    expect(s.status).toBe('finished');
  });

  it('ignores SKIP while showing feedback', () => {
    let s = start();
    s = reduce(s, { type: 'ANSWERED', result: answer() });
    expect(reduce(s, { type: 'SKIP' })).toBe(s);
  });

  it('ignores answers while showing feedback', () => {
    let s = start();
    s = reduce(s, { type: 'ANSWERED', result: answer() });
    const again = reduce(s, { type: 'ANSWERED', result: answer({ verdict: 'wrong', accepted: false }) });
    expect(again).toBe(s); // no change
  });
});
