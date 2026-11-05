import { describe, expect, it } from 'vitest';
import {
  DONT_SAY_BUZZ_PENALTY,
  DONT_SAY_COOP_ROUNDS,
  DONT_SAY_READY_MS,
  DONT_SAY_SKIPS_PER_TURN,
  DONT_SAY_TURN_MS,
  dontSayClueSlip,
  dontSayRules as R,
  dontSayStartProblem,
  type DontSayCard,
  type DontSayMove,
  type DontSayState,
} from './rules.js';

// stand-in Kurdish for the fixtures, never shown to a learner
const T0 = 1_700_000_000_000;
const READY = T0 + DONT_SAY_READY_MS + 1;
const card = (target: string, forbidden: string[], forms: string[] = []): DontSayCard => ({ target, meanings: { en: `${target} (en)` }, forbidden, forms });
const DECK: DontSayCard[] = [
  card('pisîk', ['heywan', 'mişk', 'nerm'], ['pisîkan']),
  card('nan', ['xwarin', 'firne', 'genim']),
  card('av', ['vexwarin', 'çem', 'şil']),
  card('dar', ['pel', 'daristan', 'şax']),
  card('sêv', ['fêkî', 'sor', 'dar']),
];
const seat = (n: number, team: number | null) => ({ seat: n, team, bot: null });

function start(seats = [seat(1, 1), seat(2, 2), seat(3, 1), seat(4, 2)], deck = DECK): DontSayState {
  return R.init({ dialect: 'kmr', difficulty: 'beginner', deck }, seats, { now: T0, seed: 'g' });
}

function play(state: DontSayState, who: number, move: DontSayMove, at = READY) {
  const r = R.apply(state, who, move, at);
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe('the teams', () => {
  it('play together with three, in two teams of two or more with four to eight', () => {
    expect(dontSayStartProblem([seat(1, 1), seat(2, 1), seat(3, 1)])).toBeNull();
    expect(dontSayStartProblem([seat(1, 1), seat(2, 2), seat(3, 1), seat(4, 2)])).toBeNull();
    expect(dontSayStartProblem([seat(1, 1), seat(2, 1), seat(3, 1), seat(4, 2)])).toBe('teams-uneven');
    expect(dontSayStartProblem([seat(1, 1), seat(2, 2)])).toBe('need-players');
    expect(R.startProblem!([seat(1, 1), seat(2, 2), seat(3, 2), seat(4, 2), seat(5, 2)])).toBe('teams-uneven');
  });

  it('take turns, each describer once, the smaller team’s more than once to even them out', () => {
    const s = start([seat(1, 1), seat(2, 2), seat(3, 1), seat(4, 2), seat(5, 1)]);
    expect(s.mode).toBe('teams');
    expect(s.order).toHaveLength(6);
    for (let i = 1; i < s.order.length; i++) expect(s.order[i]!.team).not.toBe(s.order[i - 1]!.team);
    expect(s.order.filter((o) => o.team === 2).map((o) => o.seat)).toEqual([2, 4, 2]);
  });

  it('in co-op, each of the three describes twice, and everyone else guesses', () => {
    const s = start([seat(1, 1), seat(2, 2), seat(3, 1)]);
    expect(s.mode).toBe('coop');
    expect(s.order).toHaveLength(3 * DONT_SAY_COOP_ROUNDS);
    const describer = s.turn!.seat;
    const others = [1, 2, 3].filter((x) => x !== describer);
    for (const o of others) expect(R.viewFor(s, o).role).toBe('guesser');
  });
});

describe('what each player may see', () => {
  it('shows the card to the describer alone: never to the guessers or the other team', () => {
    const s = start();
    const describer = s.turn!.seat;
    const mine = R.viewFor(s, describer);
    expect(mine.role).toBe('describer');
    expect(mine.card).toEqual({ target: DECK[0]!.target, meanings: DECK[0]!.meanings, forbidden: DECK[0]!.forbidden });
    for (const other of [1, 2, 3, 4].filter((x) => x !== describer)) {
      const v = R.viewFor(s, other);
      expect(v.card).toBeNull();
      const json = JSON.stringify(v);
      for (const hidden of [DECK[0]!.target, ...DECK[0]!.forbidden, 'pisîkan']) expect(json).not.toContain(hidden);
    }
    expect(R.viewFor(s, null).card).toBeNull();
  });

  it('shows a done card’s word to everyone, and its forbidden words only once the game is over', () => {
    const s = start();
    const d = s.turn!.seat;
    const skipped = play(s, d, { kind: 'skip' }).state;
    const other = [1, 2, 3, 4].find((x) => x !== d)!;
    const v = R.viewFor(skipped, other);
    expect(v.done).toEqual([{ turn: 1, team: s.turn!.team, target: 'pisîk', meanings: DECK[0]!.meanings, forbidden: null, result: 'skipped', by: null }]);
    expect(JSON.stringify(v)).not.toContain('heywan');
    const over = R.end(skipped, T0 + 10_000);
    expect(R.viewFor(over, other).done[0]!.forbidden).toEqual(DECK[0]!.forbidden);
  });
});

describe('a turn', () => {
  it('lasts a minute after a moment to get ready, and refuses moves before it starts', () => {
    const s = start();
    expect(R.dueAt(s)).toBe(T0 + DONT_SAY_READY_MS + DONT_SAY_TURN_MS);
    expect(R.apply(s, s.turn!.seat, { kind: 'clue', text: 'heywanek biçûk' }, T0 + 1000)).toEqual({ ok: false, reason: 'not-ready' });
  });

  it('shows an accepted clue to everyone and lets only the describer’s team guess', () => {
    const s = start();
    const d = s.turn!.seat;
    const team = s.turn!.team;
    const mate = s.seats.find((x) => x.team === team && x.seat !== d)!.seat;
    const rival = s.seats.find((x) => x.team !== team)!.seat;
    const r = play(s, d, { kind: 'clue', text: 'li malê dijî' });
    expect(r.outcome).toEqual({ kind: 'clue' });
    expect(R.viewFor(r.state, rival).clues.map((c) => c.text)).toEqual(['li malê dijî']);
    expect(R.mayMove!(r.state, rival)).toBe(false);
    expect(R.apply(r.state, rival, { kind: 'guess', text: 'pisîk' }, READY)).toEqual({ ok: false, reason: 'not-your-turn' });
    expect(R.apply(r.state, d, { kind: 'guess', text: 'pisîk' }, READY)).toEqual({ ok: false, reason: 'not-your-turn' });
    expect(R.mayMove!(r.state, mate)).toBe(true);
    expect(R.waitingFor(r.state)).toEqual([d]);
  });

  it('buzzes a clue that says the word, a forbidden word or a form, with a penalty, and never shows it to anyone else', () => {
    const s = start();
    const d = s.turn!.seat;
    const team = s.turn!.team;
    const r = play(s, d, { kind: 'clue', text: 'ew heywanek e' });
    expect(r.outcome).toEqual({ kind: 'buzz', said: 'heywan' });
    expect(r.state.scores[team]).toBe(-DONT_SAY_BUZZ_PENALTY);
    expect(r.state.done.at(-1)).toMatchObject({ result: 'buzzed', by: d });
    expect(r.state.turn!.drawn).toBe(2);
    const v = R.viewFor(r.state, [1, 2, 3, 4].find((x) => x !== d)!);
    expect(v.buzz).toEqual({ seat: d, turn: 1, n: 1 });
    expect(JSON.stringify(v)).not.toContain('ew heywanek e');
    expect(play(start(), d, { kind: 'clue', text: 'pisîkan' }).outcome.kind).toBe('buzz');
  });

  it('refuses a clue in the wrong script without a penalty, and checks the box before sending', () => {
    const s = start();
    const d = s.turn!.seat;
    expect(R.apply(s, d, { kind: 'clue', text: 'گیانلەبەر' }, READY)).toEqual({ ok: false, reason: 'script' });
    expect(dontSayClueSlip(R.viewFor(s, d), 'mişkan digire')).toBe('says-word');
    expect(dontSayClueSlip(R.viewFor(s, d), 'li malê dijî')).toBeNull();
  });

  it('takes a right guess with dialect folding, scores it, and draws the next card', () => {
    const s = start();
    const d = s.turn!.seat;
    const mate = s.seats.find((x) => x.team === s.turn!.team && x.seat !== d)!.seat;
    const wrong = play(s, mate, { kind: 'guess', text: 'kûçik' });
    expect(wrong.outcome).toEqual({ kind: 'guess', right: false });
    expect(R.viewFor(wrong.state, d).guesses.map((g) => g.text)).toEqual(['kûçik']);
    const right = play(wrong.state, mate, { kind: 'guess', text: 'pisik' });
    expect(right.outcome).toEqual({ kind: 'guess', right: true });
    expect(right.state.scores[s.turn!.team]).toBe(1);
    expect(right.state.done.at(-1)).toMatchObject({ result: 'guessed', by: mate });
    expect(R.viewFor(right.state, d).card!.target).toBe('nan');
    expect(R.viewFor(right.state, d).guesses).toEqual([]);
  });

  it('allows two skips a turn', () => {
    let s = start();
    const d = s.turn!.seat;
    for (let i = 0; i < DONT_SAY_SKIPS_PER_TURN; i++) s = play(s, d, { kind: 'skip' }).state;
    expect(R.apply(s, d, { kind: 'skip' }, READY)).toEqual({ ok: false, reason: 'no-skips' });
    expect(R.viewFor(s, d).skipsLeft).toBe(0);
  });

  it('passes to the other team when the minute is up, putting the card in play away', () => {
    const s = start();
    const first = s.turn!;
    const next = R.timeout(s, [first.seat], first.endsAt + 1);
    expect(next.done.at(-1)).toMatchObject({ result: 'time', turn: 1 });
    expect(next.turn!.team).not.toBe(first.team);
    expect(next.turn!.n).toBe(2);
    // a guesser is never timed out: only the describer is waited on
    expect(R.timeout(s, [99], first.endsAt + 1)).toBe(s);
  });

  it('ends when the deck runs out, or the turns are done', () => {
    const short = start(undefined, DECK.slice(0, 2));
    const d = short.turn!.seat;
    const s1 = play(short, d, { kind: 'skip' }).state;
    expect(play(s1, d, { kind: 'skip' }).state.endedBy).toBe('deck-empty');
    let s = start([seat(1, 1), seat(2, 2), seat(3, 1), seat(4, 2)], [...DECK, ...DECK]);
    while (s.finishedAt === null) s = R.timeout(s, [s.turn!.seat], s.turn!.endsAt + 1);
    expect(s.endedBy).toBe('turns-done');
  });
});

describe('the places', () => {
  it('put the team with more points first, everyone in it together, and a draw first for all', () => {
    const s = start();
    const d = s.turn!.seat;
    const mate = s.seats.find((x) => x.team === s.turn!.team && x.seat !== d)!.seat;
    const won = R.end(play(s, mate, { kind: 'guess', text: 'pisîk' }, READY).state, T0 + 20_000);
    const places = R.places(won);
    const winners = places.filter((p) => p.place === 1).map((p) => p.seat).sort();
    expect(winners).toEqual([d, mate].sort());
    expect(places.filter((p) => p.place === 3)).toHaveLength(2);
    expect(R.places(R.end(start(), T0)).every((p) => p.place === 1)).toBe(true);
  });

  it('puts a co-op table first only when it reached its aim', () => {
    const coop = start([seat(1, 1), seat(2, 1), seat(3, 1)], [...DECK, ...DECK]);
    expect(R.viewFor(coop, 1).goal).toBe(6);
    const missed = R.places(R.end(coop, T0));
    expect(missed.every((p) => p.place === 3)).toBe(true);
  });
});

describe('leaving', () => {
  it('passes a departing describer’s turn, and ends when a team cannot go on', () => {
    const s = start([seat(1, 1), seat(2, 2), seat(3, 1), seat(4, 2), seat(5, 1), seat(6, 2)], [...DECK, ...DECK]);
    const d = s.turn!.seat;
    const passed = R.drop(s, d, T0 + 2000);
    expect(passed.done.at(-1)).toMatchObject({ result: 'time' });
    expect(passed.turn!.seat).not.toBe(d);
    const four = start();
    expect(R.drop(four, four.turn!.seat, T0 + 2000).endedBy).toBe('too-few');
  });
});
