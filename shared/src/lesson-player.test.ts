import { describe, expect, it } from 'vitest';
import {
  AnswerQueue,
  REASK_GAP,
  RUN_SHOWN_FROM,
  currentExercise,
  currentStep,
  feedbackKind,
  initPlayer,
  isReask,
  nextRun,
  practisableMistakes,
  progress,
  reduce,
  runMilestone,
  type DeliveredExercise,
  type GradeResult,
  type PlayableSession,
  type PlayerState,
  type RecordedAnswer,
} from './lesson-player.js';

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
const exercises: DeliveredExercise[] = ids.map((id, i) => ({ id, position: i + 1, type: 'translate', prompt: id }));

const session = (over: Partial<PlayableSession> = {}): PlayableSession => ({ sessionId: 's1', exercises, answered: {}, ...over });

const right: GradeResult = { verdict: 'correct', accepted: true, duplicate: false };
const wrong: GradeResult = { verdict: 'wrong', accepted: false, correction: 'sêv', duplicate: false };

/** The exercise ids still to come, marking second tries with a star. */
const upcoming = (s: PlayerState): string[] => s.steps.slice(s.index).map((st) => (st.reask ? `${st.exerciseId}*` : st.exerciseId));

function answer(s: PlayerState, result: GradeResult): PlayerState {
  return reduce(reduce(s, { type: 'ANSWERED', result }), { type: 'CONTINUE' });
}

describe('a lesson from the start', () => {
  it('asks every exercise in order', () => {
    let s = initPlayer(session());
    expect(s.status).toBe('answering');
    expect(currentExercise(s)?.id).toBe('a');
    expect(progress(s)).toBe(0);
    for (const id of ids) {
      expect(currentExercise(s)?.id).toBe(id);
      s = answer(s, right);
    }
    expect(s.status).toBe('finished');
    expect(progress(s)).toBe(1);
    expect(s.answeredCount).toBe(6);
  });

  it('has no hearts: any number of mistakes leaves the lesson running to the end', () => {
    let s = initPlayer(session());
    for (let i = 0; i < 6; i++) s = answer(s, wrong);
    // every first ask was wrong, and the lesson is still going — now on the second tries
    expect(s.status).toBe('answering');
    expect('hearts' in s).toBe(false);
    while (s.status !== 'finished') s = answer(s, wrong);
    expect(s.answeredCount).toBe(6);
    expect(s.reasked).toEqual(ids);
  });

  it('shows feedback with the correction, the model and what was typed', () => {
    const s = reduce(initPlayer(session()), {
      type: 'ANSWERED',
      result: { ...wrong, modelAudioUrl: 'https://cdn/x.mp3' },
      given: 'sev',
    });
    expect(s.status).toBe('feedback');
    expect(s.feedback).toEqual({
      verdict: 'wrong',
      accepted: false,
      correction: 'sêv',
      modelAudioUrl: 'https://cdn/x.mp3',
      exerciseType: 'translate',
      given: 'sev',
      comesBack: true,
    });
  });

  it('ignores answers while feedback is showing, and Continue while answering', () => {
    const s = reduce(initPlayer(session()), { type: 'ANSWERED', result: right });
    expect(reduce(s, { type: 'ANSWERED', result: wrong })).toBe(s);
    expect(reduce(s, { type: 'SKIP' })).toBe(s);
    const fresh = initPlayer(session());
    expect(reduce(fresh, { type: 'CONTINUE' })).toBe(fresh);
  });
});

describe('a missed item comes back once', () => {
  it(`comes back after ${REASK_GAP} other exercises`, () => {
    let s = answer(initPlayer(session()), wrong); // a missed
    expect(upcoming(s)).toEqual(['b', 'c', 'd', 'a*', 'e', 'f']);
    s = answer(s, right); // b
    s = answer(s, right); // c
    s = answer(s, right); // d
    expect(currentExercise(s)?.id).toBe('a');
    expect(isReask(s)).toBe(true);
  });

  it('comes back at the end when fewer exercises are left', () => {
    let s = initPlayer(session());
    for (let i = 0; i < 4; i++) s = answer(s, right);
    s = answer(s, wrong); // e missed with only f after it
    expect(upcoming(s)).toEqual(['f', 'e*']);
  });

  it('is asked a second time only: a miss on the second try does not come back again', () => {
    let s = answer(initPlayer(session({ exercises: exercises.slice(0, 1) })), wrong);
    expect(upcoming(s)).toEqual(['a*']);
    s = reduce(s, { type: 'ANSWERED', result: { verdict: 'wrong', accepted: false, correction: 'sêv' } });
    expect(s.feedback).toMatchObject({ reask: true, accepted: false });
    expect(s.feedback?.comesBack).toBeUndefined();
    s = reduce(s, { type: 'CONTINUE' });
    expect(s.status).toBe('finished');
  });

  it('never counts the second try: answers and progress are first attempts only', () => {
    let s = answer(initPlayer(session({ exercises: exercises.slice(0, 2) })), wrong); // a missed
    s = answer(s, right); // b
    expect(s.answeredCount).toBe(2);
    expect(isReask(s)).toBe(true);
    s = reduce(s, { type: 'ANSWERED', result: { verdict: 'correct', accepted: true } });
    expect(s.feedback).toMatchObject({ reask: true, accepted: true });
    expect(s.answeredCount).toBe(2);
    expect(s.reasked).toEqual(['a']);
    s = reduce(s, { type: 'CONTINUE' });
    expect(s.status).toBe('finished');
  });

  it('a typo that is accepted does not come back; a strict one that is not, does', () => {
    const lenient = reduce(initPlayer(session()), { type: 'ANSWERED', result: { verdict: 'typo', accepted: true, correction: 'sêv' } });
    expect(lenient.feedback?.comesBack).toBeUndefined();
    const strict = reduce(initPlayer(session()), { type: 'ANSWERED', result: { verdict: 'typo', accepted: false, correction: 'sêv' } });
    expect(strict.feedback?.comesBack).toBe(true);
  });

  it('moves the progress bar on after a miss, never back', () => {
    let s = initPlayer(session());
    const before = progress(s);
    s = reduce(s, { type: 'ANSWERED', result: wrong });
    expect(progress(s)).toBeGreaterThan(before);
    const atFeedback = progress(s);
    s = reduce(s, { type: 'CONTINUE' });
    expect(progress(s)).toBe(atFeedback);
    // seven turns now: six first asks and one second try
    expect(s.steps).toHaveLength(7);
  });
});

describe('skipping', () => {
  it('puts the exercise off: no answer, no mistake, no second try', () => {
    let s = reduce(initPlayer(session()), { type: 'SKIP' });
    expect(currentExercise(s)?.id).toBe('b');
    expect(s.answeredCount).toBe(0);
    expect(s.skipped).toEqual(['a']);
    expect(s.steps.some((st) => st.reask)).toBe(false);
    for (let i = 0; i < 5; i++) s = reduce(s, { type: 'SKIP' });
    expect(s.status).toBe('finished');
  });

  it('a second try can be put off too, and is not asked again', () => {
    let s = answer(initPlayer(session({ exercises: exercises.slice(0, 1) })), wrong);
    expect(isReask(s)).toBe(true);
    s = reduce(s, { type: 'SKIP' });
    expect(s.status).toBe('finished');
    expect(s.skipped).toEqual([]);
  });

  it('holds nothing to put back after a single skip', () => {
    expect(reduce(initPlayer(session()), { type: 'SKIP' }).putAway).toBeNull();
  });

  it('FINISH ends the session wherever it is', () => {
    const s = reduce(initPlayer(session()), { type: 'FINISH' });
    expect(s.status).toBe('finished');
    expect(currentStep(s)).toBeNull();
  });
});

describe('putting a whole kind off for the rest of the session', () => {
  // a translate, then listening and the others in turn
  const kinds = ['translate', 'listening', 'translate', 'listening', 'speaking', 'listening'] as const;
  const mixed = session({ exercises: ids.map((id, i) => ({ id, position: i + 1, type: kinds[i]! })) });
  /** answered a, now on b, the first listening item, and put every listening item off */
  const awayAtB = (): PlayerState => reduce(answer(initPlayer(mixed), right), { type: 'SKIP', all: 'listening' });

  it('puts off the one on screen and every one of its kind still to come, each counted as put off', () => {
    const s = awayAtB();
    expect(currentExercise(s)?.id).toBe('c');
    expect(upcoming(s)).toEqual(['c', 'e']);
    expect(s.skipped).toEqual(['b', 'd', 'f']);
    expect(s.putAway?.type).toBe('listening');
    expect(s.answeredCount).toBe(1);
  });

  it('puts them back where they were with UNSKIP, the one on screen staying put off', () => {
    const s = reduce(awayAtB(), { type: 'UNSKIP' });
    expect(upcoming(s)).toEqual(['c', 'd', 'e', 'f']);
    expect(s.skipped).toEqual(['b']);
    expect(s.putAway).toBeNull();
  });

  it('puts back next a step whose place has gone by, and the last one last', () => {
    let s = answer(awayAtB(), right); // c
    s = reduce(s, { type: 'ANSWERED', result: { verdict: 'correct', accepted: true } }); // e, its feedback showing
    s = reduce(reduce(s, { type: 'UNSKIP' }), { type: 'CONTINUE' });
    expect(upcoming(s)).toEqual(['d', 'f']);
  });

  it('drops a second try of that kind too, without counting it as put off, and brings it back with the rest', () => {
    const list = session({ exercises: ids.slice(0, 5).map((id, i) => ({ id, position: i + 1, type: i < 2 ? 'listening' : 'translate' })) });
    let s = answer(initPlayer(list), wrong); // a missed: its second try waits after d
    expect(upcoming(s)).toEqual(['b', 'c', 'd', 'a*', 'e']);
    s = reduce(s, { type: 'SKIP', all: 'listening' });
    expect(upcoming(s)).toEqual(['c', 'd', 'e']);
    expect(s.skipped).toEqual(['b']);
    s = reduce(s, { type: 'UNSKIP' });
    expect(upcoming(s)).toEqual(['c', 'd', 'a*', 'e']);
  });

  it('holds nothing to put back when none of that kind is left', () => {
    const s = reduce(initPlayer(session()), { type: 'SKIP', all: 'listening' });
    expect(upcoming(s)).toEqual(['b', 'c', 'd', 'e', 'f']);
    expect(s.skipped).toEqual(['a']);
    expect(s.putAway).toBeNull();
    expect(reduce(s, { type: 'UNSKIP' })).toBe(s);
  });

  it('cannot put anything back once the session is finished', () => {
    const s = reduce(awayAtB(), { type: 'FINISH' });
    expect(reduce(s, { type: 'UNSKIP' })).toBe(s);
  });
});

describe('runs', () => {
  it('counts right answers in a row, starts again on a miss, and leaves a spoken answer out of it', () => {
    expect(nextRun(2, { accepted: true, exerciseType: 'translate' })).toBe(3);
    expect(nextRun(4, { accepted: false, exerciseType: 'listening' })).toBe(0);
    expect(nextRun(4, { accepted: false, exerciseType: 'speaking' })).toBe(4);
    expect(nextRun(4, { accepted: true, exerciseType: 'speaking' })).toBe(4);
    expect(RUN_SHOWN_FROM).toBe(3);
  });

  it('names 5, 10 and every fifth from 15 as milestones, and nothing else', () => {
    expect([1, 3, 4, 5, 6, 9, 10, 11, 14, 15, 20, 25].map(runMilestone)).toEqual([null, null, null, 5, null, null, 10, null, null, 15, 20, 25]);
  });
});

describe('resuming', () => {
  it('picks up at the first unanswered exercise and asks nothing answered again', () => {
    // b was put off earlier, then c and d were answered
    const s = initPlayer(
      session({
        answered: {
          a: { verdict: 'correct', accepted: true },
          c: { verdict: 'correct', accepted: true },
          d: { verdict: 'correct', accepted: true },
        },
      }),
    );
    expect(s.answeredCount).toBe(3);
    expect(upcoming(s)).toEqual(['b', 'e', 'f']);
    expect(progress(s)).toBe(0.5);
  });

  it('brings back a miss whose second try had not happened', () => {
    const s = initPlayer(
      session({
        answered: {
          a: { verdict: 'correct', accepted: true },
          b: { verdict: 'wrong', accepted: false },
        },
      }),
    );
    expect(upcoming(s)).toEqual(['c', 'd', 'e', 'b*', 'f']);
  });

  it('does not ask a second time what the client remembers asking', () => {
    const answered = { a: { verdict: 'wrong' as const, accepted: false } };
    expect(upcoming(initPlayer(session({ answered }), { reasked: ['a'] }))).toEqual(['b', 'c', 'd', 'e', 'f']);
    // a remembered id that is not a miss changes nothing
    expect(initPlayer(session({ answered }), { reasked: ['zzz'] }).reasked).toEqual([]);
  });

  it('resumes into the second tries when every first answer is in', () => {
    const answered: Record<string, RecordedAnswer> = Object.fromEntries(ids.map((id) => [id, { verdict: 'correct', accepted: true }]));
    answered.c = { verdict: 'wrong', accepted: false };
    const s = initPlayer(session({ answered }));
    expect(s.status).toBe('answering');
    expect(upcoming(s)).toEqual(['c*']);
    expect(isReask(s)).toBe(true);
  });

  it('is finished when every exercise is answered, or the session is complete', () => {
    const answered = Object.fromEntries(ids.map((id) => [id, { verdict: 'correct' as const, accepted: true }]));
    expect(initPlayer(session({ answered })).status).toBe('finished');
    expect(initPlayer(session({ completed: true })).status).toBe('finished');
  });

  it('counts a replayed answer once', () => {
    const s = reduce(initPlayer(session()), { type: 'ANSWERED', result: { ...right, duplicate: true } });
    expect(s.answeredCount).toBe(0);
  });
});

describe('feedbackKind', () => {
  it('says almost only of a slip, and tells a strict item’s slip apart', () => {
    expect(feedbackKind({ verdict: 'correct', accepted: true, exerciseType: 'translate' })).toBe('correct');
    expect(feedbackKind({ verdict: 'typo', accepted: true, exerciseType: 'translate' })).toBe('almost');
    expect(feedbackKind({ verdict: 'typo', accepted: false, exerciseType: 'writing' })).toBe('almostStrict');
    expect(feedbackKind({ verdict: 'wrong', accepted: false, exerciseType: 'listening' })).toBe('notYet');
  });

  it('reports a spoken answer as the learner’s own rating, never as correct', () => {
    expect(feedbackKind({ verdict: 'correct', accepted: true, exerciseType: 'speaking' })).toBe('spokenGood');
    expect(feedbackKind({ verdict: 'typo', accepted: true, exerciseType: 'speaking' })).toBe('spokenClose');
    expect(feedbackKind({ verdict: 'wrong', accepted: false, exerciseType: 'speaking' })).toBe('spokenRetry');
  });
});

describe('practisableMistakes', () => {
  it('leaves out speaking, which practice cannot grade, and unknown items', () => {
    const list: DeliveredExercise[] = [
      { id: 'x', type: 'translate' },
      { id: 'y', type: 'speaking' },
      { id: 'z', type: 'match_pairs' },
    ];
    expect(practisableMistakes([{ exerciseId: 'x' }, { exerciseId: 'y' }, { exerciseId: 'z' }, { exerciseId: 'q' }], list)).toEqual([
      'x',
      'z',
    ]);
  });
});

describe('AnswerQueue', () => {
  it('flushes in order and keeps what did not go through', async () => {
    const q = new AnswerQueue();
    q.enqueue({ exerciseId: 'a', answer: 1 });
    q.enqueue({ exerciseId: 'b', answer: 2 });
    const sent = await q.flush(async (p) => (p.exerciseId === 'a' ? 'ok' : null));
    expect(sent).toEqual(['ok']);
    expect(q.pending).toBe(1);
    expect(await q.flush(async (p) => p.exerciseId)).toEqual(['b']);
    expect(q.isEmpty()).toBe(true);
  });
});
