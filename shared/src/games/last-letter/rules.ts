/**
 * The Last Letter: a word chain. Each player in turn gives a word that begins
 * with the letter the last word ended with, in the game's one dialect, before
 * their time runs out. A word that is not in the dictionary, does not begin
 * with the right letter, was already played or is not one word costs a strike,
 * and so does letting the time run out; the turn passes either way. Three
 * strikes and you are out; the last player standing wins.
 *
 * These are the rules alone, pure (shared/src/games/multi/rules.ts): whether a
 * word is in the dictionary, and its meaning, are decided on the server before
 * a move reaches `apply` (api/src/mp/games/last-letter.ts), and Hevalo's words
 * are chosen there too. Everything else — whose turn it is, the letter, the
 * repeats, the strikes, the end and the places — is decided here.
 *
 * Nothing in a Last Letter game is hidden, but one thing is never shown: what
 * a player typed that was refused. Other players see the strike and its reason
 * ("not in the dictionary"), never the text, which goes back to the player who
 * typed it alone.
 */
import { beginsWith, nextLetter, startSpellings, type LetterDialect } from '../letters.js';
import type { ApplyResult, GameRules, Placed, RulesSeat, RulesStart } from '../multi/rules.js';

export const LAST_LETTER_MIN_PLAYERS = 2;
export const LAST_LETTER_MAX_PLAYERS = 6;
export const LAST_LETTER_MAX_STRIKES = 3;
/** A chain this long ends the game: the fewest strikes, then the most words, win. */
export const LAST_LETTER_MAX_CHAIN = 80;
/** The turn times a host may choose; the first is the default for a new player, the middle one otherwise. */
export const LAST_LETTER_TURN_SECONDS = [20, 30, 45] as const;
export type LastLetterTurnSeconds = (typeof LAST_LETTER_TURN_SECONDS)[number];
export const LAST_LETTER_DEFAULT_TURN_SECONDS: LastLetterTurnSeconds = 30;
/** How long Hevalo takes over a word, at least and at most: long enough to read as thinking. */
export const HEVALO_THINK_MS = [1_400, 3_200] as const;

export interface LastLetterSettings {
  dialect: LetterDialect;
  turnSeconds: LastLetterTurnSeconds;
}

/** Why a word was refused, or the time ran out. */
export type LastLetterStrikeReason = 'not-a-word' | 'wrong-letter' | 'used' | 'not-allowed' | 'not-one-word' | 'time' | 'gone';

/**
 * A word as the server prepared it for `apply`: the dictionary's verdict, and
 * the meaning when an admin's curated entry gives one.
 */
export interface LastLetterMove {
  /** the word in the dialect's letters (`wordKey`), or null when what was typed is not one word of the dialect */
  key: string | null;
  verdict: 'ok' | 'not-a-word' | 'not-allowed';
  meaning: string | null;
}

/** What the player who moved is told. */
export interface LastLetterOutcome {
  accepted: boolean;
  reason: LastLetterStrikeReason | null;
  strikes: number;
  out: boolean;
}

interface SeatState {
  seat: number;
  bot: string | null;
  strikes: number;
  words: number;
  /** the order seats went out in (1 = first out); null while still in */
  outOrder: number | null;
  /** went out by leaving, not by strikes */
  left: boolean;
}

interface ChainWord {
  seat: number;
  word: string;
  meaning: string | null;
  at: number;
}

interface Strike {
  seat: number;
  reason: LastLetterStrikeReason;
  /** the turn it was given on, so a client can tell one buzz from the next */
  turn: number;
}

export interface LastLetterState {
  dialect: LetterDialect;
  turnMs: number;
  seed: string;
  seats: SeatState[];
  turn: { seat: number; n: number; startedAt: number; endsAt: number } | null;
  chain: ChainWord[];
  /** the most recent strikes, newest last */
  strikes: Strike[];
  outs: number;
  finishedAt: number | null;
  endedBy: 'last-standing' | 'chain-full' | 'abandoned' | null;
}

/** One word of the chain as everyone sees it. */
export interface LastLetterChainWord {
  /** where it is in the chain, from 1 */
  n: number;
  seat: number;
  word: string;
  meaning: string | null;
}

export interface LastLetterBoard {
  dialect: LetterDialect;
  turnSeconds: number;
  maxStrikes: number;
  turn: { seat: number; n: number; startedAt: string; endsAt: string } | null;
  /** the letter the next word must begin with (null for the first word, which may begin with any) */
  required: string | null;
  /** how a word beginning with it is written at its start (Soranî: ا is written ئا) */
  requiredSpellings: string[];
  /** the whole chain, oldest first */
  chain: LastLetterChainWord[];
  seats: Array<{ seat: number; strikes: number; words: number; out: boolean; left: boolean; bot: string | null }>;
  /** the last few strikes, newest last: the reason only, never what was typed */
  strikes: Strike[];
  /** this viewer's turn now */
  yourTurn: boolean;
  endedBy: LastLetterState['endedBy'];
}

const KEEP_STRIKES = 8;

/** A number in [0, 1) from the game's seed and a salt: Hevalo's choices, the same on every replica. */
export function seededUnit(seed: string, salt: string | number): number {
  // FNV-1a over the seed and the salt, then one round of mixing
  let h = 0x811c9dc5;
  const s = `${seed}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 0x1_0000_0000;
}

/** How long Hevalo thinks over turn `n`. */
export function hevaloThinkMs(seed: string, n: number): number {
  const [lo, hi] = HEVALO_THINK_MS;
  return Math.round(lo + (hi - lo) * seededUnit(seed, `think:${n}`));
}

/**
 * Whether Hevalo, on turn `n`, cannot think of a word even though one exists:
 * more often as the chain grows, so a long game against Hevalo can be won. A
 * miss is a strike like anyone's.
 */
export function hevaloMisses(seed: string, n: number, chainLength: number): boolean {
  const chance = Math.min(0.35, 0.05 + 0.012 * chainLength);
  return seededUnit(seed, `miss:${n}`) < chance;
}

function inGame(s: SeatState): boolean {
  return s.outOrder === null;
}

function clone(state: LastLetterState): LastLetterState {
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s })),
    turn: state.turn ? { ...state.turn } : null,
    chain: [...state.chain],
    strikes: [...state.strikes],
  };
}

/** The letter the next word must begin with, as a chain compares letters; null before the first word. */
export function requiredLetter(state: Pick<LastLetterState, 'dialect' | 'chain'>): string | null {
  const last = state.chain[state.chain.length - 1];
  return last ? nextLetter(state.dialect, last.word) : null;
}

function turnLength(state: LastLetterState, seat: number, n: number): number {
  const s = state.seats.find((x) => x.seat === seat);
  return s?.bot ? hevaloThinkMs(state.seed, n) : state.turnMs;
}

/** The turn after the current one, or the end of the game when one player (or none) is left. */
function nextTurn(state: LastLetterState, now: number): void {
  const left = state.seats.filter(inGame);
  if (state.chain.length >= LAST_LETTER_MAX_CHAIN) return finish(state, now, 'chain-full');
  if (left.length <= 1) return finish(state, now, 'last-standing');
  const order = state.seats.map((s) => s.seat);
  const from = state.turn ? order.indexOf(state.turn.seat) : -1;
  for (let step = 1; step <= order.length; step++) {
    const seat = order[(from + step + order.length) % order.length]!;
    if (state.seats.find((s) => s.seat === seat && inGame(s))) {
      const n = (state.turn?.n ?? 0) + 1;
      state.turn = { seat, n, startedAt: now, endsAt: now + turnLength(state, seat, n) };
      return;
    }
  }
  finish(state, now, 'last-standing');
}

function finish(state: LastLetterState, now: number, why: NonNullable<LastLetterState['endedBy']>): void {
  state.turn = null;
  state.finishedAt = now;
  state.endedBy = why;
}

function strike(state: LastLetterState, seat: number, reason: LastLetterStrikeReason): SeatState {
  const s = state.seats.find((x) => x.seat === seat)!;
  s.strikes += 1;
  state.strikes = [...state.strikes, { seat, reason, turn: state.turn?.n ?? 0 }].slice(-KEEP_STRIKES);
  if (s.strikes >= LAST_LETTER_MAX_STRIKES && inGame(s)) {
    state.outs += 1;
    s.outOrder = state.outs;
  }
  return s;
}

export const lastLetterRules: GameRules<LastLetterState, LastLetterMove, LastLetterSettings, LastLetterBoard, LastLetterOutcome> = {
  init(settings: LastLetterSettings, seats: readonly RulesSeat[], start: RulesStart): LastLetterState {
    const state: LastLetterState = {
      dialect: settings.dialect,
      turnMs: settings.turnSeconds * 1000,
      seed: start.seed,
      seats: seats.map((s) => ({ seat: s.seat, bot: s.bot, strikes: 0, words: 0, outOrder: null, left: false })),
      turn: null,
      chain: [],
      strikes: [],
      outs: 0,
      finishedAt: null,
      endedBy: null,
    };
    // who begins is drawn, so the host does not always go first
    const first = state.seats[Math.floor(seededUnit(start.seed, 'first') * state.seats.length)] ?? state.seats[0];
    if (!first) {
      finish(state, start.now, 'last-standing');
      return state;
    }
    state.turn = { seat: first.seat, n: 1, startedAt: start.now, endsAt: start.now + turnLength(state, first.seat, 1) };
    return state;
  },

  apply(state: LastLetterState, seat: number, move: LastLetterMove, now: number): ApplyResult<LastLetterState, LastLetterOutcome> {
    if (state.finishedAt !== null || !state.turn) return { ok: false, reason: 'finished' };
    if (state.turn.seat !== seat) return { ok: false, reason: 'not-your-turn' };
    const next = clone(state);
    const required = requiredLetter(next);
    let reason: LastLetterStrikeReason | null = null;
    if (move.key === null) reason = 'not-one-word';
    else if (required !== null && !beginsWith(next.dialect, move.key, required)) reason = 'wrong-letter';
    else if (next.chain.some((w) => w.word === move.key)) reason = 'used';
    else if (move.verdict !== 'ok') reason = move.verdict;

    let mover: SeatState;
    if (reason) {
      mover = strike(next, seat, reason);
    } else {
      mover = next.seats.find((s) => s.seat === seat)!;
      mover.words += 1;
      next.chain.push({ seat, word: move.key!, meaning: move.meaning, at: now });
    }
    nextTurn(next, now);
    return {
      ok: true,
      state: next,
      outcome: { accepted: reason === null, reason, strikes: mover.strikes, out: mover.outOrder !== null },
    };
  },

  waitingFor(state: LastLetterState): number[] {
    return state.turn && state.finishedAt === null ? [state.turn.seat] : [];
  },

  dueAt(state: LastLetterState): number | null {
    return state.turn && state.finishedAt === null ? state.turn.endsAt : null;
  },

  timeout(state: LastLetterState, seats: readonly number[], now: number): LastLetterState {
    if (!state.turn || state.finishedAt !== null || !seats.includes(state.turn.seat)) return state;
    const next = clone(state);
    strike(next, next.turn!.seat, 'time');
    nextTurn(next, now);
    return next;
  },

  drop(state: LastLetterState, seat: number, now: number): LastLetterState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    const s = next.seats.find((x) => x.seat === seat);
    if (!s || !inGame(s)) return state;
    next.outs += 1;
    s.outOrder = next.outs;
    s.left = true;
    next.strikes = [...next.strikes, { seat, reason: 'gone' as const, turn: next.turn?.n ?? 0 }].slice(-KEEP_STRIKES);
    if (next.turn?.seat === seat || next.seats.filter(inGame).length <= 1) nextTurn(next, now);
    return next;
  },

  end(state: LastLetterState, now: number): LastLetterState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    finish(next, now, 'abandoned');
    return next;
  },

  finished(state: LastLetterState): boolean {
    return state.finishedAt !== null;
  },

  // ended where it stood with everyone gone: nobody played it out
  counted(state: LastLetterState): boolean {
    return state.finishedAt !== null && state.endedBy !== 'abandoned';
  },

  viewFor(state: LastLetterState, seat: number | null): LastLetterBoard {
    const required = requiredLetter(state);
    return {
      dialect: state.dialect,
      turnSeconds: Math.round(state.turnMs / 1000),
      maxStrikes: LAST_LETTER_MAX_STRIKES,
      turn: state.turn
        ? {
            seat: state.turn.seat,
            n: state.turn.n,
            startedAt: new Date(state.turn.startedAt).toISOString(),
            endsAt: new Date(state.turn.endsAt).toISOString(),
          }
        : null,
      required,
      requiredSpellings: required ? startSpellings(state.dialect, required) : [],
      chain: state.chain.map((w, i) => ({ n: i + 1, seat: w.seat, word: w.word, meaning: w.meaning })),
      seats: state.seats.map((s) => ({
        seat: s.seat,
        strikes: s.strikes,
        words: s.words,
        out: s.outOrder !== null,
        left: s.left,
        bot: s.bot,
      })),
      strikes: state.strikes.map((s) => ({ ...s })),
      yourTurn: seat !== null && state.turn?.seat === seat && state.finishedAt === null,
      endedBy: state.endedBy,
    };
  },

  places(state: LastLetterState): readonly Placed[] {
    // still in: fewest strikes, then most words; then the rest, the last out first
    const standing = state.seats
      .filter(inGame)
      .sort((a, b) => a.strikes - b.strikes || b.words - a.words || a.seat - b.seat);
    const out = state.seats.filter((s) => !inGame(s)).sort((a, b) => b.outOrder! - a.outOrder!);
    const placed: Placed[] = [];
    standing.forEach((s, i) => {
      const prev = standing[i - 1];
      const tie = prev && prev.strikes === s.strikes && prev.words === s.words;
      placed.push({ seat: s.seat, place: tie ? placed[i - 1]!.place : i + 1, score: s.words });
    });
    out.forEach((s, i) => placed.push({ seat: s.seat, place: standing.length + i + 1, score: s.words }));
    return placed;
  },
};
