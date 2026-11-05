import { describe, expect, it } from 'vitest';
import {
  BLUFF_FOOLED_POINTS,
  BLUFF_FOUND_POINTS,
  BLUFF_MIN_CARDS,
  BLUFF_MIN_LANGUAGE_CARDS,
  bluffOffer,
  bluffRules as R,
  defaultBluffLanguage,
  definitionKey,
  type BluffDealtCard,
  type BluffMove,
  type BluffState,
} from './rules.js';

const T0 = 1_700_000_000_000;
const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ seat: i + 1, team: null, bot: null }));
const deck: BluffDealtCard[] = [
  { id: 'c1', word: 'qelew', real: 'fat, plump', example: { ku: 'Pisîk qelew e.', meaning: 'The cat is fat.' } },
  { id: 'c2', word: 'gurz', real: 'a club, a mace', example: null },
  { id: 'c3', word: 'şemitîn', real: 'to slip', example: null },
];

function start(n = 4, rounds: 3 | 5 | 7 = 3): BluffState {
  return R.init({ dialect: 'kmr', language: 'en', rounds, writeSeconds: 60, deck }, seats(n), { now: T0, seed: 'seed-1' });
}

function play(state: BluffState, seat: number, move: BluffMove, at = T0 + 1_000): BluffState {
  const r = R.apply(state, seat, move, at);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const write = (text: string): BluffMove => ({ kind: 'write', text });

/** Everyone writes, so the vote opens. */
function toVote(n = 4, fakes = ['a stone wall', 'a kind of bread', 'to sing softly', 'a small bird']): BluffState {
  let s = start(n);
  for (let seat = 1; seat <= n; seat++) s = play(s, seat, write(fakes[seat - 1]!));
  return s;
}

describe('starting', () => {
  it('deals the words it was given, at most as many as the rounds, and writes first', () => {
    const s = start(4, 3);
    expect(s.deck.map((c) => c.word)).toEqual(['qelew', 'gurz', 'şemitîn']);
    expect(s.phase).toBe('write');
    expect(R.waitingFor(s)).toEqual([1, 2, 3, 4]);
    expect(R.dueAt(s)).toBe(T0 + 60_000);
  });

  it('ends at once with no cards to play', () => {
    const s = R.init({ dialect: 'kmr', language: 'en', rounds: 5, writeSeconds: 60 }, seats(3), { now: T0, seed: 'x' });
    expect(R.finished(s)).toBe(true);
    expect(s.endedBy).toBe('too-few');
  });
});

describe('writing', () => {
  it('shows the word but never the real meaning, and says who has written but never what', () => {
    const s = play(start(), 2, write('a sort of cheese'));
    const theirs = R.viewFor(s, 1);
    expect(theirs.word).toBe('qelew');
    expect(theirs.writtenBy).toEqual([2]);
    expect(JSON.stringify(theirs)).not.toContain('fat, plump');
    expect(JSON.stringify(theirs)).not.toContain('a sort of cheese');
    // the writer sees their own
    expect(R.viewFor(s, 2).mine).toMatchObject({ wrote: 'a sort of cheese', canWrite: false });
  });

  it('takes one fake per player per word', () => {
    const s = play(start(), 2, write('a sort of cheese'));
    expect(R.apply(s, 2, write('another'), T0 + 2_000)).toEqual({ ok: false, reason: 'not-now' });
  });

  it('counts a fake that is the real meaning as knowing the word, and keeps it off the table', () => {
    let s = play(start(), 1, write('Fat, plump!'));
    expect(s.current.knewIt).toEqual([1]);
    for (const seat of [2, 3, 4]) s = play(s, seat, write(`fake ${seat}`));
    expect(s.phase).toBe('vote');
    expect(s.current.voters).not.toContain(1);
    expect(s.current.options!.filter((o) => o.real)).toHaveLength(1);
    s = play(play(play(s, 2, { kind: 'vote', option: s.current.options!.find((o) => o.real)!.id }), 3, { kind: 'vote', option: s.current.options!.find((o) => o.real)!.id }), 4, {
      kind: 'vote',
      option: s.current.options!.find((o) => o.real)!.id,
    });
    expect(s.phase).toBe('reveal');
    expect(s.seats.find((x) => x.seat === 1)!.score).toBe(BLUFF_FOUND_POINTS);
  });

  it('closes the writing on the clock, laying out what was written', () => {
    let s = play(start(), 1, write('a sort of cheese'));
    s = play(s, 2, write('a mountain path'));
    s = R.timeout(s, [3, 4], T0 + 60_000);
    expect(s.phase).toBe('vote');
    expect(s.current.options).toHaveLength(3);
  });

  it('goes straight to the reveal when nobody bluffed', () => {
    const s = R.timeout(start(), [1, 2, 3, 4], T0 + 60_000);
    expect(s.phase).toBe('reveal');
    expect(R.viewFor(s, 1).reveal).toMatchObject({ word: 'qelew', real: 'fat, plump', options: [{ real: true, authors: [] }] });
  });

  it('passes an away player over without rushing a table that has all stepped away', () => {
    let s = R.timeout(start(), [4], T0 + 5_000);
    expect(R.waitingFor(s)).toEqual([1, 2, 3]);
    // everyone away and nobody wrote: the phase waits for its clock
    s = R.timeout(s, [1, 2, 3], T0 + 6_000);
    expect(s.phase).toBe('write');
    expect(R.waitingFor(s)).toEqual([]);
    expect(R.timeout(s, [], T0 + 60_000).phase).toBe('reveal');
  });
});

describe('voting', () => {
  it('lays the fakes and the real meaning out in letters, the same for everyone, never marking the real one', () => {
    const s = toVote();
    const v1 = R.viewFor(s, 1);
    expect(v1.phase).toBe('vote');
    expect(v1.options!.every((o) => /^[A-J]$/.test(o.id))).toBe(true);
    expect(Object.keys(v1.options![0]!).sort()).toEqual(['id', 'text']);
    expect(v1.reveal).toBeNull();
    // the same letters for the same texts in every view
    const v2 = R.viewFor(s, 2);
    for (const o of v2.options!) {
      const same = v1.options!.find((x) => x.id === o.id);
      if (same) expect(same.text).toBe(o.text);
    }
  });

  it('never offers a player their own fake', () => {
    const s = toVote();
    expect(R.viewFor(s, 1).options!.map((o) => o.text)).not.toContain('a stone wall');
    expect(R.viewFor(s, 1).options!.map((o) => o.text)).toContain('a kind of bread');
    const own = s.current.options!.find((o) => o.text === 'a stone wall')!;
    expect(R.apply(s, 1, { kind: 'vote', option: own.id }, T0 + 2_000)).toEqual({ ok: false, reason: 'own-option' });
  });

  it('merges two fakes that say the same, and hides it from both who wrote it', () => {
    const s = toVote(4, ['A stone wall.', 'a stone   wall', 'to sing softly', 'a small bird']);
    const merged = s.current.options!.filter((o) => definitionKey(o.text) === 'a stone wall');
    expect(merged).toHaveLength(1);
    expect(merged[0]!.authors).toEqual([1, 2]);
    expect(R.viewFor(s, 1).options!.some((o) => o.id === merged[0]!.id)).toBe(false);
    expect(R.viewFor(s, 2).options!.some((o) => o.id === merged[0]!.id)).toBe(false);
    expect(R.viewFor(s, 3).options!.some((o) => o.id === merged[0]!.id)).toBe(true);
  });

  it('keeps votes hidden until everyone has voted', () => {
    let s = toVote();
    const real = s.current.options!.find((o) => o.real)!.id;
    s = play(s, 1, { kind: 'vote', option: real });
    const seen = R.viewFor(s, 2);
    expect(seen.votedBy).toEqual([1]);
    expect(seen.reveal).toBeNull();
    expect(JSON.stringify(seen)).not.toContain('"real":true');
    expect(R.viewFor(s, 1).mine!.vote).toBe(real);
  });

  it('scores two for finding the real meaning and one for each player fooled', () => {
    let s = toVote();
    const real = s.current.options!.find((o) => o.real)!.id;
    const bread = s.current.options!.find((o) => o.text === 'a kind of bread')!.id;
    s = play(s, 1, { kind: 'vote', option: real });
    s = play(s, 2, { kind: 'vote', option: real });
    s = play(s, 3, { kind: 'vote', option: bread });
    s = play(s, 4, { kind: 'vote', option: bread });
    expect(s.phase).toBe('reveal');
    const score = (seat: number) => s.seats.find((x) => x.seat === seat)!.score;
    expect(score(1)).toBe(BLUFF_FOUND_POINTS);
    // seat 2 wrote "a kind of bread": found it, and fooled two
    expect(score(2)).toBe(BLUFF_FOUND_POINTS + 2 * BLUFF_FOOLED_POINTS);
    expect(score(3)).toBe(0);
    const reveal = R.viewFor(s, 3).reveal!;
    expect(reveal).toMatchObject({ round: 1, word: 'qelew', real: 'fat, plump', example: { ku: 'Pisîk qelew e.', meaning: 'The cat is fat.' } });
    expect(reveal.options.find((o) => o.id === bread)).toMatchObject({ authors: [2], voters: [3, 4], real: false });
    expect(reveal.points.find((p) => p.seat === 2)).toMatchObject({ found: 2, fooled: 2, total: 4 });
  });

  it('reveals on the clock with the votes there are', () => {
    let s = toVote();
    s = play(s, 1, { kind: 'vote', option: s.current.options!.find((o) => o.real)!.id });
    s = R.timeout(s, [2, 3, 4], s.phaseEndsAt);
    expect(s.phase).toBe('reveal');
    expect(s.seats.find((x) => x.seat === 1)!.score).toBe(BLUFF_FOUND_POINTS);
  });
});

describe('rounds and the end', () => {
  it('moves to the next word when the reveal’s time is up, waiting on nobody meanwhile', () => {
    let s = R.timeout(start(), [1, 2, 3, 4], T0 + 60_000);
    expect(R.waitingFor(s)).toEqual([]);
    expect(R.dueAt(s)).toBe(s.phaseEndsAt);
    s = R.timeout(s, [], s.phaseEndsAt);
    expect(s.phase).toBe('write');
    expect(R.viewFor(s, 1)).toMatchObject({ round: 2, word: 'gurz' });
    expect(R.viewFor(s, 1).history).toHaveLength(1);
  });

  it('finishes after the last word and places by score, ties sharing', () => {
    let s = start(3);
    for (let round = 0; round < 3; round++) {
      s = R.timeout(s, [1, 2, 3], s.phaseEndsAt);
      s = R.timeout(s, [], s.phaseEndsAt);
    }
    expect(R.finished(s)).toBe(true);
    expect(s.endedBy).toBe('rounds');
    expect(R.places(s).map((p) => p.place)).toEqual([1, 1, 1]);
    expect(R.viewFor(s, 1).history.map((h) => h.word)).toEqual(['qelew', 'gurz', 'şemitîn']);
  });

  it('keeps a leaver’s fake in play, stops waiting for them, and ends when one player is left', () => {
    let s = play(start(3), 1, write('a sort of cheese'));
    s = R.drop(s, 1, T0 + 2_000);
    expect(R.waitingFor(s)).toEqual([2, 3]);
    s = play(s, 2, write('a hill'));
    s = play(s, 3, write('to run'));
    expect(s.current.options!.some((o) => o.text === 'a sort of cheese')).toBe(true);
    s = R.drop(s, 2, T0 + 3_000);
    expect(s.endedBy).toBe('too-few');
    expect(R.places(s).at(-1)!.seat).not.toBe(3);
  });

  it('shows someone outside the game no seat of their own', () => {
    const s = toVote();
    const outside = R.viewFor(s, null);
    expect(outside.mine).toBeNull();
    expect(outside.options!.every((o) => !('real' in o))).toBe(true);
  });
});

describe('where it is offered', () => {
  it('needs enough cards in all, and a language with enough of its own', () => {
    expect(bluffOffer(BLUFF_MIN_CARDS, { en: BLUFF_MIN_LANGUAGE_CARDS })).toMatchObject({ group: true, languages: [{ language: 'en' }] });
    expect(bluffOffer(BLUFF_MIN_CARDS - 1, { en: 30 }).group).toBe(false);
    expect(bluffOffer(40, { en: 9, de: 9 })).toEqual({ group: false, languages: [] });
    expect(bluffOffer(40, { en: 30, de: 12, fr: 3 }).languages.map((l) => l.language)).toEqual(['en', 'de']);
  });

  it('offers the host their own language first when it is offered', () => {
    const offered = [
      { language: 'en' as const, cards: 30 },
      { language: 'de' as const, cards: 12 },
    ];
    expect(defaultBluffLanguage(offered, 'de')).toBe('de');
    expect(defaultBluffLanguage(offered, 'tr')).toBe('en');
    expect(defaultBluffLanguage([], 'en')).toBeNull();
  });
});

describe('a game that did not count', () => {
  it('is one called off, or left with one player, never one whose words were played out', () => {
    expect(R.counted!(R.end(start(), T0))).toBe(false);
    let s = start(3);
    s = R.drop(s, 1, T0 + 10);
    s = R.drop(s, 2, T0 + 20);
    expect(s.endedBy).toBe('too-few');
    expect(R.counted!(s)).toBe(false);
  });
});

describe('a seat the viewer may not be shown', () => {
  it('has the fake only it wrote left off the viewer’s vote and out of the reveal', () => {
    const s = toVote(4);
    const all = R.viewFor(s, 1).options!.map((o) => o.text);
    expect(all).toContain('a kind of bread');
    const hidden = R.viewFor(s, 1, [2]).options!.map((o) => o.text);
    expect(hidden).not.toContain('a kind of bread');
    expect(hidden).toContain('fat, plump');
    let done = s;
    for (const seat of [1, 2, 3, 4]) {
      const mine = R.viewFor(done, seat).options!;
      done = play(done, seat, { kind: 'vote', option: mine[0]!.id });
    }
    const reveal = R.viewFor(done, 1, [2]).reveal!;
    expect(reveal.options.map((o) => o.text)).not.toContain('a kind of bread');
    expect(R.viewFor(done, 1).reveal!.options.map((o) => o.text)).toContain('a kind of bread');
  });
});
