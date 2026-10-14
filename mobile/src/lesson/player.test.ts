import { describe, expect, it } from 'vitest';
import {
  currentExercise,
  feedbackTitle,
  initPlayer,
  isReask,
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
  it('starts fresh at the first exercise', () => {
    const s = initPlayer(view());
    expect(s.index).toBe(0);
    expect(s.status).toBe('answering');
    expect(progress(s)).toBe(0);
  });

  it('resumes at the first unanswered exercise, with the earlier miss still to come back', () => {
    const s = initPlayer(
      view({
        answered: {
          a: { verdict: 'correct', accepted: true },
          b: { verdict: 'wrong', accepted: false },
        },
      }),
    );
    expect(currentExercise(s)?.id).toBe('c'); // c is next
    expect(s.answeredCount).toBe(2);
    // b was missed before the learner left; its second try is still ahead
    expect(s.steps.slice(s.index).map((st) => (st.reask ? `${st.exerciseId}*` : st.exerciseId))).toEqual(['c', 'b*']);
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
    expect(s.answeredCount).toBe(1);

    s = reduce(s, { type: 'CONTINUE' });
    expect(s.status).toBe('answering');
    expect(s.index).toBe(1);
    expect(currentExercise(s)?.id).toBe('b');
  });

  it('accepts a typo, shows the correction, and does not ask it again', () => {
    let s = start();
    s = reduce(s, { type: 'ANSWERED', result: answer({ verdict: 'typo', correction: 'sêv' }) });
    expect(s.feedback?.correction).toBe('sêv');
    expect(s.feedback?.comesBack).toBeUndefined();
  });

  it('a wrong answer costs nothing but comes back for a second try', () => {
    let s = start();
    s = reduce(s, { type: 'ANSWERED', result: answer({ verdict: 'wrong', accepted: false }) });
    expect(s.feedback?.comesBack).toBe(true);
    expect('hearts' in s).toBe(false);
  });

  it('counts a duplicate replay once', () => {
    let s = start();
    s = reduce(s, {
      type: 'ANSWERED',
      result: answer({ verdict: 'wrong', accepted: false, duplicate: true }),
    });
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

  it('never ends the lesson early: every answer wrong still runs to the end', () => {
    let s = start();
    while (s.status !== 'finished') {
      s = reduce(s, { type: 'ANSWERED', result: answer({ verdict: 'wrong', accepted: false }) });
      s = reduce(s, { type: 'CONTINUE' });
    }
    // three first asks and three second tries, and nothing cut short
    expect(s.answeredCount).toBe(exercises.length);
    expect(s.reasked).toEqual(['a', 'b', 'c']);
  });

  it('asks a missed exercise once more, after the others', () => {
    let s = start();
    s = reduce(reduce(s, { type: 'ANSWERED', result: answer({ verdict: 'wrong', accepted: false }) }), { type: 'CONTINUE' });
    s = reduce(reduce(s, { type: 'ANSWERED', result: answer() }), { type: 'CONTINUE' });
    s = reduce(reduce(s, { type: 'ANSWERED', result: answer() }), { type: 'CONTINUE' });
    expect(currentExercise(s)?.id).toBe('a');
    expect(isReask(s)).toBe(true);
  });

  it('SKIP defers the exercise: advances with no mistake', () => {
    let s = start();
    s = reduce(s, { type: 'SKIP' });
    expect(s.index).toBe(1);
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

describe('feedbackTitle', () => {
  it('says a typo was accepted only when it was', () => {
    expect(feedbackTitle({ verdict: 'typo', accepted: true, exerciseType: 'translate' })).toBe('lesson.almostTypo');
    // a strict spelling item: the same slip, not accepted
    expect(feedbackTitle({ verdict: 'typo', accepted: false, exerciseType: 'writing' })).toBe('lesson.almostStrict');
  });

  it('calls a recording that counted saved, never a typo or correct', () => {
    expect(feedbackTitle({ verdict: 'typo', accepted: true, exerciseType: 'speaking' })).toBe('lesson.speak.saved');
    expect(feedbackTitle({ verdict: 'correct', accepted: true, exerciseType: 'speaking' })).toBe('lesson.speak.saved');
    expect(feedbackTitle({ verdict: 'wrong', accepted: false, exerciseType: 'speaking' })).toBe('lesson.notQuite');
  });

  it('reads right and wrong as before', () => {
    expect(feedbackTitle({ verdict: 'correct', accepted: true, exerciseType: 'multiple_choice' })).toBe('lesson.correct');
    expect(feedbackTitle({ verdict: 'wrong', accepted: false, exerciseType: 'translate' })).toBe('lesson.notQuite');
  });

  it('is told what kind of exercise was answered', () => {
    const speaking: Exercise = { id: 's', position: 1, type: 'speaking', prompt: 'Say it' };
    const s = reduce(initPlayer(view({ exercises: [speaking] })), {
      type: 'ANSWERED',
      result: answer({ verdict: 'typo', accepted: true, correction: 'Ez baş im' }),
    });
    expect(s.feedback).toEqual({ verdict: 'typo', accepted: true, correction: 'Ez baş im', exerciseType: 'speaking' });
    expect(feedbackTitle(s.feedback!)).toBe('lesson.speak.saved');
  });
});
