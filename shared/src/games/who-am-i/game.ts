/**
 * Who Am I?: a player has a hidden identity — an animal, a thing, a job, a
 * food or a place, each a word from published lessons — on a card the others
 * can read, and finds out what it is by asking yes/no questions from an
 * approved list, then guessing from a few tiles. What the card says to a
 * question comes from the identity's facts table, never from anyone typing:
 * "Does it fly?" asks the fact `can-fly`, and the identity's row says yes or
 * no. Fewer questions score more.
 *
 * This module is what the game's rules (rules.ts) are played with, pure:
 *   - the facts an identity may have, and what each one means (the admin's
 *     facts table is these, and a question template asks exactly one of them);
 *   - how a hidden identity is dealt: the candidates shown as tiles (the
 *     identity among others that share most of its facts), and the questions
 *     offered — only those every candidate has an answer to, so the list
 *     itself never gives the identity away;
 *   - the points a solved identity is worth;
 *   - which questions to suggest next, for a learner who does not know where
 *     to begin (`suggestWhoAmIQuestions`);
 *   - the shapes a round travels in.
 *
 * The Kurdish here is none: the identities' words and the questions are
 * approved `game_content` rows, and the answers are the dialect's own yes and
 * no from each app's catalogue.
 */
import { seededUnit } from '../last-letter/rules.js';
import type { GameDifficulty } from '../solo.js';
import type { Meanings } from '../content.js';

/** What an identity can be. */
export const WHO_AM_I_CATEGORIES = ['animal', 'object', 'profession', 'food', 'place'] as const;
export type WhoAmICategory = (typeof WHO_AM_I_CATEGORIES)[number];

export function isWhoAmICategory(v: unknown): v is WhoAmICategory {
  return (WHO_AM_I_CATEGORIES as readonly unknown[]).includes(v);
}

/**
 * The facts an identity's table can say yes or no to, each with what it
 * means in English for the people who fill the table in. A question template
 * asks one of them.
 */
export const WHO_AM_I_FACTS = [
  { key: 'alive', en: 'It is alive' },
  { key: 'animal', en: 'It is an animal' },
  { key: 'person', en: 'It is a person (someone who does this job)' },
  { key: 'edible', en: 'People eat it' },
  { key: 'place', en: 'It is a place' },
  { key: 'can-fly', en: 'It can fly' },
  { key: 'lives-in-water', en: 'It lives in water' },
  { key: 'four-legs', en: 'It walks on four legs' },
  { key: 'bigger-than-person', en: 'It is bigger than a person' },
  { key: 'at-home', en: 'You find it at home' },
  { key: 'sweet', en: 'It tastes sweet' },
  { key: 'uses-electricity', en: 'It runs on electricity' },
  { key: 'helps-sick', en: 'It helps sick people' },
  { key: 'works-outdoors', en: 'It works outdoors' },
] as const;
export type WhoAmIFact = (typeof WHO_AM_I_FACTS)[number]['key'];

export function isWhoAmIFact(v: unknown): v is WhoAmIFact {
  return WHO_AM_I_FACTS.some((f) => f.key === v);
}

/** Wrong guesses at an identity before its player is out. */
export const WHO_AM_I_GUESSES = 2;
/** Tiles to guess from, by difficulty; beginners also see what each tile means. */
export const WHO_AM_I_CANDIDATES: Readonly<Record<GameDifficulty, number>> = { beginner: 4, intermediate: 6, advanced: 8 };
/** The fewest tiles a deal may fall back to when too few identities share enough facts. */
export const WHO_AM_I_MIN_CANDIDATES = 3;
/** Questions an identity needs on offer to be worth dealing, and the most offered at once. */
export const WHO_AM_I_MIN_QUESTIONS = 4;
export const WHO_AM_I_MAX_QUESTIONS = 12;
/** Approved question templates a dialect needs before the game is offered in it. */
export const WHO_AM_I_MIN_TEMPLATES = 12;

/** What a solved identity starts at; each question and each wrong guess costs some. */
export const WHO_AM_I_START_POINTS = 10;
export const WHO_AM_I_QUESTION_COST = 1;
export const WHO_AM_I_WRONG_GUESS_COST = 3;

/** Points for one identity: fewer questions score more; a solved one is worth at least 1, an unsolved one nothing. */
export function whoAmIPoints(questions: number, wrongGuesses: number, solved: boolean): number {
  if (!solved) return 0;
  return Math.max(1, WHO_AM_I_START_POINTS - questions * WHO_AM_I_QUESTION_COST - wrongGuesses * WHO_AM_I_WRONG_GUESS_COST);
}

/** An approved identity, as a deal reads it. */
export interface WhoAmIIdentity {
  id: string;
  /** stable for the identity's word, for `game_seen` */
  key: string;
  level: number;
  word: string;
  meanings: Meanings;
  category: string;
  facts: Readonly<Record<string, boolean>>;
}

/** An approved question template, as a deal reads it. */
export interface WhoAmITemplate {
  id: string;
  ku: string;
  meanings: Meanings;
  fact: string;
}

/** A hidden identity, dealt: the server keeps all of it, and sends its player `candidates` and `questions` only. */
export interface WhoAmIDeal {
  identity: WhoAmIIdentity;
  /** the tiles, shuffled; the identity is one of them (a deal made before tiles carried their category has none) */
  candidates: Array<{ id: string; word: string; meanings: Meanings; category?: string }>;
  /** the questions offered: each fact asked once, every candidate with an answer to it */
  questions: Array<{ id: string; ku: string; meanings: Meanings; fact: string }>;
}

/** A number from 0 to 1 for a label: the same number for the same label, and nothing a label's number says about another's. */
export type DealUnit = (label: string) => number;

function draw<T>(unit: DealUnit, salt: string, items: readonly T[], keyOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, k: unit(`${salt}:${keyOf(item)}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}

/** The facts every one of these identities has an answer to. */
function sharedFacts(ids: readonly WhoAmIIdentity[]): Set<string> {
  const [first, ...rest] = ids;
  if (!first) return new Set();
  return new Set(Object.keys(first.facts).filter((k) => rest.every((r) => typeof r.facts[k] === 'boolean')));
}

/**
 * Keeps, of a list of identities, those no question could confuse with the
 * hidden one or with one kept before: each answers the hidden identity's
 * facts in a way of its own. A cat and a dog that say yes and no to all the
 * same questions cannot be told apart by asking, and a round that deals both
 * is a coin toss; only the first of such a pair is dealt.
 */
function tellsApart(target: WhoAmIIdentity): (p: WhoAmIIdentity) => boolean {
  const keys = Object.keys(target.facts).sort();
  const answers = (p: WhoAmIIdentity): string => keys.map((k) => (p.facts[k] === true ? 'y' : p.facts[k] === false ? 'n' : '-')).join('');
  const taken = new Set([answers(target)]);
  return (p) => {
    const a = answers(p);
    if (taken.has(a)) return false;
    taken.add(a);
    return true;
  };
}

/**
 * Deal one hidden identity: up to `want` tiles (the identity, and the others
 * that share most of its facts, none answering every question as another
 * does), and the questions every tile can answer — those that tell the tiles
 * apart first. Fewer tiles are dealt when that is
 * what it takes to have WHO_AM_I_MIN_QUESTIONS questions; null when even
 * WHO_AM_I_MIN_CANDIDATES cannot. Everything is drawn from the seed (through
 * `unit`, where the caller gives one): the same deal on every replica, and a
 * round read again is the round it was.
 */
export function dealWhoAmI(
  target: WhoAmIIdentity,
  pool: readonly WhoAmIIdentity[],
  templates: readonly WhoAmITemplate[],
  opts: { seed: string; salt: string; want: number; unit?: DealUnit },
): WhoAmIDeal | null {
  // The server deals with a draw keyed by a secret of its own (`unit`). The seed's plain hash is only for a caller
  // that has no secret to keep (a test, a preview): its numbers can be worked back from the order of what it deals,
  // and with them the hidden identity.
  const unit: DealUnit = opts.unit ?? ((label) => seededUnit(opts.seed, label));
  const others = draw(
    unit,
    `${opts.salt}:others`,
    pool.filter((p) => p.id !== target.id && p.word !== target.word),
    (p) => p.id,
  )
    .map((p) => ({ p, same: p.category === target.category, shared: Object.keys(target.facts).filter((k) => typeof p.facts[k] === 'boolean').length }))
    // the identity's own kind first, so the kind the card names tells the tiles nothing apart
    .sort((a, b) => Number(b.same) - Number(a.same) || b.shared - a.shared)
    .map((x) => x.p)
    .filter(tellsApart(target));
  const byFact = new Map<string, WhoAmITemplate>();
  for (const t of draw(unit, `${opts.salt}:templates`, templates, (t) => t.id)) if (!byFact.has(t.fact)) byFact.set(t.fact, t);

  for (let n = Math.max(WHO_AM_I_MIN_CANDIDATES, opts.want); n >= WHO_AM_I_MIN_CANDIDATES; n--) {
    const tiles = [target, ...others.slice(0, n - 1)];
    if (tiles.length < WHO_AM_I_MIN_CANDIDATES) return null;
    const facts = sharedFacts(tiles);
    const asked = [...byFact.values()].filter((t) => facts.has(t.fact));
    if (asked.length < WHO_AM_I_MIN_QUESTIONS) continue;
    // a question whose answer is the same for every tile tells nothing: those go last
    const splits = (t: WhoAmITemplate) => {
      const yes = tiles.filter((x) => x.facts[t.fact] === true).length;
      return Math.min(yes, tiles.length - yes);
    };
    const questions = [...asked].sort((a, b) => splits(b) - splits(a)).slice(0, WHO_AM_I_MAX_QUESTIONS);
    return {
      identity: target,
      candidates: draw(unit, `${opts.salt}:tiles`, tiles, (x) => x.id).map((x) => ({ id: x.id, word: x.word, meanings: x.meanings, category: x.category })),
      // the list is drawn again, so its order says nothing about which questions split the tiles
      questions: draw(unit, `${opts.salt}:asked`, questions, (q) => q.id).map((q) => ({ id: q.id, ku: q.ku, meanings: q.meanings, fact: q.fact })),
    };
  }
  return null;
}

/**
 * The kind of thing a hidden identity is, as its card may name it: only when
 * every tile is of that kind. Among tiles of several kinds the kind would
 * single the identity out, so the card names none.
 */
export function sharedCategory(category: string, tiles: ReadonlyArray<{ category?: string }>): string | null {
  return tiles.length > 0 && tiles.every((t) => t.category === category) ? category : null;
}

/** The answer to a question about an identity: yes or no, from its facts. */
export function answerFor(identity: Pick<WhoAmIIdentity, 'facts'>, fact: string): boolean {
  return identity.facts[fact] === true;
}

// ---------- questions worth asking next ----------

/**
 * What an answer settles besides itself: an animal is alive and is neither a
 * person nor a place, and so on. Only ever used to choose which questions to
 * suggest; what a card says to a question is its facts table's alone.
 */
const SETTLES: Partial<Record<WhoAmIFact, { yes?: Partial<Record<WhoAmIFact, boolean>>; no?: Partial<Record<WhoAmIFact, boolean>> }>> = {
  animal: { yes: { alive: true, person: false, place: false } },
  person: { yes: { alive: true, animal: false, place: false, edible: false } },
  place: { yes: { alive: false, animal: false, person: false, edible: false } },
  edible: { yes: { person: false, place: false } },
  alive: { no: { animal: false, person: false } },
};

/** What the kind of thing on the card settles, when the card names its kind. */
const KIND_SETTLES: Record<WhoAmICategory, Partial<Record<WhoAmIFact, boolean>>> = {
  animal: { alive: true, animal: true, person: false, place: false },
  object: { alive: false, animal: false, person: false, place: false, edible: false },
  profession: { alive: true, person: true, animal: false, place: false, edible: false },
  food: { edible: true, animal: false, person: false, place: false },
  place: { place: true, alive: false, animal: false, person: false, edible: false },
};

/** Questions that are about one kind of thing: not worth asking once that kind is ruled out. */
const ASKED_OF: Partial<Record<WhoAmIFact, ReadonlyArray<readonly [WhoAmIFact, boolean]>>> = {
  'can-fly': [['animal', false], ['alive', false]],
  'lives-in-water': [['animal', false], ['alive', false]],
  'four-legs': [['animal', false], ['alive', false]],
  sweet: [['edible', false]],
  'works-outdoors': [['person', false]],
  'uses-electricity': [['alive', true], ['edible', true], ['place', true]],
  'helps-sick': [['animal', true], ['edible', true]],
  'at-home': [['person', true], ['place', true]],
  'bigger-than-person': [['person', true]],
};

/** How many questions are suggested at once: few enough to read at a glance. */
export const WHO_AM_I_SUGGESTIONS = 3;

/**
 * The questions to suggest next, best first: the ones a player would ask if
 * they knew the game. The wide ones come before the narrow ones ("Is it
 * alive?" before "Does it fly?"), a question whose answer follows from what
 * has been answered already is left out (an animal is not asked whether it
 * is a place), and so is one about a kind of thing that has been ruled out
 * (nothing that is not an animal is asked whether it flies) until nothing
 * better is left. When every answer left is already known the list is empty.
 *
 * It reads only what the player can already see: the questions they were
 * dealt, the answers they have had, and the kind of thing the card names
 * when it names one. Nothing about the hidden identity goes into it, so the
 * suggestions say nothing the list did not.
 */
export function suggestWhoAmIQuestions(
  questions: ReadonlyArray<{ id: string; fact: string }>,
  asked: readonly WhoAmIAsked[],
  category: string | null,
  count: number = WHO_AM_I_SUGGESTIONS,
): string[] {
  const known = new Map<string, boolean>();
  const settle = (also: Partial<Record<WhoAmIFact, boolean>> | undefined): void => {
    for (const [fact, value] of Object.entries(also ?? {})) if (!known.has(fact)) known.set(fact, value);
  };
  if (isWhoAmICategory(category)) settle(KIND_SETTLES[category]);
  const factOf = new Map(questions.map((q) => [q.id, q.fact]));
  for (const a of asked) {
    const fact = factOf.get(a.question);
    if (!fact) continue;
    known.set(fact, a.answer);
    if (isWhoAmIFact(fact)) settle(a.answer ? SETTLES[fact]?.yes : SETTLES[fact]?.no);
  }
  const done = new Set(asked.map((a) => a.question));
  const order = (fact: string): number => {
    const at = WHO_AM_I_FACTS.findIndex((f) => f.key === fact);
    return at < 0 ? WHO_AM_I_FACTS.length : at;
  };
  const open = questions.filter((q) => !done.has(q.id)).sort((a, b) => order(a.fact) - order(b.fact));
  const beside = (q: { fact: string }): boolean => isWhoAmIFact(q.fact) && (ASKED_OF[q.fact] ?? []).some(([fact, value]) => known.get(fact) === value);
  // A question whose answer is already known is never suggested: it costs a point for nothing. One that is only
  // beside the point comes after everything else, since a card can still surprise; when even those are gone the
  // list is empty, which is its own advice.
  const unknown = open.filter((q) => !known.has(q.fact));
  return [...unknown.filter((q) => !beside(q)), ...unknown.filter(beside)].slice(0, Math.max(0, count)).map((q) => q.id);
}

// ---------- what the apps are sent ----------

/** One tile to guess from: the word, and what it means when the difficulty shows that. */
export interface WhoAmITile {
  id: string;
  word: string;
  meanings: Meanings | null;
}

/** One question that can be asked: its Kurdish, and what it means (shown when it is tapped). */
export interface WhoAmIQuestion {
  id: string;
  ku: string;
  meanings: Meanings;
}

/** A question asked, and the answer the facts gave. */
export interface WhoAmIAsked {
  question: string;
  answer: boolean;
}
