import { describe, expect, it } from 'vitest';
import {
  IMPOSTOR_CLUE_ROUNDS,
  IMPOSTOR_FIRST_TURN_EXTRA_MS,
  IMPOSTOR_POINTS,
  impostorClueSlip,
  impostorRules as R,
  type ImpostorDeal,
  type ImpostorMove,
  type ImpostorState,
} from './rules.js';

// stand-in Kurdish for the fixtures, never shown to a learner
const T0 = 1_700_000_000_000;
const DEAL: ImpostorDeal = {
  card: { word: 'pisîk', meanings: { en: 'cat' }, forms: ['pisîkan'], hint: { ku: 'heywan', meanings: { en: 'animal' } } },
  decoys: ['kûçik', 'hesp', 'mişk'],
};
const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ seat: i + 1, team: null, bot: null }));

/** A game of `n` with seat `impostor` the impostor and the seats speaking in seat order. */
function start(n = 4, impostor = 2): ImpostorState {
  const s = R.init({ dialect: 'kmr', difficulty: 'beginner', clueSeconds: 30, deal: DEAL }, seats(n), { now: T0, seed: 'g' });
  const order = seats(n).map((x) => x.seat);
  return { ...s, impostor, order, turn: { seat: 1, round: 1, n: 1, startedAt: T0, endsAt: T0 + 38_000 } };
}

function play(state: ImpostorState, seat: number, move: ImpostorMove, at = T0 + 1000): ImpostorState {
  const r = R.apply(state, seat, move, at);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Every clue given, in order, with harmless words. */
function allClues(state: ImpostorState): ImpostorState {
  const words = ['heywan', 'mal', 'biçûk', 'nerm', 'şîr', 'dû', 'pif', 'şev', 'kur', 'bav', 'gir', 'çav', 'rê', 'dar', 'gul', 'çiya'];
  let s = state;
  let i = 0;
  while (s.phase === 'clues') s = play(s, s.turn!.seat, { kind: 'clue', text: words[i++]! });
  return s;
}

function vote(state: ImpostorState, votes: Record<number, number>): ImpostorState {
  let s = state;
  for (const [seat, target] of Object.entries(votes)) s = play(s, Number(seat), { kind: 'vote', seat: target });
  return s;
}

describe('the deal', () => {
  it('draws the impostor and the speaking order from the seed, and gives the first speaker time to read', () => {
    const s = R.init({ dialect: 'kmr', difficulty: 'beginner', clueSeconds: 20, deal: DEAL }, seats(5), { now: T0, seed: 'abc' });
    expect([1, 2, 3, 4, 5]).toContain(s.impostor);
    expect([...s.order].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(s.turn!.seat).toBe(s.order[0]);
    expect(s.turn!.endsAt - s.turn!.startedAt).toBe(20_000 + IMPOSTOR_FIRST_TURN_EXTRA_MS);
    expect(s.options).toHaveLength(4);
    expect(s.options).toContain('pisîk');
    const again = R.init({ dialect: 'kmr', difficulty: 'beginner', clueSeconds: 20, deal: DEAL }, seats(5), { now: T0, seed: 'abc' });
    expect(again.impostor).toBe(s.impostor);
    expect(again.order).toEqual(s.order);
  });

  it('ends at once without a deal, or with too few people', () => {
    expect(R.init({ dialect: 'kmr', difficulty: 'beginner', clueSeconds: 30 }, seats(4), { now: T0, seed: 'g' }).endedBy).toBe('too-few');
    expect(R.init({ dialect: 'kmr', difficulty: 'beginner', clueSeconds: 30, deal: DEAL }, seats(2), { now: T0, seed: 'g' }).endedBy).toBe('too-few');
  });
});

describe('what each player may see', () => {
  it('shows the word to everyone but the impostor, and the impostor to nobody but themselves', () => {
    const s = start(4, 2);
    for (const seat of [1, 3, 4]) {
      const v = R.viewFor(s, seat);
      expect(v.hand).toEqual({ role: 'player', word: 'pisîk', meanings: { en: 'cat' } });
      expect(v.reveal).toBeNull();
      expect(v.guess).toBeNull();
      expect(v.accused).toBeNull();
    }
    const theirs = R.viewFor(s, 2);
    expect(theirs.hand).toEqual({ role: 'impostor' });
    expect(theirs.hint).toEqual({ ku: 'heywan', meanings: { en: 'animal' } });
    const json = JSON.stringify(theirs);
    for (const hidden of ['pisîk', '"cat"', 'kûçik', 'hesp', 'mişk']) expect(json).not.toContain(hidden);
    // nobody else's view says who it is, however it is read
    expect(JSON.stringify(R.viewFor(s, 1))).not.toMatch(/impostor"\s*:\s*2/);
    expect(R.viewFor(s, null).hand).toBeNull();
    expect(JSON.stringify(R.viewFor(s, null))).not.toContain('pisîk');
  });

  it('keeps how anyone voted to the reveal, saying only who has voted', () => {
    const s = vote(allClues(start(4, 2)), { 1: 2 });
    const v = R.viewFor(s, 3);
    expect(v.vote!.voted).toEqual([1]);
    expect(v.vote!.mine).toBeNull();
    expect(R.viewFor(s, 1).vote!.mine).toBe(2);
    expect(JSON.stringify(v)).not.toContain('"for"');
  });
});

describe('the clues', () => {
  it('go round twice in order, then the vote opens', () => {
    const s = allClues(start(3, 2));
    expect(s.phase).toBe('vote');
    expect(s.clues).toHaveLength(3 * IMPOSTOR_CLUE_ROUNDS);
    expect(s.clues.map((c) => c.seat)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(R.waitingFor(s)).toEqual([1, 2, 3]);
  });

  it('refuses a clue out of turn, one that says the word or a form of it, a repeat, and one not in the variety’s script', () => {
    const s = start(4, 2);
    expect(R.apply(s, 3, { kind: 'clue', text: 'heywan' }, T0)).toEqual({ ok: false, reason: 'not-your-turn' });
    expect(R.apply(s, 1, { kind: 'clue', text: 'pisika' }, T0)).toEqual({ ok: false, reason: 'says-word' });
    expect(R.apply(s, 1, { kind: 'clue', text: 'pisîkan' }, T0)).toEqual({ ok: false, reason: 'says-word' });
    expect(R.apply(s, 1, { kind: 'clue', text: 'گیانلەبەر' }, T0)).toEqual({ ok: false, reason: 'script' });
    expect(R.apply(s, 1, { kind: 'clue', text: 'yek du sê çar pênc' }, T0)).toEqual({ ok: false, reason: 'too-many-words' });
    const s1 = play(s, 1, { kind: 'clue', text: 'heywan' });
    expect(R.apply(s1, 2, { kind: 'clue', text: 'Heywan' }, T0)).toEqual({ ok: false, reason: 'repeat' });
  });

  it('never tells the impostor their clue said the word: it is taken as written', () => {
    const s = play(start(4, 1), 1, { kind: 'clue', text: 'pisîk' });
    expect(s.clues[0]).toEqual({ round: 1, seat: 1, text: 'pisîk' });
  });

  it('passes a turn whose time ran out, or whose player left, with no clue', () => {
    const s = R.timeout(start(5, 4), [1], T0 + 40_000);
    expect(s.clues[0]).toEqual({ round: 1, seat: 1, text: null });
    expect(s.turn!.seat).toBe(2);
    const gone = R.drop(s, 2, T0 + 41_000);
    expect(gone.clues.at(-1)).toEqual({ round: 1, seat: 2, text: null });
    expect(gone.turn!.seat).toBe(3);
  });

  it('checks a clue in the box for a player who holds the word, and only the slips for the impostor', () => {
    const s = start(4, 2);
    expect(impostorClueSlip(R.viewFor(s, 1), 'pisîka')).toBe('says-word');
    expect(impostorClueSlip(R.viewFor(s, 2), 'pisîka')).toBeNull();
    expect(impostorClueSlip(R.viewFor(s, 2), 'گیانلەبەر')).toBe('script');
  });
});

describe('the vote and the guess', () => {
  it('catches the impostor with the most votes, who then guesses from four, the word among them', () => {
    const s = vote(allClues(start(4, 2)), { 1: 2, 2: 1, 3: 2, 4: 2 });
    expect(s.phase).toBe('guess');
    expect(R.waitingFor(s)).toEqual([2]);
    const theirs = R.viewFor(s, 2);
    expect(theirs.yourGuess).toBe(true);
    expect(theirs.guess!.options).toHaveLength(4);
    expect(theirs.accused).toEqual({ seat: 2, votes: 3 });
    // the word is among the options, never named as the answer
    expect(theirs.reveal).toBeNull();
  });

  it('pays the table when the caught impostor guesses wrong, and the impostor when right', () => {
    const caught = vote(allClues(start(4, 2)), { 1: 2, 2: 1, 3: 2, 4: 2 });
    const wrong = play(caught, 2, { kind: 'guess', option: caught.options.indexOf('hesp') });
    expect(wrong.endedBy).toBe('caught');
    const places = R.places(wrong);
    expect(places.find((p) => p.seat === 1)).toMatchObject({ place: 1, score: IMPOSTOR_POINTS.rightVote + IMPOSTOR_POINTS.caught });
    expect(places.find((p) => p.seat === 2)).toMatchObject({ place: 4, score: 0 });

    const right = play(caught, 2, { kind: 'guess', option: caught.options.indexOf('pisîk') });
    expect(right.endedBy).toBe('guessed');
    const v = R.viewFor(right, 3);
    expect(v.reveal).toMatchObject({ impostor: 2, word: 'pisîk', caught: true, guessed: 'pisîk', guessedRight: true });
    expect(v.seats.find((x) => x.seat === 2)!.score).toBe(IMPOSTOR_POINTS.guessedWord);
  });

  it('lets the impostor slip away on a tie or a wrong accusation, and refuses a vote for yourself', () => {
    const s = allClues(start(4, 2));
    expect(R.apply(s, 1, { kind: 'vote', seat: 1 }, T0)).toEqual({ ok: false, reason: 'bad-vote' });
    const tie = vote(s, { 1: 2, 2: 1, 3: 1, 4: 2 });
    expect(tie.endedBy).toBe('escaped');
    expect(R.viewFor(tie, 1).reveal!.caught).toBe(false);
    expect(R.places(tie).find((p) => p.seat === 2)).toMatchObject({ place: 1, score: IMPOSTOR_POINTS.escaped });
    const wrong = vote(s, { 1: 3, 2: 3, 3: 1, 4: 3 });
    expect(wrong.endedBy).toBe('escaped');
    expect(R.viewFor(wrong, 1).reveal!.impostor).toBe(2);
    expect(R.viewFor(wrong, 1).accused).toEqual({ seat: 3, votes: 3 });
  });

  it('counts a vote nobody cast when its time runs out, and a guess never made as wrong', () => {
    const s = vote(allClues(start(3, 2)), { 1: 2, 3: 2 });
    const timed = R.timeout(s, [2], T0 + 100_000);
    expect(timed.votes.find((v) => v.seat === 2)).toEqual({ seat: 2, for: null });
    expect(timed.phase).toBe('guess');
    expect(R.timeout(timed, [2], T0 + 200_000).endedBy).toBe('caught');
  });
});

describe('leaving', () => {
  it('ends the game when the impostor leaves, or too few are left to hide among', () => {
    expect(R.drop(start(4, 2), 2, T0).endedBy).toBe('impostor-left');
    expect(R.drop(start(3, 2), 1, T0).endedBy).toBe('too-few');
    expect(R.end(start(4, 2), T0).endedBy).toBe('abandoned');
    expect(R.places(R.end(start(4, 2), T0)).every((p) => p.place === 1 && p.score === 0)).toBe(true);
  });
});

describe('a game that did not count', () => {
  it('is one called off: abandoned, too few left, or the impostor gone', () => {
    expect(R.counted!(R.drop(start(4, 2), 2, T0))).toBe(false);
    expect(R.counted!(R.drop(start(3, 2), 1, T0))).toBe(false);
    expect(R.counted!(R.end(start(4, 2), T0))).toBe(false);
  });

  it('is never one played out to a vote', () => {
    const escaped = vote(allClues(start(4, 2)), { 1: 3, 2: 1, 3: 1, 4: 3 });
    expect(escaped.endedBy).toBe('escaped');
    expect(R.counted!(escaped)).toBe(true);
  });
});

describe('a seat the viewer may not be shown', () => {
  it('has its clues read as turns that passed without one, and nobody else’s', () => {
    const s = allClues(start(4, 2));
    const view = R.viewFor(s, 1, [3]);
    expect(view.clues.filter((c) => c.seat === 3).every((c) => c.text === null)).toBe(true);
    expect(view.clues.filter((c) => c.seat !== 3).every((c) => c.text !== null)).toBe(true);
    expect(R.viewFor(s, 1).clues.every((c) => c.text !== null)).toBe(true);
  });
});
