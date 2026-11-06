import { describe, expect, it } from 'vitest';
import {
  LAST_LETTER_MAX_CHAIN,
  hevaloMisses,
  hevaloThinkMs,
  lastLetterRules as R,
  requiredLetter,
  seededUnit,
  type LastLetterMove,
  type LastLetterState,
} from './rules.js';
import { lastLetterAvailability, LAST_LETTER_MIN_DICTIONARY_WORDS, LAST_LETTER_MIN_HEVALO_WORDS } from './learn.js';

const T0 = 1_700_000_000_000;
const seats = (n: number, bot: number | null = null) =>
  Array.from({ length: n }, (_, i) => ({ seat: i + 1, team: null, bot: bot === i + 1 ? 'hevalo' : null }));

const ok = (key: string, meaning: string | null = null): LastLetterMove => ({ key, verdict: 'ok', meaning });

/** A game whose first turn is seat 1's, whatever the seed draws. */
function start(n = 3, bot: number | null = null, turnSeconds: 20 | 30 | 45 = 30): LastLetterState {
  const s = R.init({ dialect: 'kmr', turnSeconds }, seats(n, bot), { now: T0, seed: 'game-1' });
  return { ...s, turn: { seat: 1, n: 1, startedAt: T0, endsAt: T0 + turnSeconds * 1000 } };
}

function play(state: LastLetterState, seat: number, move: LastLetterMove, at = T0 + 1000) {
  const r = R.apply(state, seat, move, at);
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe('starting', () => {
  it('draws who begins from the seed and gives them the whole turn', () => {
    const s = R.init({ dialect: 'kmr', turnSeconds: 20 }, seats(4), { now: T0, seed: 'abc' });
    expect(s.turn).not.toBeNull();
    expect([1, 2, 3, 4]).toContain(s.turn!.seat);
    expect(s.turn!.endsAt - s.turn!.startedAt).toBe(20_000);
    expect(R.dueAt(s)).toBe(s.turn!.endsAt);
    expect(R.waitingFor(s)).toEqual([s.turn!.seat]);
  });

  it('lets the first word begin with any letter', () => {
    const s = start();
    expect(requiredLetter(s)).toBeNull();
    const r = play(s, 1, ok('mal'));
    expect(r.outcome).toEqual({ accepted: true, reason: null, strikes: 0, out: false });
    expect(requiredLetter(r.state)).toBe('l');
    expect(r.state.turn!.seat).toBe(2);
  });
});

describe('a turn', () => {
  it('refuses a move from a seat whose turn it is not, changing nothing', () => {
    const s = start();
    expect(R.apply(s, 2, ok('mal'), T0)).toEqual({ ok: false, reason: 'not-your-turn' });
  });

  it('strikes a word that begins with the wrong letter and passes the turn', () => {
    const s1 = play(start(), 1, ok('sêv')).state;
    const r = play(s1, 2, ok('evîn'));
    expect(r.outcome).toMatchObject({ accepted: false, reason: 'wrong-letter', strikes: 1 });
    expect(r.state.turn!.seat).toBe(3);
    // the letter stays what it was
    expect(requiredLetter(r.state)).toBe('v');
  });

  it('keeps ê its own letter', () => {
    const s1 = play(start(), 1, ok('dê')).state;
    expect(play(s1, 2, ok('evar')).outcome.reason).toBe('wrong-letter');
    expect(play(s1, 2, ok('êvar')).outcome.accepted).toBe(true);
  });

  it('strikes a word already in the chain', () => {
    let s = play(start(2), 1, ok('mal')).state;
    s = play(s, 2, ok('lal')).state;
    const r = play(s, 1, ok('lal'));
    expect(r.outcome.reason).toBe('used');
  });

  it('strikes what the dictionary refused, and what is not one word', () => {
    const s = start();
    expect(play(s, 1, { key: 'xyzq', verdict: 'not-a-word', meaning: null }).outcome.reason).toBe('not-a-word');
    expect(play(s, 1, { key: 'mal', verdict: 'not-allowed', meaning: null }).outcome.reason).toBe('not-allowed');
    expect(play(s, 1, { key: null, verdict: 'not-a-word', meaning: null }).outcome.reason).toBe('not-one-word');
  });

  it('keeps the meaning a curated entry gave', () => {
    const r = play(start(), 1, ok('sêv', 'apple'));
    expect(R.viewFor(r.state, 2).chain).toEqual([{ n: 1, seat: 1, word: 'sêv', meaning: 'apple' }]);
  });

  it('strikes a turn whose time ran out, only for the seat whose turn it was', () => {
    const s = start();
    expect(R.timeout(s, [2], T0 + 30_000)).toBe(s);
    const next = R.timeout(s, [1], T0 + 30_000);
    expect(next.seats.find((x) => x.seat === 1)!.strikes).toBe(1);
    expect(next.strikes.at(-1)).toEqual({ seat: 1, reason: 'time', turn: 1 });
    expect(next.turn).toMatchObject({ seat: 2, n: 2, startedAt: T0 + 30_000 });
  });
});

describe('strikes and the end', () => {
  it('puts a player out on the third strike and skips them from then on', () => {
    let s = start(3);
    const words: Array<[string, string]> = [
      ['mal', 'lal'],
      ['lêv', 'vîn'],
      ['nûr', 'rez'],
    ];
    for (const [two, three] of words) {
      s = R.timeout(s, [1], T0);
      s = play(s, 2, ok(two)).state;
      s = play(s, 3, ok(three)).state;
    }
    const one = s.seats.find((x) => x.seat === 1)!;
    expect(one.strikes).toBe(3);
    expect(one.outOrder).toBe(1);
    expect(s.turn!.seat).toBe(2);
    expect(R.viewFor(s, 2).seats.find((x) => x.seat === 1)).toMatchObject({ out: true, left: false });
  });

  it('ends when one player is left, and places the last out after the winner', () => {
    let s = start(3);
    let i = 0;
    while (!R.finished(s)) {
      const seat = s.turn!.seat;
      if (seat === 3) {
        // a fresh word that begins with the letter the chain wants
        const first = requiredLetter(s) ?? 'b';
        s = play(s, 3, ok(`${first}a${'bcdfghjklmnpqrstvwxyz'[i++ % 21]}`)).state;
      } else {
        s = R.timeout(s, [seat], T0);
      }
    }
    expect(s.endedBy).toBe('last-standing');
    const places = R.places(s);
    expect(places[0]).toMatchObject({ seat: 3, place: 1 });
    expect(places.map((p) => p.place)).toEqual([1, 2, 3]);
    expect(R.waitingFor(s)).toEqual([]);
    expect(R.dueAt(s)).toBeNull();
  });

  it('ends a chain that reaches its length, the fewest strikes first', () => {
    let s = start(2);
    s = { ...s, seats: s.seats.map((x) => (x.seat === 2 ? { ...x, strikes: 1 } : x)) };
    // a chain one word short of full: every word a fresh one beginning and ending in b
    s = { ...s, chain: Array.from({ length: LAST_LETTER_MAX_CHAIN - 1 }, (_, i) => ({ seat: 1, word: `b${'a'.repeat(i + 1)}b`, meaning: null, at: T0 })) };
    const r = play(s, 1, ok('bzb'));
    expect(R.finished(r.state)).toBe(true);
    expect(r.state.endedBy).toBe('chain-full');
    expect(R.places(r.state)[0]).toMatchObject({ seat: 1, place: 1 });
  });

  it('shares a place between players level on strikes and words', () => {
    const s = R.end(start(2), T0);
    expect(s.endedBy).toBe('abandoned');
    expect(R.places(s).map((p) => p.place)).toEqual([1, 1]);
  });

  it('takes a player who left out of the game, passing the turn on if it was theirs', () => {
    const s = R.drop(start(3), 1, T0 + 500);
    expect(s.seats.find((x) => x.seat === 1)).toMatchObject({ left: true, outOrder: 1 });
    expect(s.turn!.seat).toBe(2);
    const two = R.drop(s, 2, T0 + 600);
    expect(R.finished(two)).toBe(true);
    expect(R.places(two)[0]!.seat).toBe(3);
  });

  it('refuses every move once finished', () => {
    expect(R.apply(R.end(start(), T0), 1, ok('mal'), T0)).toEqual({ ok: false, reason: 'finished' });
  });
});

describe('what each seat sees', () => {
  it('says whose turn it is, the letter and how to write it, and only the reason for a strike', () => {
    let s = play(start(2), 1, ok('sêv')).state;
    s = play(s, 2, { key: 'vvv', verdict: 'not-a-word', meaning: null }).state;
    const mine = R.viewFor(s, 1);
    expect(mine.yourTurn).toBe(true);
    expect(mine.required).toBe('v');
    expect(mine.requiredSpellings).toEqual(['v']);
    expect(mine.strikes).toEqual([{ seat: 2, reason: 'not-a-word', turn: 2 }]);
    // the refused text is nowhere in anyone's view
    expect(JSON.stringify(R.viewFor(s, 1))).not.toContain('vvv');
    expect(JSON.stringify(R.viewFor(s, null))).not.toContain('vvv');
    expect(R.viewFor(s, 2).yourTurn).toBe(false);
  });

  it('shows Soranî’s spelling of a vowel at the start of a word', () => {
    const s0 = R.init({ dialect: 'ckb', turnSeconds: 30 }, seats(2), { now: T0, seed: 's' });
    const s = R.apply({ ...s0, turn: { seat: 1, n: 1, startedAt: T0, endsAt: T0 + 30_000 } }, 1, ok('چرا'), T0);
    if (!s.ok) throw new Error(s.reason);
    expect(R.viewFor(s.state, 2)).toMatchObject({ required: 'ا', requiredSpellings: ['ئا'] });
    const next = R.apply(s.state, 2, ok('ئاو'), T0);
    expect(next.ok && next.outcome.accepted).toBe(true);
  });
});

describe('Hevalo', () => {
  it('thinks for a believable moment, the same on every replica', () => {
    const ms = hevaloThinkMs('seed', 3);
    expect(ms).toBeGreaterThanOrEqual(1400);
    expect(ms).toBeLessThanOrEqual(3200);
    expect(hevaloThinkMs('seed', 3)).toBe(ms);
    const s = R.init({ dialect: 'kmr', turnSeconds: 30 }, seats(2, 2), { now: T0, seed: 'x' });
    const hevaloTurn = { ...s, turn: null };
    const after = R.apply({ ...hevaloTurn, turn: { seat: 1, n: 1, startedAt: T0, endsAt: T0 + 30_000 } }, 1, ok('mal'), T0);
    if (!after.ok) throw new Error(after.reason);
    expect(after.state.turn!.endsAt - after.state.turn!.startedAt).toBe(hevaloThinkMs('x', 2));
  });

  it('misses more often as the chain grows, never more than about a third of the time', () => {
    const rate = (len: number) => Array.from({ length: 2000 }, (_, i) => hevaloMisses('s', i, len)).filter(Boolean).length / 2000;
    expect(rate(0)).toBeLessThan(rate(20));
    expect(rate(200)).toBeLessThan(0.4);
    expect(seededUnit('a', 1)).toBe(seededUnit('a', 1));
  });
});

describe('when the game is offered', () => {
  it('needs a big enough dictionary, and curated words for Hevalo', () => {
    expect(lastLetterAvailability('kmr', 79, 79)).toEqual({ dialect: 'kmr', group: false, solo: false });
    expect(lastLetterAvailability('kmr', LAST_LETTER_MIN_DICTIONARY_WORDS, 10)).toEqual({ dialect: 'kmr', group: true, solo: false });
    expect(lastLetterAvailability('ckb', LAST_LETTER_MIN_DICTIONARY_WORDS, LAST_LETTER_MIN_HEVALO_WORDS)).toEqual({
      dialect: 'ckb',
      group: true,
      solo: true,
    });
  });
});
