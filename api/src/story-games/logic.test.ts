import { describe, expect, it } from 'vitest';
import { ANSWER_GRACE_MS, LOBBY_IDLE_MINUTES, REVEAL_MAX_SECONDS, UNTIMED_QUESTION_CAP_SECONDS } from '@kurda/shared';
import {
  controllerOf,
  dueTransition,
  nextDueAt,
  placesOf,
  questionCloseAt,
  questionDeadline,
  questionEndsAt,
  revealEndsAt,
  type PhaseGame,
  type PhasePlayer,
} from './logic.js';

const T = 1_000_000_000_000;

const game = (over: Partial<PhaseGame> = {}): PhaseGame => ({
  mode: 'group',
  status: 'question',
  currentIndex: 0,
  questionCount: 5,
  timerSeconds: 30,
  phaseStartedAt: T,
  phaseEndsAt: T + 30_000,
  readingHardCapAt: null,
  updatedAt: T,
  ...over,
});

let seat = 0;
const player = (over: Partial<PhasePlayer> = {}): PhasePlayer => {
  seat += 1;
  return {
    userId: `u${seat}`,
    seat,
    joinedAt: T + seat,
    left: false,
    removed: false,
    away: false,
    awayAt: T + 45_000,
    extraTime: false,
    doneReading: false,
    continuedIndex: null,
    answered: false,
    ...over,
  };
};

describe('question deadlines', () => {
  it('a timed question gives extra time twice the timer; untimed duo/group ones close at the cap; solo never', () => {
    expect(questionDeadline(game(), false)).toBe(T + 30_000);
    expect(questionDeadline(game(), true)).toBe(T + 60_000);
    expect(questionDeadline(game({ timerSeconds: 0, phaseEndsAt: T + 180_000 }), false)).toBe(T + 180_000);
    expect(questionDeadline(game({ mode: 'solo', timerSeconds: 0, phaseEndsAt: null }), false)).toBeNull();
    expect(questionDeadline(game({ status: 'reveal' }), false)).toBeNull();
  });

  it('closes after the latest deadline among the players it waits for, plus the grace — never earlier', () => {
    const g = game();
    expect(questionCloseAt(g, [player(), player()])).toBe(T + 30_000 + ANSWER_GRACE_MS);
    expect(questionCloseAt(g, [player(), player({ extraTime: true })])).toBe(T + 60_000 + ANSWER_GRACE_MS);
    // an away player with extra time is not waited for
    expect(questionCloseAt(g, [player(), player({ extraTime: true, away: true })])).toBe(T + 30_000 + ANSWER_GRACE_MS);
    // nobody active: the game's own deadline stands
    expect(questionCloseAt(g, [player({ away: true, extraTime: true })])).toBe(T + 30_000 + ANSWER_GRACE_MS);
    expect(questionCloseAt(game({ mode: 'solo', timerSeconds: 0, phaseEndsAt: null }), [player()])).toBeNull();
  });

  it('opens a question with its own deadline, and a reveal with its maximum', () => {
    expect(questionEndsAt('group', 30, T)).toBe(T + 30_000);
    expect(questionEndsAt('duo', 0, T)).toBe(T + UNTIMED_QUESTION_CAP_SECONDS * 1000);
    expect(questionEndsAt('solo', 0, T)).toBeNull();
    expect(revealEndsAt('group', T)).toBe(T + REVEAL_MAX_SECONDS * 1000);
    expect(revealEndsAt('solo', T)).toBeNull();
  });
});

describe('what is due', () => {
  it('a lobby goes idle after LOBBY_IDLE_MINUTES without a change', () => {
    const g = game({ status: 'lobby', phaseStartedAt: null, phaseEndsAt: null });
    expect(dueTransition(g, [player()], T + LOBBY_IDLE_MINUTES * 60_000 - 1)).toBeNull();
    expect(dueTransition(g, [player()], T + LOBBY_IDLE_MINUTES * 60_000)).toBe('expire_lobby');
  });

  it('reading ends when every active player has finished, or at the hard cap', () => {
    const g = game({ status: 'reading', readingHardCapAt: T + 600_000 });
    expect(dueTransition(g, [player({ doneReading: true }), player()], T)).toBeNull();
    expect(dueTransition(g, [player({ doneReading: true }), player({ away: true })], T)).toBe('open_questions');
    expect(dueTransition(g, [player({ doneReading: true }), player({ left: true })], T)).toBe('open_questions');
    expect(dueTransition(g, [player(), player()], T + 600_000)).toBe('open_questions');
  });

  it('a game whose players all walked away is not rushed through: its deadlines still apply', () => {
    const g = game({ status: 'reading', readingHardCapAt: T + 600_000 });
    expect(dueTransition(g, [player({ away: true }), player({ away: true })], T)).toBeNull();
    const q = game();
    expect(dueTransition(q, [player({ away: true })], T + 1000)).toBeNull();
  });

  it('a question closes when every active player answered, or after the deadline and the grace', () => {
    const g = game();
    expect(dueTransition(g, [player({ answered: true }), player()], T + 1000)).toBeNull();
    expect(dueTransition(g, [player({ answered: true }), player({ answered: true })], T + 1000)).toBe('close_question');
    expect(dueTransition(g, [player({ answered: true }), player()], T + 30_000 + ANSWER_GRACE_MS - 1)).toBeNull();
    expect(dueTransition(g, [player({ answered: true }), player()], T + 30_000 + ANSWER_GRACE_MS)).toBe('close_question');
  });

  it('a reveal moves on when every active player continued, or (duo/group) after its maximum', () => {
    const g = game({ status: 'reveal', currentIndex: 2, phaseEndsAt: T + 15_000 });
    expect(dueTransition(g, [player({ continuedIndex: 2 }), player({ continuedIndex: 1 })], T)).toBeNull();
    expect(dueTransition(g, [player({ continuedIndex: 2 }), player({ continuedIndex: 2 })], T)).toBe('next');
    expect(dueTransition(g, [player(), player()], T + 15_000)).toBe('next');
    // solo: only the reader's Next
    expect(dueTransition({ ...g, mode: 'solo', phaseEndsAt: null }, [player()], T + 3_600_000)).toBeNull();
  });

  it('finished and cancelled games are never due', () => {
    expect(dueTransition(game({ status: 'finished' }), [player()], T * 2)).toBeNull();
    expect(nextDueAt(game({ status: 'cancelled' }), [player()])).toBeNull();
  });
});

describe('the next due instant', () => {
  it('is the earliest of the phase deadline and an active player turning away', () => {
    expect(nextDueAt(game(), [player({ awayAt: T + 90_000 })])).toBe(T + 30_000 + ANSWER_GRACE_MS);
    expect(nextDueAt(game(), [player({ awayAt: T + 10_000 }), player({ awayAt: T + 90_000 })])).toBe(T + 10_000);
    // someone already away, gone or removed turns away no further
    expect(nextDueAt(game(), [player({ away: true, awayAt: T + 1 }), player({ left: true, awayAt: T + 2 })])).toBe(
      T + 30_000 + ANSWER_GRACE_MS,
    );
    // a lobby: its idle time and its players' presence
    const lobby = game({ status: 'lobby', phaseEndsAt: null });
    expect(nextDueAt(lobby, [player({ awayAt: T + 20_000 })])).toBe(T + 20_000);
    expect(nextDueAt(lobby, [])).toBe(T + LOBBY_IDLE_MINUTES * 60_000);
  });

  it('a solo game is not timed by presence, and an untimed solo question has no deadline at all', () => {
    expect(nextDueAt(game({ mode: 'solo', timerSeconds: 0, phaseEndsAt: null }), [player({ awayAt: T + 1 })])).toBeNull();
  });
});

describe('who holds the host controls', () => {
  it('the host while present; else the earliest-joined active player; else nobody', () => {
    const host = player({ userId: 'host', joinedAt: T });
    const early = player({ userId: 'early', joinedAt: T + 10 });
    const late = player({ userId: 'late', joinedAt: T + 20 });
    expect(controllerOf('host', [host, early, late])).toBe('host');
    expect(controllerOf('host', [{ ...host, away: true }, late, early])).toBe('early');
    expect(controllerOf('host', [{ ...host, left: true }, { ...early, away: true }, late])).toBe('late');
    expect(controllerOf('host', [{ ...host, away: true }, { ...early, away: true }])).toBeNull();
    // a host whose account is gone (null): the stand-in rule alone
    expect(controllerOf(null, [early, late])).toBe('early');
  });
});

describe('places', () => {
  it('ranks by points, then by the least time on the right answers; equal both share a place', () => {
    const places = placesOf([
      { key: 'a', score: 300, correctMs: 9000 },
      { key: 'b', score: 300, correctMs: 7000 },
      { key: 'c', score: 300, correctMs: 7000 },
      { key: 'd', score: 100, correctMs: 1000 },
    ]);
    expect(Object.fromEntries(places)).toEqual({ b: 1, c: 1, a: 3, d: 4 });
  });
});
