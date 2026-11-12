/**
 * Kurdish Impostor on one phone, passed round a room.
 *
 * The table's own game (rules.ts) is played apart, each on their own screen,
 * with typed clues the server judges. This one is for people sitting together:
 * the phone goes from hand to hand so each can read their card in private,
 * the clues are said out loud, the phone keeps the order and the time, and at
 * the end it takes the votes and turns the cards over.
 *
 * Three ways to play it:
 *   classic — everyone holds the word but the impostor, who is told only the category
 *   blind   — the impostor is told nothing at all
 *   odd     — nobody is told they are the impostor: the odd one out simply holds
 *             a different word of the same category, and has to work it out
 *
 * These are the rules alone, pure: the same state in, the same state out, and
 * every draw (who the impostor is, who speaks first, how the guess is laid
 * out) comes from the seed a round is started with. The cards are approved
 * word cards the server deals in a batch (api/src/games/couch.ts); the players'
 * names never leave the phone.
 *
 * Nothing is paid for a round played this way. The phone that holds every
 * card cannot be the judge of who won, so a round here earns no XP and moves
 * no rating: it is a game for the room, and that is all it is.
 */
import type { Meanings } from '../content.js';
import type { GameDialect } from '../dialect.js';
import { seededUnit } from '../last-letter/rules.js';
import { seededOrder } from '../multi/order.js';
import { IMPOSTOR_GUESS_OPTIONS, IMPOSTOR_POINTS } from './rules.js';

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
/** A vote each casts in private as the phone goes round, or one the room makes together by pointing. */
export const COUCH_VOTES = ['secret', 'open'] as const;
export type CouchVote = (typeof COUCH_VOTES)[number];

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
  /** the category's slug, which its picture is found by; absent from a server that does not say */
  category?: string;
  /** other approved words the caught impostor's guess is chosen among */
  decoys: string[];
  /** another approved word of the same category, for the odd one out; null where the category has no other */
  twin: { word: string; meanings: Meanings } | null;
}

/** How many cards one request for a deck may ask for, and how many it gets when it does not say. */
export const COUCH_DECK_MAX = 20;
export const COUCH_DECK_DEFAULT = 10;

/** A category the game can be played in at one difficulty: its name as the cards give it, and how many cards it has. */
export interface CouchCategory {
  slug: string;
  ku: string;
  meanings: Meanings;
  cards: number;
}

/** Where the game is offered in one variety: each difficulty that has enough approved cards, with its categories. */
export interface CouchOffer {
  dialect: GameDialect;
  difficulties: Array<{ difficulty: 'beginner' | 'intermediate' | 'advanced'; cards: number; categories: CouchCategory[] }>;
}

/** An evening's cards, in the order they are to be played. */
export interface CouchDeck {
  dialect: GameDialect;
  cards: CouchCard[];
}

export type CouchPhase = 'deal' | 'clues' | 'talk' | 'vote' | 'guess' | 'reveal';
/** How a round ends: the impostor got away, was caught, or was caught and named the word. */
export type CouchEnd = 'escaped' | 'caught' | 'guessed';

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
  /** a private vote: each seat's choice in seat order as far as it has got; null for a seat that would not choose */
  votes: Array<number | null>;
  /** the seat the room voted out, once counted; null when it could not agree */
  accused: number | null;
  /** the option the caught impostor chose */
  guessed: number | null;
  endedBy: CouchEnd | null;
}

/** What a seat's card shows when it is turned up. */
/** The category a card shows: its name, what that means, and the slug its picture is found by where the server said it. */
export interface CouchHint {
  ku: string;
  meanings: Meanings;
  category?: string;
}

export type CouchHand = { role: 'player'; word: string; meanings: Meanings; hint: CouchHint } | { role: 'impostor'; hint: CouchHint | null };

export type CouchNameSlip = 'too-few' | 'too-many' | 'empty' | 'same';

/** A name as it is kept: one line, no control characters, trimmed to what fits. */
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

/** What a phone keeps from one evening to the next: who played, and how the game was set. Never a card, never a score. */
export interface CouchKept {
  names: string[];
  settings: CouchSettings;
}

/**
 * What a phone kept, read back: the names it finds, each as `couchName` would
 * keep it, and every setting that is still one of the game's own, the rest as
 * a new game has them. Anything that is not the shape it wrote is no memory at
 * all, so a value another version or another hand left there cannot set up a
 * game the rules do not have.
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

/** The settings a room of this size and this card can be played with: what does not fit falls back to the plain game. */
export function couchSettingsFor(players: number, card: Pick<CouchCard, 'twin'> | null, wanted: CouchSettings): CouchSettings {
  const settings = { ...wanted };
  if (players < COUCH_TWO_IMPOSTORS_FROM) settings.impostors = 1;
  if (settings.way === 'odd' && card && !card.twin) settings.way = 'classic';
  return settings;
}

/** A round, dealt: the impostors, the order and the guess's layout all drawn from the seed. */
export function couchStart(dialect: GameDialect, players: readonly string[], wanted: CouchSettings, card: CouchCard, seed: string): CouchState {
  const settings = couchSettingsFor(players.length, card, wanted);
  const seats = players.map((_, i) => i);
  return {
    dialect,
    players: [...players],
    settings,
    card: { ...card, decoys: [...card.decoys] },
    options: seededOrder(seed, 'options', [card.word, ...card.decoys].slice(0, IMPOSTOR_GUESS_OPTIONS)),
    impostors: seededOrder(seed, 'impostor', seats)
      .slice(0, settings.impostors)
      .sort((a, b) => a - b),
    // the speaking order starts from a seat drawn by the seed and goes round the room from there, as people sit
    order: seats.map((_, i) => (i + Math.floor(seededUnit(seed, 'first') * seats.length)) % seats.length),
    phase: 'deal',
    dealt: 0,
    turn: 0,
    votes: [],
    accused: null,
    guessed: null,
    endedBy: null,
  };
}

/** A seat's card, as its holder alone should see it. In the odd-word game the odd one's card looks like anyone's. */
export function couchHand(state: CouchState, seat: number): CouchHand {
  const hint: CouchHint = { ku: state.card.hint.ku, meanings: state.card.hint.meanings, category: state.card.category };
  if (!state.impostors.includes(seat)) return { role: 'player', word: state.card.word, meanings: state.card.meanings, hint };
  if (state.settings.way === 'odd' && state.card.twin) return { role: 'player', word: state.card.twin.word, meanings: state.card.twin.meanings, hint };
  return { role: 'impostor', hint: state.settings.way === 'classic' ? hint : null };
}

/** The seat whose card is to be read now, while the phone goes round; null once everyone has. */
export function couchReader(state: CouchState): number | null {
  return state.phase === 'deal' && state.dealt < state.players.length ? state.dealt : null;
}

/** The reader has read their card and hidden it again: on to the next, or to the clues. */
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

/** The clue is said (or its time ran out): the next speaker, or the talk, or straight to the vote. */
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
  return state.phase === 'vote' && state.settings.vote === 'secret' && state.votes.length < state.players.length ? state.votes.length : null;
}

function finish(state: CouchState, endedBy: CouchEnd): CouchState {
  return { ...state, phase: 'reveal', endedBy };
}

/** The room has chosen (or failed to): what follows. */
function accuse(state: CouchState, accused: number | null): CouchState {
  const next = { ...state, accused };
  if (accused === null || !state.impostors.includes(accused)) return finish(next, 'escaped');
  // the odd one out never knew: there is no word for them to name
  if (state.settings.way === 'odd') return finish(next, 'caught');
  return { ...next, phase: 'guess' };
}

/** One private vote, for a seat other than the voter's own, or for nobody. */
export function couchCastVote(state: CouchState, suspect: number | null): CouchState {
  const voter = couchVoter(state);
  if (voter === null) return state;
  if (suspect !== null && (suspect === voter || !Number.isInteger(suspect) || suspect < 0 || suspect >= state.players.length)) return state;
  const next = { ...state, votes: [...state.votes, suspect] };
  if (next.votes.length < next.players.length) return next;
  const tally = new Map<number, number>();
  for (const v of next.votes) if (v !== null) tally.set(v, (tally.get(v) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  // nobody chose, or two share the top: the room could not agree
  return accuse(next, !top || (ranked[1] && ranked[1][1] === top[1]) ? null : top[0]);
}

/** The room's own choice, made by pointing: one seat, or nobody when it cannot agree. */
export function couchPoint(state: CouchState, suspect: number | null): CouchState {
  if (state.phase !== 'vote' || state.settings.vote !== 'open') return state;
  if (suspect !== null && (!Number.isInteger(suspect) || suspect < 0 || suspect >= state.players.length)) return state;
  return accuse(state, suspect);
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
  return scores;
}

/** The evening's running totals with a finished round added. */
export function couchTotals(totals: readonly number[], state: CouchState): number[] {
  const round = couchScores(state);
  return state.players.map((_, seat) => (totals[seat] ?? 0) + (round[seat] ?? 0));
}

/** Everything, once the round is over: who it was, the word, how it went. */
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
} | null {
  if (state.phase !== 'reveal' || !state.endedBy) return null;
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
  };
}
