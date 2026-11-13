import { describe, expect, it } from 'vitest';
import {
  WHO_AM_I_FACTS,
  WHO_AM_I_MIN_QUESTIONS,
  WHO_AM_I_ROOM_GUESSES,
  WHO_AM_I_START_POINTS,
  answerFor,
  dealWhoAmI,
  isWhoAmIFact,
  sharedCategory,
  suggestWhoAmIQuestions,
  whoAmIPoints,
  type WhoAmIIdentity,
  type WhoAmITemplate,
} from './game.js';
import { roomAnswers, startCouchTable } from './couch.js';
import {
  WHO_AM_I_ANSWER_SECONDS,
  WHO_AM_I_ASK_SECONDS,
  WHO_AM_I_DECIDE_SECONDS,
  WHO_AM_I_HELP_POINTS,
  whoAmITableRules as R,
  type WhoAmITableState,
} from './rules.js';
import { FOREHEAD, deerSilhouetteSvg } from './silhouette.js';

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

/** A table of three: the cat on seat 1, the bird on seat 2, the horse on seat 3, each with tiles and questions of their own. */
function table(seats: readonly number[] = [1, 2, 3], minutes: 5 | 10 | 15 = 5): WhoAmITableState {
  const targets = [POOL[0]!, POOL[2]!, POOL[4]!];
  return R.init(
    {
      dialect: 'kmr',
      minutes,
      difficulty: 'beginner',
      deals: seats.map((seat, i) => ({ seat, deal: dealWhoAmI(targets[i]!, POOL, TEMPLATES, { seed: 's', salt: `seat:${seat}`, want: 4 })! })),
    },
    seats.map((seat) => ({ seat, team: null, bot: null })),
    { now: T0, seed: 'r' },
  );
}

function move(state: WhoAmITableState, seat: number, m: Parameters<typeof R.apply>[2], at = T0 + 1_000): WhoAmITableState {
  const r = R.apply(state, seat, m, at);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** The first question on a seat's own list, and what its card says to it. */
function firstQuestion(state: WhoAmITableState, seat: number): { id: string; truth: boolean } {
  const deal = state.seats.find((s) => s.seat === seat)!.deal!;
  const q = deal.questions[0]!;
  return { id: q.id, truth: answerFor(deal.identity, q.fact) };
}

describe('the table: who may read which card', () => {
  it('puts a player’s card in every view but their own', () => {
    const s = table();
    for (const viewer of [1, 2, 3]) {
      const view = R.viewFor(s, viewer);
      expect(view.mine!.identity).toBeNull();
      for (const seat of view.seats) {
        if (seat.seat === viewer) expect(seat.card).toBeNull();
        else expect(seat.card!.word).toBe(s.seats.find((x) => x.seat === seat.seat)!.deal!.identity.word);
      }
      // nothing in a player's own view carries their word outside their tiles, where it is one among others
      const own = s.seats.find((x) => x.seat === viewer)!.deal!.identity;
      const sent = JSON.stringify({ ...view, mine: { ...view.mine, tiles: [] } });
      expect(sent).not.toContain(own.word);
      // as a value of its own: "cat" is also the start of the word "category"
      expect(sent).not.toContain(`"${own.id}"`);
      expect(sent).not.toContain(`"en":"${own.meanings.en}"`);
    }
  });

  it('shows someone without a seat no card at all until the game is over', () => {
    const s = table();
    expect(R.viewFor(s, null).seats.every((x) => x.card === null)).toBe(true);
    expect(R.viewFor(s, null).mine).toBeNull();
    const over = R.timeout(s, [], s.endsAt);
    expect(R.viewFor(over, null).seats.every((x) => x.card !== null)).toBe(true);
    expect(R.viewFor(over, 1).mine!.identity!.word).toBe('pisîk');
    expect(R.viewFor(over, 1).reveal).toHaveLength(3);
  });

  it('takes a player’s own card off their forehead once they have it', () => {
    let s = table();
    s = move(s, 1, { kind: 'guess', tile: 'cat' });
    const view = R.viewFor(s, 1);
    expect(view.mine).toMatchObject({ solved: true, identity: { word: 'pisîk' } });
    expect(view.seats.find((x) => x.seat === 1)!.card!.word).toBe('pisîk');
  });

  it('keeps the cards from a player who has left the table', () => {
    const s = R.drop(table(), 3, T0 + 500);
    expect(R.viewFor(s, 3).seats.every((x) => x.card === null)).toBe(true);
  });
});

describe('the table: a turn', () => {
  it('waits for the player on turn, then for everyone else to answer, then for the player again', () => {
    let s = table();
    expect(s).toMatchObject({ turn: 1, phase: 'ask', turns: 1 });
    expect(R.waitingFor(s)).toEqual([1]);
    expect(R.dueAt(s)).toBe(T0 + WHO_AM_I_ASK_SECONDS * 1000);
    const q = firstQuestion(s, 1);
    s = move(s, 1, { kind: 'ask', question: q.id });
    expect(s.phase).toBe('answer');
    expect(R.waitingFor(s)).toEqual([2, 3]);
    expect(R.dueAt(s)).toBe(T0 + 1_000 + WHO_AM_I_ANSWER_SECONDS * 1000);
    s = move(s, 2, { kind: 'answer', yes: q.truth }, T0 + 2_000);
    expect(R.waitingFor(s)).toEqual([3]);
    s = move(s, 3, { kind: 'answer', yes: !q.truth }, T0 + 3_000);
    expect(s.phase).toBe('decide');
    expect(R.waitingFor(s)).toEqual([1]);
    expect(R.dueAt(s)).toBe(T0 + 3_000 + WHO_AM_I_DECIDE_SECONDS * 1000);
    s = move(s, 1, { kind: 'pass' }, T0 + 4_000);
    expect(s).toMatchObject({ turn: 2, phase: 'ask', turns: 2 });
  });

  it('lets the card decide: the asker is told the facts’ answer whatever the table said', () => {
    let s = table();
    const q = firstQuestion(s, 1);
    s = move(s, 1, { kind: 'ask', question: q.id });
    // both friends answer wrong
    s = move(s, 2, { kind: 'answer', yes: !q.truth });
    s = move(s, 3, { kind: 'answer', yes: !q.truth });
    const view = R.viewFor(s, 1);
    expect(view.mine!.asked).toEqual([{ question: q.id, answer: q.truth }]);
    expect(view.told).toMatchObject({ seat: 1, truth: q.truth, answers: [{ seat: 2, right: false }, { seat: 3, right: false }] });
    expect(view.seats.find((x) => x.seat === 2)!.helped).toBe(0);
  });

  it('scores a point for every right answer about somebody else’s card', () => {
    let s = table();
    const q = firstQuestion(s, 1);
    s = move(s, 1, { kind: 'ask', question: q.id });
    s = move(s, 2, { kind: 'answer', yes: q.truth });
    s = move(s, 3, { kind: 'answer', yes: !q.truth });
    const view = R.viewFor(s, null);
    expect(view.seats.find((x) => x.seat === 2)).toMatchObject({ helped: 1, points: WHO_AM_I_HELP_POINTS });
    expect(view.seats.find((x) => x.seat === 3)).toMatchObject({ helped: 0, points: 0 });
  });

  it('says who has answered and never what, until everyone has', () => {
    let s = table();
    const q = firstQuestion(s, 1);
    s = move(s, 1, { kind: 'ask', question: q.id });
    s = move(s, 2, { kind: 'answer', yes: q.truth });
    const asker = R.viewFor(s, 1);
    expect(asker.pending).toMatchObject({ seat: 1, answered: [2], waiting: [3], mine: null });
    expect(asker.told).toBeNull();
    expect(asker.mine!.asked).toEqual([]);
    // the one still to answer sees that seat 2 has, and not which way
    expect(R.viewFor(s, 3).pending).toMatchObject({ answered: [2], mine: null });
    expect(R.viewFor(s, 2).pending!.mine).toBe(q.truth);
    expect(JSON.stringify(R.viewFor(s, 3).pending)).not.toContain('"yes"');
  });

  it('refuses a move out of turn, an answer to one’s own question, a second answer and a question asked twice', () => {
    let s = table();
    const q = firstQuestion(s, 1);
    expect(R.apply(s, 2, { kind: 'ask', question: firstQuestion(s, 2).id }, T0)).toEqual({ ok: false, reason: 'not-your-turn' });
    expect(R.apply(s, 2, { kind: 'guess', tile: 'bird' }, T0)).toEqual({ ok: false, reason: 'not-your-turn' });
    expect(R.apply(s, 2, { kind: 'answer', yes: true }, T0)).toEqual({ ok: false, reason: 'nothing-asked' });
    expect(R.apply(s, 1, { kind: 'ask', question: 'not-on-the-list' }, T0)).toEqual({ ok: false, reason: 'no-such-question' });
    s = move(s, 1, { kind: 'ask', question: q.id });
    expect(R.apply(s, 1, { kind: 'answer', yes: true }, T0)).toEqual({ ok: false, reason: 'own-question' });
    expect(R.apply(s, 1, { kind: 'guess', tile: 'cat' }, T0)).toEqual({ ok: false, reason: 'being-answered' });
    s = move(s, 2, { kind: 'answer', yes: true });
    expect(R.apply(s, 2, { kind: 'answer', yes: false }, T0)).toEqual({ ok: false, reason: 'answered' });
    s = move(s, 3, { kind: 'answer', yes: true });
    // one question a turn
    expect(R.apply(s, 1, { kind: 'ask', question: s.seats[0]!.deal!.questions[1]!.id }, T0)).toEqual({ ok: false, reason: 'asked-this-turn' });
    s = move(s, 1, { kind: 'pass' });
    s = move(s, 2, { kind: 'pass' });
    s = move(s, 3, { kind: 'pass' });
    expect(R.apply(s, 1, { kind: 'ask', question: q.id }, T0)).toEqual({ ok: false, reason: 'asked' });
  });

  it('passes over those who do not answer in time: the card does not wait for them', () => {
    let s = table();
    const q = firstQuestion(s, 1);
    s = move(s, 1, { kind: 'ask', question: q.id });
    s = move(s, 2, { kind: 'answer', yes: q.truth });
    s = R.timeout(s, [3], T0 + 30_000);
    expect(s.phase).toBe('decide');
    expect(R.viewFor(s, 1).told!.answers).toEqual([
      { seat: 2, yes: q.truth, right: true },
      { seat: 3, yes: null, right: false },
    ]);
    expect(R.viewFor(s, 1).mine!.asked).toEqual([{ question: q.id, answer: q.truth }]);
  });

  it('passes the turn on when its player lets it run out', () => {
    const s = R.timeout(table(), [1], T0 + 60_000);
    expect(s).toMatchObject({ turn: 2, phase: 'ask' });
    expect(R.viewFor(s, 1).mine).toMatchObject({ out: false, solved: false });
  });
});

describe('the table: guessing', () => {
  it('scores fewer questions higher, and gives the turn on after a guess', () => {
    let s = table();
    s = move(s, 1, { kind: 'guess', tile: 'cat' });
    expect(s.turn).toBe(2);
    expect(R.viewFor(s, 1).mine!.points).toBe(WHO_AM_I_START_POINTS);
    const q = firstQuestion(s, 2);
    s = move(s, 2, { kind: 'ask', question: q.id });
    s = move(s, 1, { kind: 'answer', yes: q.truth });
    s = move(s, 3, { kind: 'answer', yes: q.truth });
    s = move(s, 2, { kind: 'guess', tile: 'bird' });
    expect(R.viewFor(s, 2).mine!.points).toBe(WHO_AM_I_START_POINTS - 1);
    // the player who has their card still answers for the others, and is not given another turn
    expect(s.turn).toBe(3);
    expect(R.viewFor(s, 1).seats.find((x) => x.seat === 1)).toMatchObject({ solved: true, helped: 1 });
  });

  it('puts a player out after two wrong guesses, and ends when nobody is left guessing', () => {
    let s = table([1, 2]);
    const wrongTiles = s.seats[0]!.deal!.candidates.filter((c) => c.id !== 'cat').map((c) => c.id);
    s = move(s, 1, { kind: 'guess', tile: wrongTiles[0]! });
    expect(R.viewFor(s, 1).mine).toMatchObject({ out: false, guessesLeft: 1 });
    expect(R.apply(s, 1, { kind: 'guess', tile: wrongTiles[1]! }, T0)).toEqual({ ok: false, reason: 'not-your-turn' });
    s = move(s, 2, { kind: 'pass' });
    expect(R.apply(s, 1, { kind: 'guess', tile: wrongTiles[0]! }, T0)).toEqual({ ok: false, reason: 'guessed' });
    s = move(s, 1, { kind: 'guess', tile: wrongTiles[1]! });
    expect(R.viewFor(s, 1).mine).toMatchObject({ out: true, identity: { word: 'pisîk' } });
    expect(R.finished(s)).toBe(false);
    s = move(s, 2, { kind: 'guess', tile: 'bird' });
    expect(s).toMatchObject({ endedBy: 'all-done', turn: null });
    expect(R.places(s)).toEqual([
      { seat: 2, place: 1, score: WHO_AM_I_START_POINTS },
      { seat: 1, place: 2, score: 0 },
    ]);
  });

  it('makes the turn a guess once every question has been asked, and puts out a player who lets that turn run out', () => {
    let s = table([1, 2], 15);
    const mine = s.seats[0]!.deal!.questions;
    let at = T0;
    for (const q of mine) {
      s = move(s, 1, { kind: 'ask', question: q.id }, (at += 1_000));
      s = move(s, 2, { kind: 'answer', yes: true }, (at += 1_000));
      if (q !== mine[mine.length - 1]) {
        s = move(s, 1, { kind: 'pass' }, (at += 1_000));
        s = move(s, 2, { kind: 'pass' }, (at += 1_000));
      }
    }
    expect(R.viewFor(s, 1).mine!.mustGuess).toBe(true);
    expect(R.apply(s, 1, { kind: 'pass' }, at)).toEqual({ ok: false, reason: 'must-guess' });
    s = R.timeout(s, [1], at + 40_000);
    expect(R.viewFor(s, 1).mine!.out).toBe(true);
    expect(s.turn).toBe(2);
  });
});

describe('the table: its end', () => {
  it('ends when its time is up, whatever it was waiting for', () => {
    const s = table();
    expect(R.dueAt(R.timeout(s, [1], T0 + 10_000))).toBeLessThanOrEqual(s.endsAt);
    const over = R.timeout(s, [1], s.endsAt);
    expect(over).toMatchObject({ endedBy: 'time', turn: null });
    expect(R.dueAt(over)).toBeNull();
    expect(R.waitingFor(over)).toEqual([]);
  });

  it('goes on without a player who leaves, and ends when fewer than two are left', () => {
    let s = table();
    s = R.drop(s, 1, T0 + 500);
    expect(s).toMatchObject({ turn: 2, phase: 'ask' });
    const q = firstQuestion(s, 2);
    s = move(s, 2, { kind: 'ask', question: q.id });
    expect(R.waitingFor(s)).toEqual([3]);
    s = R.drop(s, 3, T0 + 2_000);
    expect(s).toMatchObject({ endedBy: 'too-few', turn: null });
  });

  it('lets the card answer when the one the question was waiting on has gone', () => {
    let s = table();
    const q = firstQuestion(s, 1);
    s = move(s, 1, { kind: 'ask', question: q.id });
    s = move(s, 2, { kind: 'answer', yes: q.truth });
    s = R.drop(s, 3, T0 + 2_000);
    expect(s.phase).toBe('decide');
    expect(R.viewFor(s, 1).mine!.asked).toEqual([{ question: q.id, answer: q.truth }]);
  });

  it('places by points, whoever left last, and nobody first at a table where nobody scored', () => {
    let s = table();
    s = move(s, 1, { kind: 'guess', tile: 'cat' }, T0 + 1_000);
    s = move(s, 2, { kind: 'guess', tile: 'bird' }, T0 + 2_000);
    s = R.drop(s, 3, T0 + 3_000);
    expect(s.endedBy).toBe('all-done');
    expect(R.places(s)).toEqual([
      { seat: 1, place: 1, score: WHO_AM_I_START_POINTS },
      { seat: 2, place: 2, score: WHO_AM_I_START_POINTS },
      { seat: 3, place: 3, score: 0 },
    ]);
    // a table where nobody scored has no winner: everyone shares last place
    const nobody = R.timeout(table(), [1], table().endsAt);
    expect(R.places(nobody).map((p) => p.place)).toEqual([3, 3, 3]);
  });

  it('counts only a game two seats took part in, and never one called off', () => {
    const s = table([1, 2]);
    expect(R.counted!(R.end(s, T0 + 1_000))).toBe(false);
    // a seat that never moved has not played anyone
    const alone = move(s, 1, { kind: 'guess', tile: 'cat' });
    expect(R.counted!(R.timeout(alone, [2], alone.endsAt))).toBe(false);
    const q = firstQuestion(s, 1);
    let both = move(s, 1, { kind: 'ask', question: q.id });
    both = move(both, 2, { kind: 'answer', yes: q.truth });
    expect(R.counted!(R.timeout(both, [1], both.endsAt))).toBe(true);
    const seats2 = [1, 2].map((seat) => ({ seat, team: null, bot: null }));
    const undealt = R.init({ dialect: 'kmr', minutes: 5, difficulty: 'beginner' }, seats2, { now: T0, seed: 'g' });
    expect(undealt.endedBy).toBe('too-few');
    expect(R.counted!(undealt)).toBe(false);
  });
});

describe('the table on one phone', () => {
  const dealt = () => ({
    dialect: 'kmr' as const,
    difficulty: 'beginner' as const,
    deals: [POOL[0]!, POOL[2]!, POOL[4]!].map((target, i) => dealWhoAmI(target, POOL, TEMPLATES, { seed: 's', salt: `seat:${i}`, want: 4 })!),
  });

  it('seats the room in the order it was dealt, the first player on turn', () => {
    const s = startCouchTable(dealt(), T0, 'couch');
    expect(s.seats.map((x) => x.seat)).toEqual([0, 1, 2]);
    expect(s).toMatchObject({ turn: 0, phase: 'ask' });
    expect(R.viewFor(s, 1).seats[0]!.card!.word).toBe('pisîk');
    expect(R.viewFor(s, 0).seats[0]!.card).toBeNull();
  });

  it('takes the room’s one spoken answer for everyone, and the card still says which it is', () => {
    let s = startCouchTable(dealt(), T0, 'couch');
    const q = firstQuestion(s, 0);
    expect(roomAnswers(s, true, T0)).toBe(s);
    s = move(s, 0, { kind: 'ask', question: q.id });
    s = roomAnswers(s, !q.truth, T0 + 2_000);
    expect(s.phase).toBe('decide');
    expect(R.viewFor(s, 0).told).toMatchObject({ truth: q.truth, answers: [{ seat: 1, right: false }, { seat: 2, right: false }] });
    expect(R.viewFor(s, 0).mine!.asked).toEqual([{ question: q.id, answer: q.truth }]);
  });

  it('lets a player ask the room a question of their own: counted, and never answered by the card', () => {
    let s = startCouchTable(dealt(), T0, 'couch');
    expect(R.viewFor(s, 0).open).toBe(true);
    s = move(s, 0, { kind: 'aloud' });
    // the turn goes on to a guess or a pass, with no answer of the card's on the table
    expect(s).toMatchObject({ turn: 0, phase: 'decide', told: null });
    const mine = R.viewFor(s, 0).mine!;
    expect(mine).toMatchObject({ aloud: 1, asked: [] });
    expect(R.viewFor(s, 1).seats[0]!.asked).toBe(1);
    // one question to a turn, whoever answers it
    expect(R.apply(s, 0, { kind: 'aloud' }, T0)).toEqual({ ok: false, reason: 'asked-this-turn' });
    expect(R.apply(s, 0, { kind: 'ask', question: firstQuestion(s, 0).id }, T0)).toEqual({ ok: false, reason: 'asked-this-turn' });
    // and it costs what a question costs
    const deal = s.seats[0]!.deal!;
    s = move(s, 0, { kind: 'guess', tile: deal.identity.id });
    expect(R.viewFor(s, 0).mine!.points).toBe(whoAmIPoints(1, 0, true));
  });

  it('clears the last answer of the card when the next question is the player’s own', () => {
    let s = startCouchTable(dealt(), T0, 'couch');
    s = move(s, 0, { kind: 'ask', question: firstQuestion(s, 0).id });
    s = roomAnswers(s, true, T0);
    s = move(s, 0, { kind: 'pass' });
    s = move(s, 1, { kind: 'aloud' });
    expect(s.told).toBeNull();
  });
});

describe('a question of one’s own, away from one room', () => {
  it('is refused at a table the server runs', () => {
    const s = table();
    expect(R.viewFor(s, 1).open).toBe(false);
    expect(R.apply(s, 1, { kind: 'aloud' }, T0)).toEqual({ ok: false, reason: 'not-here' });
  });

  it('leaves the judging to the server there too: a guess said out loud is refused, and the tiles are dealt', () => {
    const s = table();
    expect(R.apply(s, 1, { kind: 'said', right: true }, T0)).toEqual({ ok: false, reason: 'not-here' });
    expect(R.viewFor(s, 1).mine!.tiles.length).toBeGreaterThan(0);
  });
});

describe('guessing in one room', () => {
  const dealt = () => ({
    dialect: 'kmr' as const,
    difficulty: 'beginner' as const,
    deals: [POOL[0]!, POOL[2]!].map((target, i) => dealWhoAmI(target, POOL, TEMPLATES, { seed: 's', salt: `seat:${i}`, want: 4 })!),
  });

  it('shows nothing to pick from: who a player is, is said out loud', () => {
    const s = startCouchTable(dealt(), T0, 'couch');
    expect(R.viewFor(s, 0).mine).toMatchObject({ tiles: [], guessesLeft: WHO_AM_I_ROOM_GUESSES, identity: null });
  });

  it('takes the room’s word that the player said it: the card comes off and is scored like any guess', () => {
    let s = startCouchTable(dealt(), T0, 'couch');
    s = move(s, 0, { kind: 'aloud' });
    s = move(s, 0, { kind: 'said', right: true });
    const mine = R.viewFor(s, 0).mine!;
    expect(mine).toMatchObject({ solved: true, points: whoAmIPoints(1, 0, true) });
    expect(mine.identity!.word).toBe('pisîk');
    expect(s.turn).toBe(1);
  });

  it('allows one more miss than at a table with tiles, then the player is out', () => {
    let s = startCouchTable(dealt(), T0, 'couch');
    for (let miss = 1; miss < WHO_AM_I_ROOM_GUESSES; miss++) {
      s = move(s, 0, { kind: 'said', right: false });
      expect(R.viewFor(s, 0).mine).toMatchObject({ out: false, guessesLeft: WHO_AM_I_ROOM_GUESSES - miss });
      s = move(s, 1, { kind: 'pass' });
    }
    s = move(s, 0, { kind: 'said', right: false });
    expect(R.viewFor(s, 0).mine).toMatchObject({ out: true, guessesLeft: 0 });
    // a right guess after misses costs what the misses cost
    s = move(s, 1, { kind: 'said', right: false });
    s = move(s, 1, { kind: 'said', right: true });
    expect(R.viewFor(s, 1).mine!.points).toBe(whoAmIPoints(0, 1, true));
    expect(R.finished(s)).toBe(true);
  });

  it('never forces a guess: with the list asked through, a question of one’s own or a pass still goes', () => {
    let s = startCouchTable(dealt(), T0, 'couch');
    const all = s.seats[0]!.deal!.questions;
    for (const q of all) {
      s = move(s, 0, { kind: 'ask', question: q.id });
      s = roomAnswers(s, true, T0);
      s = move(s, 0, { kind: 'pass' });
      s = move(s, 1, { kind: 'pass' });
    }
    expect(R.viewFor(s, 0).mine).toMatchObject({ mustGuess: false, suggested: [] });
    s = move(s, 0, { kind: 'aloud' });
    s = move(s, 0, { kind: 'pass' });
    expect(s.turn).toBe(1);
  });

  it('does not take a guess while the room is still answering a question', () => {
    let s = startCouchTable(dealt(), T0, 'couch');
    s = move(s, 0, { kind: 'ask', question: firstQuestion(s, 0).id });
    expect(R.apply(s, 0, { kind: 'said', right: true }, T0)).toEqual({ ok: false, reason: 'being-answered' });
    expect(R.apply(s, 1, { kind: 'said', right: true }, T0)).toEqual({ ok: false, reason: 'not-your-turn' });
  });
});

describe('the questions suggested next', () => {
  const Q = (facts: string[]): Array<{ id: string; fact: string }> => facts.map((fact) => ({ id: `q:${fact}`, fact }));
  const all = Q(['can-fly', 'sweet', 'alive', 'works-outdoors', 'animal', 'place', 'four-legs', 'uses-electricity', 'edible', 'person']);

  it('begins with the wide questions, whatever order the list is in', () => {
    expect(suggestWhoAmIQuestions(all, [], null)).toEqual(['q:alive', 'q:animal', 'q:person']);
    expect(suggestWhoAmIQuestions(all, [], null, 5)).toEqual(['q:alive', 'q:animal', 'q:person', 'q:edible', 'q:place']);
  });

  it('follows a yes: an animal is asked about legs and wings, not whether it is a place', () => {
    const asked = [{ question: 'q:animal', answer: true }];
    expect(suggestWhoAmIQuestions(all, asked, null)).toEqual(['q:edible', 'q:can-fly', 'q:four-legs']);
  });

  it('follows a no: what is beside the point comes after everything else, and what is already known never', () => {
    const asked = [{ question: 'q:alive', answer: false }];
    // not alive: not an animal and not a person either, so neither is asked; whether it flies is asked last
    expect(suggestWhoAmIQuestions(all, asked, null, 10)).toEqual(['q:edible', 'q:place', 'q:sweet', 'q:uses-electricity', 'q:can-fly', 'q:four-legs', 'q:works-outdoors']);
  });

  it('never suggests a question that was asked, and is empty when every answer left is known', () => {
    const asked = all.map((q) => ({ question: q.id, answer: false }));
    expect(suggestWhoAmIQuestions(all, asked, null)).toEqual([]);
    // a place is not alive, not an animal and not a person: there is nothing left to learn from this list
    expect(suggestWhoAmIQuestions(Q(['place', 'animal', 'person', 'alive']), [{ question: 'q:place', answer: true }], null)).toEqual([]);
  });

  it('skips what the kind on the card already says', () => {
    expect(suggestWhoAmIQuestions(all, [], 'animal')).toEqual(['q:edible', 'q:can-fly', 'q:four-legs']);
    expect(suggestWhoAmIQuestions(all, [], 'food')).toEqual(['q:alive', 'q:sweet', 'q:can-fly']);
  });

  it('is on every player’s view while they are still guessing, and reads nothing but their own answers', () => {
    let s = table();
    const mine = R.viewFor(s, 1).mine!;
    expect(mine.suggested.length).toBeGreaterThan(0);
    expect(mine.suggested.every((id) => mine.questions.some((q) => q.id === id))).toBe(true);
    // two players dealt the same list and the same answers are suggested the same: the hidden card is not read
    const deal = s.seats[0]!.deal!;
    const twin = { ...deal.identity, id: 'twin', facts: Object.fromEntries(Object.keys(deal.identity.facts).map((k) => [k, !deal.identity.facts[k]])) };
    expect(suggestWhoAmIQuestions(deal.questions, [], sharedCategory(twin.category, deal.candidates))).toEqual(mine.suggested);
    // once the card is found there is nothing left to suggest
    s = move(s, 1, { kind: 'guess', tile: deal.identity.id });
    expect(R.viewFor(s, 1).mine!.suggested).toEqual([]);
  });
});

describe('the stage', () => {
  it('draws Hevalo as a flat one-colour silhouette, with no gradient, clip or second colour', () => {
    const svg = deerSilhouetteSvg('#3d5a4a', 200, 'Hidden word');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('Hidden word');
    expect(svg).not.toMatch(/url\(#|<defs>|clip-path|Gradient/);
    const colours = new Set([...svg.matchAll(/ (?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]).filter((c) => c !== 'none'));
    expect([...colours]).toEqual(['#3d5a4a']);
  });

  it('refuses a colour that is not one, and puts the card inside the picture', () => {
    expect(deerSilhouetteSvg('red" onload="x', 100)).not.toContain('onload');
    expect(FOREHEAD.x).toBeGreaterThan(0);
    expect(FOREHEAD.y + 0.1).toBeLessThan(1);
  });
});

describe('the kind of thing a hidden identity is', () => {
  it('is named only when every tile is that kind, so it never singles the identity out', () => {
    expect(sharedCategory('animal', [{ category: 'animal' }, { category: 'animal' }])).toBe('animal');
    expect(sharedCategory('animal', [{ category: 'animal' }, { category: 'object' }])).toBeNull();
    // tiles dealt before they carried their kind
    expect(sharedCategory('animal', [{}, { category: 'animal' }])).toBeNull();
  });

  it('is shared by the tiles whenever the pool has enough of the kind', () => {
    // the cup shares the facts it has with every animal: it is still dealt after the animals
    const cupLike = { ...POOL[6]!, facts: { ...POOL[0]!.facts, alive: false, animal: false } };
    // four animals can be told apart by asking (the dog answers as the cat does, the cow as the horse): four tiles are all animals
    const deal = dealWhoAmI(POOL[0]!, [...POOL.slice(0, 6), cupLike], TEMPLATES, { seed: 's', salt: '0', want: 4 })!;
    expect(deal.candidates.every((c) => c.category === 'animal')).toBe(true);
    expect(sharedCategory(POOL[0]!.category, deal.candidates)).toBe('animal');
  });
});

describe('tiles a question can tell apart', () => {
  const answersOf = (id: string): string => {
    const identity = POOL.find((p) => p.id === id)!;
    return Object.keys(POOL[0]!.facts).sort().map((k) => String(identity.facts[k])).join(',');
  };

  it('never deals two tiles that answer every question alike', () => {
    for (const target of POOL.slice(0, 6)) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const deal = dealWhoAmI(target, POOL, TEMPLATES, { seed, salt: '0', want: 8 })!;
        const answers = deal.candidates.map((c) => answersOf(c.id));
        expect(new Set(answers).size).toBe(answers.length);
        expect(deal.candidates.some((c) => c.id === target.id)).toBe(true);
      }
    }
  });

  it('leaves out the dog when the cat is hidden: nothing asked would tell them apart', () => {
    const deal = dealWhoAmI(POOL[0]!, POOL, TEMPLATES, { seed: 's', salt: '0', want: 8 })!;
    expect(deal.candidates.map((c) => c.id)).not.toContain('dog');
  });

  it('is left off the card when the tiles are of several kinds', () => {
    const deal = dealWhoAmI(POOL[0]!, POOL, TEMPLATES, { seed: 's', salt: '0', want: 4 })!;
    const mixed = { ...deal, candidates: [...deal.candidates.slice(0, 3), { id: 'cup', word: 'kasik', meanings: { en: 'cup' }, category: 'object' }] };
    const s = R.init({ dialect: 'kmr', minutes: 5, difficulty: 'beginner', deals: [{ seat: 1, deal: mixed }, { seat: 2, deal }] }, [1, 2].map((seat) => ({ seat, team: null, bot: null })), {
      now: T0,
      seed: 'g',
    });
    expect(R.viewFor(s, 1).mine!.category).toBeNull();
    expect(R.viewFor(s, 2).mine!.category).toBe('animal');
  });
});
