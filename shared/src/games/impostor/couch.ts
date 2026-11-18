/**
 * Impostor on one phone passed round a room: each player reads their card in private as the phone goes from hand to hand,
 * clues are said aloud, the phone keeps the order and time, and at the end it takes the votes and turns the cards over.
 * Three ways: `classic` (the impostor sees only the category), `blind` (the impostor sees nothing) and `odd` (nobody is
 * told: the odd one out holds a different word of the same category and must work it out).
 *
 * Pure rules: every draw (impostors, first speaker, guess layout) comes from the round's seed. Cards are approved word
 * cards dealt in batches by the server (api/src/games/couch.ts); players' names never leave the phone. Two impostors are
 * hunted one at a time: once the first is caught and has guessed, the others vote again against a short clock, and an
 * impostor still hidden is paid for it. Nobody without a word speaks first. Nothing here pays: the phone holds every card,
 * so it cannot judge who won, and a round earns no XP and moves no rating.
 */
import type { Meanings } from '../content.js';
import type { GameDialect } from '../dialect.js';
import { seededUnit } from '../last-letter/rules.js';
import { seededOrder } from '../multi/order.js';
import { IMPOSTOR_GUESS_OPTIONS, IMPOSTOR_POINTS, impostorFirstSpeaker } from './rules.js';

export const COUCH_MIN_PLAYERS = 3;
export const COUCH_MAX_PLAYERS = 10;
/** A name is what fits on a card held at arm's length. */
export const COUCH_NAME_MAX = 14;
/** A second impostor needs a room large enough to hide two. */
export const COUCH_TWO_IMPOSTORS_FROM = 6;

export const COUCH_WAYS = ['classic', 'blind', 'odd'] as const;
export type CouchWay = (typeof COUCH_WAYS)[number];
/** How many times round the room the clues go. */
export const COUCH_ROUNDS = [1, 2, 3] as const;
export type CouchRounds = (typeof COUCH_ROUNDS)[number];
/** The time a speaker has for a clue; 0 is no clock. */
export const COUCH_CLUE_SECONDS = [0, 15, 30, 45] as const;
export type CouchClueSeconds = (typeof COUCH_CLUE_SECONDS)[number];
/** The time the room has to argue before it votes; 0 goes straight to the vote. */
export const COUCH_TALK_SECONDS = [0, 60, 120, 180, 300] as const;
export type CouchTalkSeconds = (typeof COUCH_TALK_SECONDS)[number];
/** A private vote each casts as the phone goes round, or one the room makes together by pointing. */
export const COUCH_VOTES = ['secret', 'open'] as const;
export type CouchVote = (typeof COUCH_VOTES)[number];
/** The time for the room's second vote once one of two impostors is caught: short, since the arguing is done. */
export const COUCH_SECOND_VOTE_SECONDS = 30;

export interface CouchSettings {
  way: CouchWay;
  impostors: 1 | 2;
  rounds: CouchRounds;
  clueSeconds: CouchClueSeconds;
  talkSeconds: CouchTalkSeconds;
  vote: CouchVote;
}

export const COUCH_DEFAULTS: CouchSettings = { way: 'classic', impostors: 1, rounds: 2, clueSeconds: 30, talkSeconds: 120, vote: 'secret' };

/** One round's card, as the server deals it from approved word cards. */
export interface CouchCard {
  word: string;
  meanings: Meanings;
  /** the category, in Kurdish, with its meaning */
  hint: { ku: string; meanings: Meanings };
  /** the category slug its picture is found by; absent from servers that do not send it */
  category?: string;
  /** other approved words the caught impostor's guess is chosen among */
  decoys: string[];
  /** another approved word of the same category for the odd one out; null when the category has no other */
  twin: { word: string; meanings: Meanings } | null;
}

/** How many cards one deck request may ask for, and how many it gets by default. */
export const COUCH_DECK_MAX = 20;
export const COUCH_DECK_DEFAULT = 10;
/** How many words already played tonight a deck request may exclude, so an evening does not repeat itself. */
export const COUCH_DECK_EXCLUDE_MAX = 100;

/** A category playable at one difficulty: its name as the cards give it, and its card count. */
export interface CouchCategory {
  slug: string;
  ku: string;
  meanings: Meanings;
  cards: number;
}

/** Where the game is offered in one variety: each difficulty with enough approved cards, and its categories. */
export interface CouchOffer {
  dialect: GameDialect;
  difficulties: Array<{ difficulty: 'beginner' | 'intermediate' | 'advanced'; cards: number; categories: CouchCategory[] }>;
}

/** An evening's cards, in the order they are to be played. */
export interface CouchDeck {
  dialect: GameDialect;
  cards: CouchCard[];
}

/** `second` is the room's vote for the other impostor, once one of two is caught. */
export type CouchPhase = 'deal' | 'clues' | 'talk' | 'vote' | 'guess' | 'second' | 'reveal';
/** How a round ends: the impostor got away, was caught, or was caught and named the word. */
export type CouchEnd = 'escaped' | 'caught' | 'guessed';
/** Why the impostors got away: a shared top of the vote, the vote landing on someone else, or nobody named. */
export type CouchEscape = 'tie' | 'wrong-out' | 'no-votes';

/** The room's second vote, for the impostor still hidden once the other is caught. */
export interface CouchSecondVote {
  /** who votes, in seat order: everyone but the impostor already caught */
  voters: number[];
  /** a private vote: each voter's choice in `voters` order so far; null for one who would not choose */
  votes: Array<number | null>;
  /** the seat this vote landed on, once counted; null when it could not agree */
  accused: number | null;
  /** whether it has been counted */
  done: boolean;
}

export interface CouchState {
  dialect: GameDialect;
  /** the players by seat: seat `i` is `players[i]` */
  players: string[];
  settings: CouchSettings;
  card: CouchCard;
  /** the guess's options, shuffled, the word among them */
  options: string[];
  impostors: number[];
  /** who speaks when, the same every time round */
  order: number[];
  phase: CouchPhase;
  /** how many have read their card, in seat order */
  dealt: number;
  /** the clue being said: its place in the whole run of them, from 0 */
  turn: number;
  /** a private vote: each seat's choice in seat order so far; null for a seat that would not choose */
  votes: Array<number | null>;
  /** the seat the room voted out, once counted; null when it could not agree */
  accused: number | null;
  /** the option the caught impostor chose */
  guessed: number | null;
  /** how the hunt for the first impostor ended; set when it did, before the reveal when a second vote follows */
  endedBy: CouchEnd | null;
  /** the room asked for an odd word and this card has none, so the round is played the plain way (absent on older rounds) */
  oddFallback?: boolean;
  /** the second vote, in a round with two impostors once the first is caught; otherwise absent or null */
  second?: CouchSecondVote | null;
}

/** The category a card shows: its name, its meaning, and the slug its picture is found by where the server sent one. */
export interface CouchHint {
  ku: string;
  meanings: Meanings;
  category?: string;
}

export type CouchHand = { role: 'player'; word: string; meanings: Meanings; hint: CouchHint } | { role: 'impostor'; hint: CouchHint | null };

export type CouchNameSlip = 'too-few' | 'too-many' | 'empty' | 'same';

/** A name as kept: one line, no control characters, trimmed to fit. */
export function couchName(raw: string): string {
  return [...raw.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, COUCH_NAME_MAX).join('').trim();
}

/** The names a round can be played with, or why not: enough of them, none blank, no two alike. */
export function couchNames(raw: readonly string[]): { ok: true; names: string[] } | { ok: false; reason: CouchNameSlip } {
  const names = raw.map(couchName);
  if (names.length < COUCH_MIN_PLAYERS) return { ok: false, reason: 'too-few' };
  if (names.length > COUCH_MAX_PLAYERS) return { ok: false, reason: 'too-many' };
  if (names.some((n) => n === '')) return { ok: false, reason: 'empty' };
  const seen = new Set(names.map((n) => n.toLocaleLowerCase()));
  if (seen.size !== names.length) return { ok: false, reason: 'same' };
  return { ok: true, names };
}

/** What a phone keeps between evenings: who played and how the game was set, never a card or a score. */
export interface CouchKept {
  names: string[];
  settings: CouchSettings;
}

/**
 * What a phone kept, read back: names as `couchName` would keep them and every setting still valid, the rest at new-game
 * defaults. Anything not in the written shape is ignored entirely, so a value from another version cannot set up a game the
 * rules lack.
 */
export function couchKept(raw: unknown): CouchKept | null {
  if (!raw || typeof raw !== 'object') return null;
  const { names, settings } = raw as { names?: unknown; settings?: unknown };
  if (!Array.isArray(names) || !names.every((n): n is string => typeof n === 'string')) return null;
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<keyof CouchSettings, unknown>;
  const among = <T,>(choices: readonly T[], value: unknown, otherwise: T): T => (choices.includes(value as T) ? (value as T) : otherwise);
  return {
    names: names.slice(0, COUCH_MAX_PLAYERS).map(couchName),
    settings: {
      way: among(COUCH_WAYS, s.way, COUCH_DEFAULTS.way),
      impostors: s.impostors === 2 ? 2 : 1,
      rounds: among(COUCH_ROUNDS, s.rounds, COUCH_DEFAULTS.rounds),
      clueSeconds: among(COUCH_CLUE_SECONDS, s.clueSeconds, COUCH_DEFAULTS.clueSeconds),
      talkSeconds: among(COUCH_TALK_SECONDS, s.talkSeconds, COUCH_DEFAULTS.talkSeconds),
      vote: among(COUCH_VOTES, s.vote, COUCH_DEFAULTS.vote),
    },
  };
}

/** The settings a room of this size and this card can be played with; what does not fit falls back to the plain game. */
export function couchSettingsFor(players: number, card: Pick<CouchCard, 'twin'> | null, wanted: CouchSettings): CouchSettings {
  const settings = { ...wanted };
  if (players < COUCH_TWO_IMPOSTORS_FROM) settings.impostors = 1;
  if (settings.way === 'odd' && card && !card.twin) settings.way = 'classic';
  return settings;
}

/**
 * A round dealt from the seed: the impostors, the order and the guess layout. `wanted` is passed afresh each round, so a
 * card without a second word plays the plain way for that round only (`oddFallback`), not for the rest of the evening.
 */
export function couchStart(dialect: GameDialect, players: readonly string[], wanted: CouchSettings, card: CouchCard, seed: string): CouchState {
  const settings = couchSettingsFor(players.length, card, wanted);
  const seats = players.map((_, i) => i);
  const impostors = seededOrder(seed, 'impostor', seats)
    .slice(0, settings.impostors)
    .sort((a, b) => a - b);
  return {
    dialect,
    players: [...players],
    settings,
    card: { ...card, decoys: [...card.decoys] },
    options: seededOrder(seed, 'options', [card.word, ...card.decoys].slice(0, IMPOSTOR_GUESS_OPTIONS)),
    impostors,
    // The speaking order goes round as people sit, from a seed-drawn seat or the next one after it holding the word.
    order: impostorFirstSpeaker(
      seats.map((_, i) => (i + Math.floor(seededUnit(seed, 'first') * seats.length)) % seats.length),
      impostors,
    ),
    phase: 'deal',
    dealt: 0,
    turn: 0,
    votes: [],
    accused: null,
    guessed: null,
    endedBy: null,
    oddFallback: wanted.way === 'odd' && settings.way !== 'odd',
    second: null,
  };
}

/** A seat's card as only its holder should see it; in the odd-word game the odd one's card looks like anyone's. */
export function couchHand(state: CouchState, seat: number): CouchHand {
  const hint: CouchHint = { ku: state.card.hint.ku, meanings: state.card.hint.meanings, category: state.card.category };
  if (!state.impostors.includes(seat)) return { role: 'player', word: state.card.word, meanings: state.card.meanings, hint };
  if (state.settings.way === 'odd' && state.card.twin) return { role: 'player', word: state.card.twin.word, meanings: state.card.twin.meanings, hint };
  return { role: 'impostor', hint: state.settings.way === 'classic' ? hint : null };
}

/** The seat whose card is to be read now as the phone goes round; null once everyone has. */
export function couchReader(state: CouchState): number | null {
  return state.phase === 'deal' && state.dealt < state.players.length ? state.dealt : null;
}

/** The reader has read and hidden their card: on to the next, or to the clues. */
export function couchSeen(state: CouchState): CouchState {
  if (state.phase !== 'deal') return state;
  const dealt = state.dealt + 1;
  return dealt < state.players.length ? { ...state, dealt } : { ...state, dealt, phase: 'clues', turn: 0 };
}

/** Who is giving a clue now, and which time round it is. */
export function couchSpeaker(state: CouchState): { seat: number; round: number } | null {
  if (state.phase !== 'clues') return null;
  const n = state.order.length;
  return { seat: state.order[state.turn % n]!, round: Math.floor(state.turn / n) + 1 };
}

/** The clue is said or its time ran out: the next speaker, the talk, or straight to the vote. */
export function couchNextClue(state: CouchState): CouchState {
  if (state.phase !== 'clues') return state;
  const turn = state.turn + 1;
  if (turn < state.order.length * state.settings.rounds) return { ...state, turn };
  return { ...state, turn, phase: state.settings.talkSeconds > 0 ? 'talk' : 'vote' };
}

/** The talking is over, by the clock or because the room has had enough. */
export function couchToVote(state: CouchState): CouchState {
  return state.phase === 'talk' || state.phase === 'clues' ? { ...state, phase: 'vote' } : state;
}

/** The seat whose private vote is awaited, in seat order; null for an open vote or once every vote is in. */
export function couchVoter(state: CouchState): number | null {
  if (state.settings.vote !== 'secret') return null;
  if (state.phase === 'vote') return state.votes.length < state.players.length ? state.votes.length : null;
  if (state.phase === 'second' && state.second) return state.second.voters[state.second.votes.length] ?? null;
  return null;
}

/** The impostor the first vote did not catch, in a round with two; null when there is none. */
export function couchStillHidden(state: CouchState): number | null {
  if (state.impostors.length < 2 || state.accused === null || !state.impostors.includes(state.accused)) return null;
  return state.impostors.find((seat) => seat !== state.accused) ?? null;
}

/** The seats the room may name now: anyone in the first vote, anyone but the caught impostor in the second. */
export function couchSuspects(state: CouchState): number[] {
  const seats = state.players.map((_, seat) => seat);
  return state.phase === 'second' ? seats.filter((seat) => seat !== state.accused) : seats;
}

/** The hunt for the first impostor is over: the reveal, or the second vote while another impostor hides. */
function finish(state: CouchState, endedBy: CouchEnd): CouchState {
  const next = { ...state, endedBy };
  if (endedBy !== 'escaped' && couchStillHidden(next) !== null && !next.second) {
    const voters = next.players.map((_, seat) => seat).filter((seat) => seat !== next.accused);
    return { ...next, phase: 'second', second: { voters, votes: [], accused: null, done: false } };
  }
  return { ...next, phase: 'reveal' };
}

/** The seat a set of private votes lands on: the most votes alone at the top; null when nobody chose or the top is shared. */
function tallied(votes: ReadonlyArray<number | null>): number | null {
  const tally = new Map<number, number>();
  for (const v of votes) if (v !== null) tally.set(v, (tally.get(v) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  return !top || (ranked[1] && ranked[1][1] === top[1]) ? null : top[0];
}

/** The room has chosen, or failed to: what follows. */
function accuse(state: CouchState, accused: number | null): CouchState {
  const next = { ...state, accused };
  if (accused === null || !state.impostors.includes(accused)) return finish(next, 'escaped');
  // The odd one out never knew, so there is no word for them to name.
  if (state.settings.way === 'odd') return finish(next, 'caught');
  return { ...next, phase: 'guess' };
}

/** The second vote has landed or its clock ran out: the reveal. */
function settleSecond(state: CouchState, accused: number | null): CouchState {
  return { ...state, phase: 'reveal', second: { ...state.second!, accused, done: true } };
}

/** Whether this voter (null for the whole room) may name a seat now, or nobody (null). */
function nameable(state: CouchState, suspect: number | null, voter: number | null): boolean {
  if (suspect === null) return true;
  if (!Number.isInteger(suspect) || suspect === voter) return false;
  return couchSuspects(state).includes(suspect);
}

/** One private vote, for a seat other than the voter's own or for nobody; in the second vote never the caught impostor. */
export function couchCastVote(state: CouchState, suspect: number | null): CouchState {
  const voter = couchVoter(state);
  if (voter === null || !nameable(state, suspect, voter)) return state;
  if (state.phase === 'second') {
    const second = { ...state.second!, votes: [...state.second!.votes, suspect] };
    const next = { ...state, second };
    return second.votes.length < second.voters.length ? next : settleSecond(next, tallied(second.votes));
  }
  const next = { ...state, votes: [...state.votes, suspect] };
  if (next.votes.length < next.players.length) return next;
  // Nobody chose, or the top is shared: the room could not agree.
  return accuse(next, tallied(next.votes));
}

/** The room's own choice made by pointing: one seat, or nobody when it cannot agree. */
export function couchPoint(state: CouchState, suspect: number | null): CouchState {
  if (state.settings.vote !== 'open' || (state.phase !== 'vote' && state.phase !== 'second')) return state;
  if (!nameable(state, suspect, null)) return state;
  return state.phase === 'second' ? settleSecond(state, suspect) : accuse(state, suspect);
}

/** The second vote's clock ran out: the votes so far decide, and an impostor nobody agreed on stays hidden. */
export function couchSecondTimeUp(state: CouchState): CouchState {
  if (state.phase !== 'second' || !state.second) return state;
  return settleSecond(state, state.settings.vote === 'secret' ? tallied(state.second.votes) : null);
}

/** The caught impostor's one guess at the word. */
export function couchGuess(state: CouchState, option: number): CouchState {
  if (state.phase !== 'guess' || !Number.isInteger(option) || option < 0 || option >= state.options.length) return state;
  return finish({ ...state, guessed: option }, state.options[option] === state.card.word ? 'guessed' : 'caught');
}

/** Each seat's points for a finished round (see IMPOSTOR_POINTS), by seat. */
export function couchScores(state: CouchState): number[] {
  const scores = state.players.map(() => 0);
  if (state.phase !== 'reveal' || !state.endedBy) return scores;
  const hidden = (seat: number): boolean => state.impostors.includes(seat);
  state.votes.forEach((suspect, voter) => {
    if (suspect !== null && hidden(suspect) && !hidden(voter)) scores[voter]! += IMPOSTOR_POINTS.rightVote;
  });
  if (state.endedBy === 'escaped') for (const seat of state.impostors) scores[seat]! += IMPOSTOR_POINTS.escaped;
  else if (state.endedBy === 'guessed' && state.accused !== null) scores[state.accused]! += IMPOSTOR_POINTS.guessedWord;
  else state.players.forEach((_, seat) => { if (!hidden(seat)) scores[seat]! += IMPOSTOR_POINTS.caught; });
  const second = state.second;
  const other = couchStillHidden(state);
  if (second?.done && other !== null) {
    second.votes.forEach((suspect, i) => {
      const voter = second.voters[i]!;
      if (suspect === other && !hidden(voter)) scores[voter]! += IMPOSTOR_POINTS.rightVote;
    });
    if (second.accused !== other) scores[other]! += IMPOSTOR_POINTS.escaped;
  }
  return scores;
}

/** The evening's running totals with a finished round added. */
export function couchTotals(totals: readonly number[], state: CouchState): number[] {
  const round = couchScores(state);
  return state.players.map((_, seat) => (totals[seat] ?? 0) + (round[seat] ?? 0));
}

/** Everything once the round is over: who it was, the word, how it went. */
export function couchReveal(state: CouchState): {
  impostors: number[];
  word: string;
  meanings: Meanings;
  twin: { word: string; meanings: Meanings } | null;
  accused: number | null;
  caught: boolean;
  guessed: string | null;
  votes: Array<number | null>;
  endedBy: CouchEnd;
  /** why the impostors got away; null when the first was caught */
  escape: CouchEscape | null;
  /** the second vote in a round with two impostors once the first was caught: whom it landed on, and each vote by seat */
  second: { accused: number | null; caught: boolean; votes: Array<{ seat: number; for: number | null }> } | null;
  /** the impostor still hidden at the end, paid for it; null when there is none */
  stillHidden: number | null;
} | null {
  if (state.phase !== 'reveal' || !state.endedBy) return null;
  const other = couchStillHidden(state);
  const second = state.second?.done ? state.second : null;
  // A room that points and names nobody could not agree, like a shared top of private votes.
  const named = state.settings.vote === 'open' || state.votes.some((v) => v !== null);
  const escape: CouchEscape | null = state.endedBy !== 'escaped' ? null : state.accused !== null ? 'wrong-out' : named ? 'tie' : 'no-votes';
  return {
    impostors: [...state.impostors],
    word: state.card.word,
    meanings: state.card.meanings,
    twin: state.settings.way === 'odd' ? state.card.twin : null,
    accused: state.accused,
    caught: state.accused !== null && state.impostors.includes(state.accused),
    guessed: state.guessed === null ? null : (state.options[state.guessed] ?? null),
    votes: [...state.votes],
    endedBy: state.endedBy,
    escape,
    second: second
      ? { accused: second.accused, caught: second.accused === other, votes: second.votes.map((v, i) => ({ seat: second.voters[i]!, for: v })) }
      : null,
    stillHidden: other !== null && second && second.accused !== other ? other : null,
  };
}
