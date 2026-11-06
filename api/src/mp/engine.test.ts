import { describe, expect, it } from 'vitest';
import { AWAY_TURN_GRACE_MS, bluffRules, lastLetterRules as R, whoAmIRaceRules, type LastLetterState } from '@kurda/shared';
import { awayAfter, controllerOf, dueStep, nextDue, type EngineSeat } from './engine.js';

const T0 = 1_700_000_000_000;

function seat(n: number, over: Partial<EngineSeat> = {}): EngineSeat {
  return {
    seat: n,
    userId: `u${n}`,
    bot: null,
    joinedAt: T0 + n,
    left: false,
    removed: false,
    away: false,
    silent: false,
    silentAt: T0 + 45_000,
    ...over,
  };
}

/** A game whose turn is seat `turn`'s, started at T0 with 30 s turns. */
function game(players: number, turn = 1, bot: number | null = null): LastLetterState {
  const s = R.init(
    { dialect: 'kmr', turnSeconds: 30 },
    Array.from({ length: players }, (_, i) => ({ seat: i + 1, team: null, bot: bot === i + 1 ? 'hevalo' : null })),
    { now: T0, seed: 'x' },
  );
  const length = bot === turn ? 2_000 : 30_000;
  return { ...s, turn: { seat: turn, n: 1, startedAt: T0, endsAt: T0 + length } };
}

describe('what is due', () => {
  it('is nothing while a present player has time left', () => {
    expect(dueStep(R, game(2), [seat(1), seat(2)], T0 + 10_000, T0)).toBeNull();
  });

  it('is a timeout for the waited-on seat once the turn’s time is up', () => {
    expect(dueStep(R, game(2), [seat(1), seat(2)], T0 + 30_000, T0)).toEqual({ kind: 'timeout', seats: [1] });
  });

  it('passes over an away player a moment into their turn, not after all of it', () => {
    const seats = [seat(1, { away: true }), seat(2)];
    expect(dueStep(R, game(2), seats, T0 + AWAY_TURN_GRACE_MS - 1, T0)).toBeNull();
    expect(dueStep(R, game(2), seats, T0 + AWAY_TURN_GRACE_MS, T0)).toEqual({ kind: 'skip', seats: [1] });
  });

  it('treats a player not heard from as away too', () => {
    expect(dueStep(R, game(2), [seat(1, { silent: true }), seat(2)], T0 + AWAY_TURN_GRACE_MS, T0)).toEqual({ kind: 'skip', seats: [1] });
  });

  it('gives Hevalo its move when its thinking time is up', () => {
    const s = game(2, 2, 2);
    const seats = [seat(1), seat(2, { userId: null, bot: 'hevalo' })];
    expect(dueStep(R, s, seats, T0 + 1_000, T0)).toBeNull();
    expect(dueStep(R, s, seats, T0 + 2_000, T0)).toEqual({ kind: 'bot', seat: 2 });
  });

  it('ends a game every person has left, and finishes one the rules finished', () => {
    expect(dueStep(R, game(2), [seat(1, { left: true }), seat(2, { removed: true })], T0, T0)).toEqual({ kind: 'end' });
    expect(dueStep(R, R.end(game(2), T0), [seat(1), seat(2)], T0, T0)).toEqual({ kind: 'finish' });
  });

  it('is a timeout for no seat when a clock runs out with nobody waited on', () => {
    const deck = [{ id: 'c1', word: 'gurz', real: 'a club', example: null }];
    const bluff = bluffRules.timeout(
      bluffRules.init({ dialect: 'kmr', language: 'en', rounds: 3, writeSeconds: 60, deck }, [1, 2, 3].map((n) => ({ seat: n, team: null, bot: null })), { now: T0, seed: 'x' }),
      [1, 2, 3],
      T0 + 60_000,
    );
    // the reveal is on show, waiting on nobody, until its own clock
    const seats = [seat(1), seat(2), seat(3)];
    expect(dueStep(bluffRules, bluff, seats, bluff.phaseEndsAt - 1, T0)).toBeNull();
    expect(dueStep(bluffRules, bluff, seats, bluff.phaseEndsAt, T0)).toEqual({ kind: 'timeout', seats: [] });
    expect(nextDue(bluffRules, bluff, seats, T0)).toBe(bluff.phaseEndsAt);
  });

  it('never passes over a player in a game that waits on nobody', () => {
    const race = whoAmIRaceRules.init({ dialect: 'kmr', minutes: 3, difficulty: 'beginner', deals: [] }, [1, 2].map((n) => ({ seat: n, team: null, bot: null })), {
      now: T0,
      seed: 'x',
    });
    const seats = [seat(1, { away: true }), seat(2, { silent: true })];
    expect(dueStep(whoAmIRaceRules, { ...race, finishedAt: null }, seats, T0 + AWAY_TURN_GRACE_MS * 3, T0)).toBeNull();
  });

  it('counts two missed turns in a row as away', () => {
    expect(awayAfter(1)).toBe(false);
    expect(awayAfter(2)).toBe(true);
  });
});

describe('when to look again', () => {
  it('is the turn’s end, or sooner when the waited-on player may turn silent first', () => {
    expect(nextDue(R, game(2), [seat(1, { silentAt: T0 + 60_000 }), seat(2)], T0)).toBe(T0 + 30_000);
    expect(nextDue(R, game(2), [seat(1, { silentAt: T0 + 20_000 }), seat(2)], T0)).toBe(T0 + 20_000);
  });

  it('is the end of the grace for an away player', () => {
    expect(nextDue(R, game(2), [seat(1, { away: true }), seat(2)], T0 + 500)).toBe(T0 + 500 + AWAY_TURN_GRACE_MS);
  });

  it('is at once for a finished game not yet settled, and never for nothing to wait on', () => {
    expect(nextDue(R, R.end(game(2), T0), [seat(1), seat(2)], T0)).toBe(0);
  });
});

describe('who holds the host controls', () => {
  it('is the host while present', () => {
    expect(controllerOf('u1', [seat(1), seat(2)])).toBe('u1');
  });

  it('passes to the earliest-joined present player while the host is away or gone, and back', () => {
    expect(controllerOf('u1', [seat(1, { away: true }), seat(3), seat(2)])).toBe('u2');
    expect(controllerOf('u1', [seat(1, { left: true }), seat(2, { silent: true }), seat(3)])).toBe('u3');
    expect(controllerOf(null, [seat(2), seat(3)])).toBe('u2');
    expect(controllerOf('u1', [seat(1, { away: true }), seat(2, { away: true })])).toBeNull();
  });

  it('never passes to a computer seat', () => {
    expect(controllerOf('u1', [seat(1, { left: true }), seat(2, { userId: null, bot: 'hevalo' })])).toBeNull();
  });
});
