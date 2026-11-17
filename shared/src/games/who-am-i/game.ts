/**
 * Who Am I?: a player's hidden identity (an animal, an object, a job, a food or drink, a place, or something in nature,
 * each a word from published lessons) is on a card the others read, and they find it by asking questions from an approved
 * list, then guessing from a few tiles. The card's answer comes from the identity's facts table, never from typing:
 * "Does it fly?" asks `can-fly`, and the row says yes, no or "sometimes" where honest people would say either. Friends
 * reading the card answer yes, could be, no or not sure (`WHO_AM_I_SAYS`), scored by `markOf` so careful reasoning never
 * loses to the card.
 *
 * Pure helpers the rules (rules.ts) play with: the facts and their meanings (the admin's facts table), dealing (tiles that
 * share most facts, and only questions every tile can answer, preferring those that tell the tiles apart, so the list never
 * gives the identity away), points, suggested next questions (`suggestWhoAmIQuestions`), and round shapes. No Kurdish
 * lives here: words and questions are approved `game_content` rows, answers each app's catalogue words.
 */
import { seededUnit } from '../last-letter/rules.js';
import type { GameDifficulty } from '../solo.js';
import type { Meanings } from '../content.js';

/** What an identity can be. Drinks count as food (the card says "food or drink"); `nature` is the sun, rain, a tree, a flower. */
export const WHO_AM_I_CATEGORIES = ['animal', 'object', 'profession', 'food', 'place', 'nature'] as const;
export type WhoAmICategory = (typeof WHO_AM_I_CATEGORIES)[number];

export function isWhoAmICategory(v: unknown): v is WhoAmICategory {
  return (WHO_AM_I_CATEGORIES as readonly unknown[]).includes(v);
}

/**
 * The facts an identity's table can answer, each with its English meaning for whoever fills the table; a question template
 * asks one. Listed widest first, the order a seasoned player asks in, which the suggestions follow. A narrow fact is set
 * only on kinds of thing its question suits, so "Does this person sell things?" is never dealt beside an apple.
 */
export const WHO_AM_I_FACTS = [
  { key: 'alive', en: 'It is alive' },
  { key: 'animal', en: 'It is an animal' },
  { key: 'person', en: 'It is a person (someone who does this job)' },
  { key: 'edible', en: 'People eat it' },
  { key: 'place', en: 'It is a place' },
  { key: 'drink', en: 'People drink it' },
  { key: 'building', en: 'It is a building' },
  { key: 'can-fly', en: 'It can fly' },
  { key: 'lives-in-water', en: 'It lives in water' },
  { key: 'four-legs', en: 'It walks on four legs' },
  { key: 'wild', en: 'It is a wild animal' },
  { key: 'kept-by-people', en: 'People keep it (on a farm or at home)' },
  { key: 'gives-milk', en: 'It gives milk' },
  { key: 'lays-eggs', en: 'It lays eggs' },
  { key: 'has-feathers', en: 'It has feathers' },
  { key: 'works-with-hands', en: 'This person works with their hands' },
  { key: 'works-with-children', en: 'This person works with children' },
  { key: 'sells', en: 'This person sells things' },
  { key: 'bigger-than-person', en: 'It is bigger than a person' },
  { key: 'smaller-than-hand', en: 'It is smaller than the palm of a hand' },
  { key: 'lifted-by-hand', en: 'You can lift it with your hands' },
  { key: 'in-sky', en: 'It is in the sky' },
  { key: 'at-home', en: 'You find it at home' },
  { key: 'in-kitchen', en: 'You find it in the kitchen' },
  { key: 'at-school', en: 'You find it at school' },
  { key: 'in-village', en: 'You find it in villages' },
  { key: 'sweet', en: 'It tastes sweet' },
  { key: 'fruit', en: 'It is a fruit' },
  { key: 'grows-on-tree', en: 'It grows on a tree' },
  { key: 'cooked', en: 'It is cooked' },
  { key: 'breakfast', en: 'It is part of breakfast' },
  { key: 'hot', en: 'It is hot' },
  { key: 'uses-electricity', en: 'It runs on electricity' },
  { key: 'made-of-wood', en: 'It is made of wood' },
  { key: 'has-wheels', en: 'It has wheels' },
  { key: 'makes-sound', en: 'It makes a sound' },
  { key: 'green', en: 'It is green' },
  { key: 'red', en: 'It is red' },
  { key: 'swim-in', en: 'You can swim in it' },
  { key: 'helps-sick', en: 'It helps sick people' },
  { key: 'works-outdoors', en: 'It works outdoors' },
] as const;
export type WhoAmIFact = (typeof WHO_AM_I_FACTS)[number]['key'];

export function isWhoAmIFact(v: unknown): v is WhoAmIFact {
  return WHO_AM_I_FACTS.some((f) => f.key === v);
}

// ---------- what a card says, and what the friends say ----------

/**
 * One row of an identity's table: yes, no, or "sometimes" (a dog is indoors in one family, in the yard in another). An
 * unset fact is never dealt beside this card.
 */
export type WhoAmIFactValue = boolean | 'sometimes';
/** What a card says to a question: its verdict. */
export type WhoAmIAnswer = 'yes' | 'no' | 'sometimes';
/** What a friend reading the card can say, in key order: yes, could be, no, and not sure below them. */
export const WHO_AM_I_SAYS = ['yes', 'sometimes', 'no', 'unsure'] as const;
export type WhoAmISays = (typeof WHO_AM_I_SAYS)[number];
/** How a friend's answer is scored against the card (`markOf`). */
export type WhoAmIMark = 'right' | 'close' | 'wrong' | 'unsure';
/**
 * The most "sometimes" rows one identity's table may have: a card that is "sometimes" about everything teaches nothing,
 * and players cannot pick cards to farm a few.
 */
export const WHO_AM_I_MAX_SOMETIMES = 3;
/** How many answers a table offers: all four, or yes and no for tables from older apps, whose cards are dealt without "sometimes" rows (`asTwoAnswers`). */
export const WHO_AM_I_ANSWER_COUNTS = [2, 4] as const;
export type WhoAmIAnswerCount = (typeof WHO_AM_I_ANSWER_COUNTS)[number];

export function isWhoAmISays(v: unknown): v is WhoAmISays {
  return (WHO_AM_I_SAYS as readonly unknown[]).includes(v);
}

/** Whether a table row answers its question at all: yes, no or sometimes. */
export function hasWhoAmIFact(facts: Readonly<Record<string, WhoAmIFactValue | undefined>>, fact: string): boolean {
  const v = facts[fact];
  return typeof v === 'boolean' || v === 'sometimes';
}

/** What a card says to a question: yes, no or sometimes, from its facts; no for a fact its table does not set. */
export function verdictFor(identity: Pick<WhoAmIIdentity, 'facts'>, fact: string): WhoAmIAnswer {
  const v = identity.facts[fact];
  return v === true ? 'yes' : v === 'sometimes' ? 'sometimes' : 'no';
}

/**
 * A friend's answer against the card's verdict:
 *
 *   friend says ↓   card says →   yes      no       sometimes
 *   yes                           right    wrong    right
 *   could be                      close    close    right
 *   no                            wrong    right    right
 *   not sure                      unsure   unsure   unsure
 *
 * Yes and no are both right on a "sometimes" card, since either is a reasonable answer; "could be" on a plain yes or no is
 * close, so the game still teaches that the card was clear. Only yes against no is wrong.
 */
export function markOf(says: WhoAmISays, verdict: WhoAmIAnswer): WhoAmIMark {
  if (says === 'unsure') return 'unsure';
  if (verdict === 'sometimes') return 'right';
  if (says === 'sometimes') return 'close';
  return says === verdict ? 'right' : 'wrong';
}

/** An identity dealt for a two-answer table, without its "sometimes" rows, for tables from older apps and phones that read anything but yes as no. */
export function asTwoAnswers<T extends Pick<WhoAmIIdentity, 'facts'>>(identity: T): T {
  if (!Object.values(identity.facts).includes('sometimes')) return identity;
  return { ...identity, facts: Object.fromEntries(Object.entries(identity.facts).filter(([, v]) => typeof v === 'boolean')) };
}

/** Wrong guesses at an identity before its player is out. */
export const WHO_AM_I_GUESSES = 2;
/** The same in one room, where there are no tiles and anything may be said aloud, so one more miss is allowed. */
export const WHO_AM_I_ROOM_GUESSES = 3;
/** Tiles to guess from by difficulty; beginners also see each tile's meaning. */
export const WHO_AM_I_CANDIDATES: Readonly<Record<GameDifficulty, number>> = { beginner: 4, intermediate: 6, advanced: 8 };
/** The fewest tiles a deal may fall back to when too few identities share enough facts. */
export const WHO_AM_I_MIN_CANDIDATES = 3;
/** Questions an identity needs on offer to be worth dealing, and the most offered at once. */
export const WHO_AM_I_MIN_QUESTIONS = 4;
export const WHO_AM_I_MAX_QUESTIONS = 12;
/** Approved question templates a dialect needs before the game is offered in it, since a deal offers only questions that tell its tiles apart. */
export const WHO_AM_I_MIN_TEMPLATES = 20;

/** What a solved identity starts at; each question and wrong guess costs some. */
export const WHO_AM_I_START_POINTS = 10;
export const WHO_AM_I_QUESTION_COST = 1;
export const WHO_AM_I_WRONG_GUESS_COST = 3;

/** Points for one identity: fewer questions score more; solved is worth at least 1, unsolved nothing. */
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
  facts: Readonly<Record<string, WhoAmIFactValue>>;
}

/** An approved question template, as a deal reads it. */
export interface WhoAmITemplate {
  id: string;
  ku: string;
  meanings: Meanings;
  fact: string;
}

/** A dealt identity: the server keeps all of it and sends its player only `candidates` and `questions`. */
export interface WhoAmIDeal {
  identity: WhoAmIIdentity;
  /** the tiles, shuffled, the identity among them (deals from before tiles carried a category have none) */
  candidates: Array<{ id: string; word: string; meanings: Meanings; category?: string }>;
  /** the questions offered: each fact asked once, every candidate with an answer to it */
  questions: Array<{ id: string; ku: string; meanings: Meanings; fact: string }>;
}

/** A number from 0 to 1 per label: the same for the same label, and revealing nothing about another label's. */
export type DealUnit = (label: string) => number;

function draw<T>(unit: DealUnit, salt: string, items: readonly T[], keyOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, k: unit(`${salt}:${keyOf(item)}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}

/** The facts every one of these identities answers (yes, no or sometimes). */
function sharedFacts(ids: readonly WhoAmIIdentity[]): Set<string> {
  const [first, ...rest] = ids;
  if (!first) return new Set();
  return new Set(Object.keys(first.facts).filter((k) => hasWhoAmIFact(first.facts, k) && rest.every((r) => hasWhoAmIFact(r.facts, k))));
}

/**
 * Keeps the identities no question could confuse with the hidden one or one kept before: each answers the hidden
 * identity's facts its own way. A cat and a dog answering alike cannot be told apart by asking, so only the first of such a
 * pair is dealt. "Sometimes" counts as its own answer, since the asker is told it.
 */
function tellsApart(target: WhoAmIIdentity): (p: WhoAmIIdentity) => boolean {
  const keys = Object.keys(target.facts).sort();
  const letter = (v: WhoAmIFactValue | undefined): string => (v === true ? 'y' : v === false ? 'n' : v === 'sometimes' ? 's' : '-');
  const answers = (p: WhoAmIIdentity): string => keys.map((k) => letter(p.facts[k])).join('');
  const taken = new Set([answers(target)]);
  return (p) => {
    const a = answers(p);
    if (taken.has(a)) return false;
    taken.add(a);
    return true;
  };
}

/**
 * The wide questions a deal may keep although every tile answers them alike: where learners start, and still worth asking
 * on one phone where nobody sees the tiles. At most WHO_AM_I_WIDE_KEPT, and never one the card's kind already answers.
 */
const WIDE: readonly WhoAmIFact[] = ['alive', 'animal', 'person', 'place'];
const WHO_AM_I_WIDE_KEPT = 2;

/** How well a question tells tiles apart: how many tiles fall outside its largest answer group; 0 when every tile answers alike. */
function splitOf(tiles: readonly WhoAmIIdentity[], fact: string): number {
  const buckets = new Map<string, number>();
  for (const t of tiles) {
    const v = verdictFor(t, fact);
    buckets.set(v, (buckets.get(v) ?? 0) + 1);
  }
  return tiles.length - Math.max(0, ...buckets.values());
}

/**
 * Deals one hidden identity: up to `want` tiles (the identity and those sharing most of its facts, none answering exactly
 * like another) and the questions every tile can answer. Only questions that tell the tiles apart are dealt, best first,
 * with at most two wide ones (`WIDE`), topped up from the rest only to reach WHO_AM_I_MIN_QUESTIONS; fewer tiles are dealt
 * if that is what it takes. Null when even WHO_AM_I_MIN_CANDIDATES cannot work.
 *
 * The questions depend on the tiles as a set, never on which is hidden, so the list gives nothing away. Everything comes
 * from the seed (through `unit` when given), so every replica deals the same and a round reads back the same.
 */
export function dealWhoAmI(
  target: WhoAmIIdentity,
  pool: readonly WhoAmIIdentity[],
  templates: readonly WhoAmITemplate[],
  opts: { seed: string; salt: string; want: number; unit?: DealUnit },
): WhoAmIDeal | null {
  // The server draws with a secret key (`unit`). The seed's plain hash is only for callers with nothing to hide (a test, a
  // preview), since its numbers can be worked back from the deal's order, and the hidden identity with them.
  const unit: DealUnit = opts.unit ?? ((label) => seededUnit(opts.seed, label));
  const others = draw(
    unit,
    `${opts.salt}:others`,
    pool.filter((p) => p.id !== target.id && p.word !== target.word),
    (p) => p.id,
  )
    .map((p) => ({ p, same: p.category === target.category, shared: Object.keys(target.facts).filter((k) => hasWhoAmIFact(p.facts, k)).length }))
    // The identity's own kind first, so the kind the card names does not tell the tiles apart.
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
    const split = new Map(asked.map((t) => [t.id, splitOf(tiles, t.fact)]));
    const splitting = asked.filter((t) => split.get(t.id)! > 0).sort((a, b) => split.get(b.id)! - split.get(a.id)!);
    // A question every tile answers alike tells nothing: only a couple of wide ones stay, and none the card's kind answers.
    const kind = sharedCategory(target.category, tiles);
    const known = isWhoAmICategory(kind) ? KIND_SETTLES[kind] : {};
    const flat = asked.filter((t) => split.get(t.id) === 0).sort((a, b) => factOrder(a.fact) - factOrder(b.fact));
    const wide = flat.filter((t) => (WIDE as readonly string[]).includes(t.fact) && !(t.fact in known)).slice(0, WHO_AM_I_WIDE_KEPT);
    // When the list must still be topped up to the minimum, use what the card has not already said.
    const rest = flat.filter((t) => !wide.includes(t)).sort((a, b) => Number(a.fact in known) - Number(b.fact in known));
    const short = Math.max(0, WHO_AM_I_MIN_QUESTIONS - splitting.length - wide.length);
    const questions = [...splitting, ...wide, ...rest.slice(0, short)].slice(0, WHO_AM_I_MAX_QUESTIONS);
    return {
      identity: target,
      candidates: draw(unit, `${opts.salt}:tiles`, tiles, (x) => x.id).map((x) => ({ id: x.id, word: x.word, meanings: x.meanings, category: x.category })),
      // The list is shuffled again, so its order does not reveal which questions split the tiles.
      questions: draw(unit, `${opts.salt}:asked`, questions, (q) => q.id).map((q) => ({ id: q.id, ku: q.ku, meanings: q.meanings, fact: q.fact })),
    };
  }
  return null;
}

/** The kind a hidden identity's card may name: only when every tile is of that kind, since otherwise the kind would single it out. */
export function sharedCategory(category: string, tiles: ReadonlyArray<{ category?: string }>): string | null {
  return tiles.length > 0 && tiles.every((t) => t.category === category) ? category : null;
}

/** What the card said to an asked question, from its verdict or, in lists kept before there were three, its yes or no. */
export function askedVerdict(a: WhoAmIAsked): WhoAmIAnswer {
  return a.verdict ?? (a.answer ? 'yes' : 'no');
}

// ---------- questions worth asking next ----------

type Settled = Partial<Record<WhoAmIFact, boolean>>;

/**
 * What an answer settles besides itself (an animal is alive and neither a person nor a place), transitively. Used only to
 * choose suggestions: the card's answers are its facts table's alone, and a "sometimes" settles only its own question.
 */
const SETTLES: Partial<Record<WhoAmIFact, { yes?: Settled; no?: Settled }>> = {
  animal: { yes: { alive: true, person: false, place: false, drink: false } },
  person: { yes: { alive: true, animal: false, place: false, edible: false, drink: false } },
  place: { yes: { alive: false, animal: false, person: false, edible: false, drink: false } },
  edible: { yes: { person: false, place: false } },
  alive: { yes: { drink: false }, no: { animal: false, person: false } },
  drink: { yes: { edible: false, alive: false, animal: false, person: false, place: false } },
  fruit: { yes: { edible: true, drink: false, animal: false, person: false, place: false } },
  building: { yes: { place: true } },
  // These are only ever asked of animals, so a yes says it is one.
  wild: { yes: { animal: true } },
  'kept-by-people': { yes: { animal: true } },
  'gives-milk': { yes: { animal: true } },
  'lays-eggs': { yes: { animal: true } },
  'has-feathers': { yes: { animal: true } },
};

/** What the card's named kind settles. Food is food or drink, so it settles neither, but nothing on a plate or in a glass is alive. */
const KIND_SETTLES: Record<WhoAmICategory, Settled> = {
  animal: { alive: true, animal: true, person: false, place: false, drink: false },
  object: { alive: false, animal: false, person: false, place: false, edible: false, drink: false },
  profession: { alive: true, person: true, animal: false, place: false, edible: false, drink: false },
  food: { alive: false, animal: false, person: false, place: false },
  place: { place: true, alive: false, animal: false, person: false, edible: false, drink: false },
  nature: { animal: false, person: false, place: false, edible: false, drink: false },
};

/**
 * Questions only about some kinds of thing, not worth asking once the answers rule those kinds out. Each entry lists ways
 * to rule them out, each holding when every answer it names is known: "Is it sweet?" is beside the point once it is
 * neither eaten nor drunk, or is a person.
 */
const FOOD_ONLY: ReadonlyArray<Settled> = [{ edible: false, drink: false }, { animal: true }, { person: true }, { place: true }];
const ASKED_OF: Partial<Record<WhoAmIFact, ReadonlyArray<Settled>>> = {
  drink: [{ edible: true }],
  building: [{ place: false }],
  'can-fly': [{ animal: false }, { alive: false }],
  'lives-in-water': [{ animal: false }, { alive: false }],
  'four-legs': [{ animal: false }, { alive: false }],
  wild: [{ animal: false }],
  'kept-by-people': [{ animal: false }],
  'gives-milk': [{ animal: false }],
  'lays-eggs': [{ animal: false }],
  'has-feathers': [{ animal: false }],
  'works-with-hands': [{ person: false }],
  'works-with-children': [{ person: false }],
  sells: [{ person: false }],
  'bigger-than-person': [{ person: true }],
  'smaller-than-hand': [{ person: true }, { place: true }],
  'lifted-by-hand': [{ person: true }, { place: true }],
  'in-sky': [{ person: true }, { place: true }, { edible: true }, { drink: true }],
  'at-home': [{ person: true }, { place: true }],
  'in-kitchen': [{ place: true }],
  'at-school': [{ place: true }],
  sweet: FOOD_ONLY,
  fruit: [...FOOD_ONLY, { drink: true }],
  cooked: FOOD_ONLY,
  breakfast: FOOD_ONLY,
  'grows-on-tree': [{ animal: true }, { person: true }, { place: true }, { drink: true }],
  hot: [{ person: true }, { animal: true }],
  'uses-electricity': [{ alive: true }, { edible: true }, { place: true }, { drink: true }],
  'made-of-wood': [{ alive: true }, { edible: true }, { drink: true }],
  'has-wheels': [{ alive: true }, { edible: true }, { drink: true }, { place: true }],
  'makes-sound': [{ edible: true }, { drink: true }],
  green: [{ person: true }],
  red: [{ person: true }],
  'swim-in': [{ place: false }],
  'helps-sick': [{ animal: true }, { edible: true }],
  // A job, an animal or a machine works outdoors: beside the point once it is neither a person nor an animal.
  'works-outdoors': [{ person: false, animal: false }],
};

/** A fact's place in the asking order (`WHO_AM_I_FACTS`); an unknown fact goes last. */
function factOrder(fact: string): number {
  const at = WHO_AM_I_FACTS.findIndex((f) => f.key === fact);
  return at < 0 ? WHO_AM_I_FACTS.length : at;
}

/** How many questions are suggested at once, few enough to read at a glance. */
export const WHO_AM_I_SUGGESTIONS = 3;

/**
 * The questions to suggest next, best first, as a seasoned player would ask: wide before narrow ("Is it alive?" before
 * "Does it fly?"), leaving out questions whose answers follow from those already had, and putting last those about a kind
 * already ruled out. Empty when every remaining answer is known. It reads only what the player can see (their questions,
 * their answers, the card's named kind), never the hidden identity, and a "sometimes" answers only its own question.
 */
export function suggestWhoAmIQuestions(
  questions: ReadonlyArray<{ id: string; fact: string }>,
  asked: readonly WhoAmIAsked[],
  category: string | null,
  count: number = WHO_AM_I_SUGGESTIONS,
): string[] {
  const known = new Map<string, boolean | 'sometimes'>();
  const settle = (also: Settled | undefined): void => {
    for (const [fact, value] of Object.entries(also ?? {})) {
      if (known.has(fact)) continue;
      known.set(fact, value);
      if (isWhoAmIFact(fact)) settle(value ? SETTLES[fact]?.yes : SETTLES[fact]?.no);
    }
  };
  if (isWhoAmICategory(category)) settle(KIND_SETTLES[category]);
  const factOf = new Map(questions.map((q) => [q.id, q.fact]));
  for (const a of asked) {
    const fact = factOf.get(a.question);
    if (!fact) continue;
    const verdict = askedVerdict(a);
    if (verdict === 'sometimes') {
      known.set(fact, 'sometimes');
      continue;
    }
    known.set(fact, verdict === 'yes');
    if (isWhoAmIFact(fact)) settle(verdict === 'yes' ? SETTLES[fact]?.yes : SETTLES[fact]?.no);
  }
  const done = new Set(asked.map((a) => a.question));
  const open = questions.filter((q) => !done.has(q.id)).sort((a, b) => factOrder(a.fact) - factOrder(b.fact));
  const beside = (q: { fact: string }): boolean =>
    isWhoAmIFact(q.fact) && (ASKED_OF[q.fact] ?? []).some((way) => Object.entries(way).every(([fact, value]) => known.get(fact) === value));
  // A question with a known answer is never suggested, as it costs a point for nothing. One merely beside the point comes
  // after everything else, since a card can still surprise; when even those are gone the empty list is its own advice.
  const unknown = open.filter((q) => !known.has(q.fact));
  return [...unknown.filter((q) => !beside(q)), ...unknown.filter(beside)].slice(0, Math.max(0, count)).map((q) => q.id);
}

// ---------- what the apps are sent ----------

/** One tile to guess from: the word, and its meaning when the difficulty shows it. */
export interface WhoAmITile {
  id: string;
  word: string;
  meanings: Meanings | null;
}

/** One question that can be asked: its Kurdish and its meaning, shown when tapped. */
export interface WhoAmIQuestion {
  id: string;
  ku: string;
  meanings: Meanings;
}

/**
 * A question asked and what the card said. `answer` is yes or not as older apps read it ("sometimes" is not yes);
 * `verdict` is the card's own word, missing only from lists kept before it (`askedVerdict` reads either).
 */
export interface WhoAmIAsked {
  question: string;
  answer: boolean;
  verdict?: WhoAmIAnswer;
}
