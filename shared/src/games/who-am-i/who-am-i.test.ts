import { describe, expect, it } from 'vitest';
import {
  WHO_AM_I_FACTS,
  WHO_AM_I_MIN_QUESTIONS,
  WHO_AM_I_START_POINTS,
  answerFor,
  dealWhoAmI,
  isWhoAmIFact,
  whoAmIPoints,
  type WhoAmIIdentity,
  type WhoAmITemplate,
} from './game.js';
import { WHO_AM_I_RACE_AFTER_FIRST_SECONDS, whoAmIRaceRules as R, type WhoAmIRaceState } from './rules.js';

const T0 = 1_700_000_000_000;

const animal = (id: string, word: string, facts: Record<string, boolean>): WhoAmIIdentity => ({
  id,
  key: `w:${id}`,
  level: 1,
  word,
  meanings: { en: id },
  category: 'animal',
  facts: { alive: true, animal: true, ...facts },
});

const POOL: WhoAmIIdentity[] = [
  animal('cat', 'pisîk', { 'four-legs': true, 'can-fly': false, 'lives-in-water': false, 'bigger-than-person': false, 'at-home': true }),
  animal('dog', 'kûçik', { 'four-legs': true, 'can-fly': false, 'lives-in-water': false, 'bigger-than-person': false, 'at-home': true }),
  animal('bird', 'çûk', { 'four-legs': false, 'can-fly': true, 'lives-in-water': false, 'bigger-than-person': false, 'at-home': false }),
  animal('fish', 'masî', { 'four-legs': false, 'can-fly': false, 'lives-in-water': true, 'bigger-than-person': false, 'at-home': false }),
  animal('horse', 'hesp', { 'four-legs': true, 'can-fly': false, 'lives-in-water': false, 'bigger-than-person': true, 'at-home': false }),
  animal('cow', 'çêlek', { 'four-legs': true, 'can-fly': false, 'lives-in-water': false, 'bigger-than-person': true, 'at-home': false }),
  // a thing whose table says nothing about legs or flying
  { id: 'cup', key: 'w:cup', level: 1, word: 'kasik', meanings: { en: 'cup' }, category: 'object', facts: { alive: false, animal: false, 'at-home': true, sweet: false } },
];

const TEMPLATES: WhoAmITemplate[] = ['alive', 'animal', 'four-legs', 'can-fly', 'lives-in-water', 'bigger-than-person', 'at-home', 'sweet'].map((fact, i) => ({
  id: `q${i}`,
  ku: `pirs ${i}?`,
  meanings: { en: `question about ${fact}` },
  fact,
}));

describe('the facts and the points', () => {
  it('knows its facts by key, and answers from the table, no for anything it does not say yes to', () => {
    expect(WHO_AM_I_FACTS.length).toBeGreaterThanOrEqual(12);
    expect(isWhoAmIFact('can-fly')).toBe(true);
    expect(isWhoAmIFact('can-sing')).toBe(false);
    expect(answerFor(POOL[0]!, 'four-legs')).toBe(true);
    expect(answerFor(POOL[0]!, 'can-fly')).toBe(false);
  });

  it('scores fewer questions higher, a solved identity at least one, an unsolved one nothing', () => {
    expect(whoAmIPoints(0, 0, true)).toBe(WHO_AM_I_START_POINTS);
    expect(whoAmIPoints(3, 0, true)).toBeGreaterThan(whoAmIPoints(5, 0, true));
    expect(whoAmIPoints(3, 1, true)).toBeLessThan(whoAmIPoints(3, 0, true));
    expect(whoAmIPoints(40, 1, true)).toBe(1);
    expect(whoAmIPoints(0, 0, false)).toBe(0);
  });
});

describe('dealing a hidden identity', () => {
  it('deals the identity among others like it, with questions every tile can answer', () => {
    const deal = dealWhoAmI(POOL[0]!, POOL, TEMPLATES, { seed: 's', salt: '0', want: 4 })!;
    expect(deal.candidates).toHaveLength(4);
    expect(deal.candidates.map((c) => c.id)).toContain('cat');
    // the cup's table says nothing about legs: it is no tile beside the animals
    expect(deal.candidates.map((c) => c.id)).not.toContain('cup');
    expect(deal.questions.length).toBeGreaterThanOrEqual(WHO_AM_I_MIN_QUESTIONS);
    expect(deal.questions.map((q) => q.fact)).not.toContain('sweet');
    expect(new Set(deal.questions.map((q) => q.fact)).size).toBe(deal.questions.length);
  });

  it('deals the same way from the same seed, and differently from another', () => {
    const a = dealWhoAmI(POOL[0]!, POOL, TEMPLATES, { seed: 's', salt: '0', want: 4 });
    expect(dealWhoAmI(POOL[0]!, POOL, TEMPLATES, { seed: 's', salt: '0', want: 4 })).toEqual(a);
    const orders = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => dealWhoAmI(POOL[0]!, POOL, TEMPLATES, { seed, salt: '0', want: 4 })!.candidates.map((c) => c.id).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('deals fewer tiles rather than too few questions, and nothing when even that cannot work', () => {
    expect(dealWhoAmI(POOL[0]!, POOL.slice(0, 2), TEMPLATES, { seed: 's', salt: '0', want: 8 })).toBeNull();
    expect(dealWhoAmI(POOL[0]!, POOL, TEMPLATES.slice(0, 3), { seed: 's', salt: '0', want: 4 })).toBeNull();
    const few = dealWhoAmI(POOL[0]!, POOL, TEMPLATES, { seed: 's', salt: '0', want: 8 })!;
    expect(few.candidates.length).toBeLessThanOrEqual(7);
  });
});

function race(n = 3, minutes: 3 | 5 | 8 = 3): WhoAmIRaceState {
  const deals = Array.from({ length: n }, (_, i) => ({ seat: i + 1, deal: dealWhoAmI(POOL[i]!, POOL, TEMPLATES, { seed: 'r', salt: String(i), want: 4 })! }));
  return R.init({ dialect: 'kmr', minutes, difficulty: 'beginner', deals }, Array.from({ length: n }, (_, i) => ({ seat: i + 1, team: null, bot: null })), {
    now: T0,
    seed: 'r',
  });
}

function move(state: WhoAmIRaceState, seat: number, m: Parameters<typeof R.apply>[2], at = T0 + 1_000) {
  const r = R.apply(state, seat, m, at);
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe('the race', () => {
  it('waits on nobody but its clock, and lets every player still in it move', () => {
    const s = race();
    expect(R.waitingFor(s)).toEqual([]);
    expect(R.dueAt(s)).toBe(T0 + 3 * 60_000);
    expect(R.mayMove!(s, 1)).toBe(true);
    expect(R.timeout(s, [], T0 + 1_000)).toBe(s);
  });

  it('answers a question from the facts, once, and only questions on offer', () => {
    const s = race();
    const q = s.seats[0]!.deal!.questions.find((x) => x.fact === 'four-legs')!;
    const r = move(s, 1, { kind: 'ask', question: q.id });
    expect(r.outcome).toEqual({ kind: 'ask', answer: true, correct: null });
    expect(R.apply(r.state, 1, { kind: 'ask', question: q.id }, T0 + 2_000)).toEqual({ ok: false, reason: 'asked' });
    expect(R.apply(r.state, 1, { kind: 'ask', question: 'nope' }, T0 + 2_000)).toEqual({ ok: false, reason: 'no-such-question' });
  });

  it('keeps each player’s identity from them until they have it, and everyone’s from the others until the end', () => {
    const s = race();
    const mine = R.viewFor(s, 1);
    expect(mine.mine!.identity).toBeNull();
    expect(mine.reveal).toBeNull();
    expect(JSON.stringify(mine)).not.toContain('"facts"');
    expect(JSON.stringify(mine.seats)).not.toContain('kûçik');
    // the tiles carry no flag of which is right
    expect(Object.keys(mine.mine!.tiles[0]!).sort()).toEqual(['id', 'meanings', 'word']);
    const solved = move(s, 1, { kind: 'guess', tile: 'cat' }).state;
    expect(R.viewFor(solved, 1).mine!.identity).toMatchObject({ word: 'pisîk' });
    expect(R.viewFor(solved, 2).mine!.identity).toBeNull();
    expect(R.viewFor(solved, 2).seats.find((x) => x.seat === 1)).toMatchObject({ solved: true, asked: 0 });
  });

  it('gives the race to the first correct guess and the others ninety seconds to finish theirs', () => {
    let s = race(3, 8);
    s = move(s, 2, { kind: 'guess', tile: 'dog' }, T0 + 10_000).state;
    expect(s.firstSolver).toBe(2);
    expect(s.endsAt).toBe(T0 + 10_000 + WHO_AM_I_RACE_AFTER_FIRST_SECONDS * 1000);
    s = move(s, 1, { kind: 'ask', question: s.seats[0]!.deal!.questions[0]!.id }, T0 + 20_000).state;
    s = move(s, 1, { kind: 'guess', tile: 'cat' }, T0 + 30_000).state;
    s = R.timeout(s, [], s.endsAt);
    expect(R.finished(s)).toBe(true);
    const places = R.places(s);
    expect(places.find((p) => p.seat === 2)!.place).toBe(1);
    expect(places.find((p) => p.seat === 1)!.place).toBe(2);
    expect(places.find((p) => p.seat === 3)).toMatchObject({ place: 3, score: 0 });
    expect(R.viewFor(s, 3).reveal!.map((r) => r.word)).toContain('çûk');
  });

  it('puts a player out after two wrong guesses, and ends when nobody is still playing', () => {
    let s = race(2);
    const wrong = s.seats[0]!.deal!.candidates.filter((c) => c.id !== 'cat');
    s = move(s, 1, { kind: 'guess', tile: wrong[0]!.id }).state;
    expect(R.viewFor(s, 1).mine!.guessesLeft).toBe(1);
    s = move(s, 1, { kind: 'guess', tile: wrong[1]!.id }).state;
    expect(R.viewFor(s, 1).mine).toMatchObject({ out: true, identity: { word: 'pisîk' } });
    expect(R.mayMove!(s, 1)).toBe(false);
    expect(R.finished(s)).toBe(false);
    s = move(s, 2, { kind: 'guess', tile: 'dog' }).state;
    expect(s.endedBy).toBe('all-done');
  });

  it('shares last place when nobody had it, so nobody is paid as a winner for it', () => {
    const s = R.timeout(race(3), [], T0 + 3 * 60_000);
    expect(R.places(s).map((p) => p.place)).toEqual([3, 3, 3]);
  });

  it('ends a race whose players have all left', () => {
    let s = race(2);
    s = R.drop(s, 1, T0 + 1_000);
    expect(R.finished(s)).toBe(false);
    s = R.drop(s, 2, T0 + 2_000);
    expect(R.finished(s)).toBe(true);
  });
});
