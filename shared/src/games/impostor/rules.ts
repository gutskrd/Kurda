/**
 * Kurdish Impostor: everyone at the table is dealt the same Kurdish word —
 * except one secret impostor, whose card shows only the category it belongs
 * to. In two rounds each player in turn gives one short clue in Kurdish, which
 * must not say the word; then everyone votes for who they think the impostor
 * is. A caught impostor gets one guess at the word from four options. The
 * reveal shows the word, what it means and every clue.
 *
 * These are the rules alone, pure (shared/src/games/multi/rules.ts). The card
 * and the three other words the guess is chosen from are dealt on the server
 * from approved word cards of the lobby's variety and difficulty, before the
 * game starts (api/src/mp/games/impostor.ts), and handed to `init` in the
 * settings; whether a clue may be shown at all is the free-text gate's.
 *
 * What is hidden, and from whom:
 * - the word, its meaning and the other options are never in the impostor's
 *   view until the impostor is caught and guesses (the options then; the word
 *   only at the reveal);
 * - who the impostor is is in nobody's view but the impostor's own (as "you
 *   are the impostor") until the vote catches them or the game is revealed;
 * - how anyone voted is in nobody's view before the reveal, only who has
 *   voted.
 *
 * A clue that says the word is refused, for everyone but the impostor: a
 * refusal would tell the impostor they had guessed the word. Their clue is
 * shown as written, and a clue that says the word gives its writer away.
 */
import { sameClue, saysBanned, textSlip, type TextLimits, type TextSlip } from '../clues.js';
import type { Meanings } from '../content.js';
import type { GameDialect } from '../dialect.js';
import type { GameDifficulty } from '../solo.js';
import { seededUnit } from '../last-letter/rules.js';
import type { ApplyResult, GameRules, Placed, RulesSeat, RulesStart } from '../multi/rules.js';
import { seededOrder } from '../multi/order.js';

export const IMPOSTOR_MIN_PLAYERS = 3;
export const IMPOSTOR_MAX_PLAYERS = 8;
/** Each player gives this many clues: one a round. */
export const IMPOSTOR_CLUE_ROUNDS = 2;
/** The time a host may give a clue: from quick to unhurried. */
export const IMPOSTOR_CLUE_SECONDS = [20, 30, 45, 60] as const;
export type ImpostorClueSeconds = (typeof IMPOSTOR_CLUE_SECONDS)[number];
export const IMPOSTOR_DEFAULT_CLUE_SECONDS: ImpostorClueSeconds = 30;
/** The first speaker reads their card first: their turn is this much longer. */
export const IMPOSTOR_FIRST_TURN_EXTRA_MS = 8_000;
export const IMPOSTOR_VOTE_MS = 45_000;
export const IMPOSTOR_GUESS_MS = 25_000;
/** The caught impostor's choice: the word and this many others, less one. */
export const IMPOSTOR_GUESS_OPTIONS = 4;
/** One clue: a word or a few, never a sentence that explains. */
export const IMPOSTOR_CLUE_LIMITS: TextLimits = { maxChars: 40, maxWords: 4 };

/** Points: a vote for the impostor; the impostor not caught; caught but naming the word; the table catching them. */
export const IMPOSTOR_POINTS = { rightVote: 1, escaped: 3, guessedWord: 2, caught: 2 } as const;

/** The card everyone but the impostor is dealt, as the server took it from an approved word card. */
export interface ImpostorCard {
  word: string;
  meanings: Meanings;
  /** other forms of the word a clue may not say either */
  forms: string[];
  /** what the impostor is told instead: the category, in Kurdish, with its meaning */
  hint: { ku: string; meanings: Meanings };
}

/** What the server deals before the start: the card, and the other words the guess is chosen from. */
export interface ImpostorDeal {
  card: ImpostorCard;
  /** IMPOSTOR_GUESS_OPTIONS − 1 other approved words, of the same category where it has enough */
  decoys: string[];
}

export interface ImpostorSettings {
  dialect: GameDialect;
  difficulty: GameDifficulty;
  clueSeconds: ImpostorClueSeconds;
  /** the category the word is drawn from, by its slug; null or absent for any */
  category?: string | null;
  /** dealt on the server at the start; never stored with the lobby, never in a view */
  deal?: ImpostorDeal;
}

export type ImpostorMove = { kind: 'clue'; text: string } | { kind: 'vote'; seat: number } | { kind: 'guess'; option: number };

/** Why a move was refused: a clue's slip, or a vote or guess that is not open. */
export type ImpostorRefusal = TextSlip | 'says-word' | 'repeat' | 'not-your-turn' | 'not-now' | 'bad-vote' | 'bad-option' | 'finished';

/** What the mover is told. */
export type ImpostorOutcome = { kind: 'clue' } | { kind: 'vote'; seat: number } | { kind: 'guess'; right: boolean };

export type ImpostorPhase = 'clues' | 'vote' | 'guess' | 'reveal';

export type ImpostorEnd = 'escaped' | 'caught' | 'guessed' | 'impostor-left' | 'too-few' | 'abandoned';

interface SeatState {
  seat: number;
  left: boolean;
}

interface Clue {
  round: number;
  seat: number;
  /** null when the turn passed without one (the time ran out, the player was away or left) */
  text: string | null;
}

export interface ImpostorState {
  dialect: GameDialect;
  clueMs: number;
  card: ImpostorCard;
  /** the guess's options, shuffled, the word among them */
  options: string[];
  impostor: number;
  seats: SeatState[];
  /** who speaks when, the same in both rounds */
  order: number[];
  phase: ImpostorPhase;
  turn: { seat: number; round: number; n: number; startedAt: number; endsAt: number } | null;
  clues: Clue[];
  /** each vote cast; null for a seat whose time ran out without one */
  votes: Array<{ seat: number; for: number | null }>;
  voting: { startedAt: number; endsAt: number } | null;
  /** the seat the table voted out (the most votes, alone at the top), once counted */
  accused: { seat: number; votes: number } | null;
  guessing: { startedAt: number; endsAt: number } | null;
  /** the option the impostor chose, or null for none */
  guessed: number | null;
  finishedAt: number | null;
  endedBy: ImpostorEnd | null;
}

/** The card as the viewer holds it: the word, or that they are the impostor. */
export type ImpostorHand = { role: 'player'; word: string; meanings: Meanings } | { role: 'impostor' };

export interface ImpostorBoard {
  dialect: GameDialect;
  phase: ImpostorPhase;
  rounds: number;
  /** the category, which everyone is shown */
  hint: { ku: string; meanings: Meanings };
  /** the viewer's own card; null for someone not playing */
  hand: ImpostorHand | null;
  order: number[];
  turn: { seat: number; round: number; n: number; startedAt: string; endsAt: string } | null;
  clues: Clue[];
  /** while the table votes: who has voted (never for whom), and the viewer's own vote */
  vote: { startedAt: string; endsAt: string; voted: number[]; mine: number | null } | null;
  /** the seat the vote landed on, once counted (when it was the impostor, they are caught) */
  accused: { seat: number; votes: number } | null;
  /** the caught impostor's guess: the options, which the whole table watches */
  guess: { seat: number; startedAt: string; endsAt: string; options: string[] } | null;
  /** once the game is over: everything */
  reveal: {
    impostor: number;
    word: string;
    meanings: Meanings;
    caught: boolean;
    guessed: string | null;
    guessedRight: boolean;
    votes: Array<{ seat: number; for: number | null }>;
  } | null;
  seats: Array<{ seat: number; left: boolean; score: number | null }>;
  /** the viewer's clue is awaited now */
  yourTurn: boolean;
  /** the viewer has a vote to cast now */
  yourVote: boolean;
  /** the viewer is the caught impostor, and may guess now */
  yourGuess: boolean;
  endedBy: ImpostorEnd | null;
}

function clone(s: ImpostorState): ImpostorState {
  return {
    ...s,
    seats: s.seats.map((x) => ({ ...x })),
    order: [...s.order],
    turn: s.turn ? { ...s.turn } : null,
    clues: s.clues.map((c) => ({ ...c })),
    votes: s.votes.map((v) => ({ ...v })),
    voting: s.voting ? { ...s.voting } : null,
    accused: s.accused ? { ...s.accused } : null,
    guessing: s.guessing ? { ...s.guessing } : null,
  };
}

const present = (s: ImpostorState): SeatState[] => s.seats.filter((x) => !x.left);
const isIn = (s: ImpostorState, seat: number): boolean => s.seats.some((x) => x.seat === seat && !x.left);

function finish(s: ImpostorState, now: number, why: ImpostorEnd): void {
  s.phase = 'reveal';
  s.turn = null;
  s.voting = null;
  s.guessing = null;
  s.finishedAt = now;
  s.endedBy = why;
}

/** The clue turn after `n` (0 before the first), or the vote once every clue is in. */
function nextTurn(s: ImpostorState, now: number, after: number): void {
  const total = s.order.length * IMPOSTOR_CLUE_ROUNDS;
  for (let n = after + 1; n <= total; n++) {
    const seat = s.order[(n - 1) % s.order.length]!;
    const round = Math.floor((n - 1) / s.order.length) + 1;
    if (!isIn(s, seat)) {
      s.clues.push({ round, seat, text: null });
      continue;
    }
    const length = s.clueMs + (n === 1 ? IMPOSTOR_FIRST_TURN_EXTRA_MS : 0);
    s.turn = { seat, round, n, startedAt: now, endsAt: now + length };
    return;
  }
  s.turn = null;
  s.phase = 'vote';
  s.voting = { startedAt: now, endsAt: now + IMPOSTOR_VOTE_MS };
}

/** Seats with a vote still to cast. */
function toVote(s: ImpostorState): number[] {
  return present(s)
    .map((x) => x.seat)
    .filter((seat) => !s.votes.some((v) => v.seat === seat));
}

/** Every vote is in: who the table chose, and what follows. */
function count(s: ImpostorState, now: number): void {
  const tally = new Map<number, number>();
  for (const v of s.votes) if (v.for !== null) tally.set(v.for, (tally.get(v.for) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  // nobody voted, or a tie at the top: the table could not agree, and the impostor slips away
  if (!top || (ranked[1] && ranked[1][1] === top[1])) {
    s.accused = null;
    return finish(s, now, 'escaped');
  }
  s.accused = { seat: top[0], votes: top[1] };
  if (top[0] !== s.impostor) return finish(s, now, 'escaped');
  if (!isIn(s, s.impostor)) return finish(s, now, 'impostor-left');
  s.voting = null;
  s.phase = 'guess';
  s.guessing = { startedAt: now, endsAt: now + IMPOSTOR_GUESS_MS };
}

/** Whether the impostor was caught: the vote landed on them. */
function caught(s: ImpostorState): boolean {
  return s.accused?.seat === s.impostor;
}

function guessedRight(s: ImpostorState): boolean {
  return s.guessed !== null && s.options[s.guessed] === s.card.word;
}

/** Each seat's points once the game is over (see IMPOSTOR_POINTS). */
export function impostorScores(s: ImpostorState): Map<number, number> {
  const scores = new Map(s.seats.map((x) => [x.seat, 0]));
  const add = (seat: number, n: number): void => {
    scores.set(seat, (scores.get(seat) ?? 0) + n);
  };
  if (s.endedBy === 'abandoned' || s.endedBy === 'too-few') return scores;
  for (const v of s.votes) if (v.for === s.impostor && v.seat !== s.impostor) add(v.seat, IMPOSTOR_POINTS.rightVote);
  if (s.endedBy === 'impostor-left') return scores;
  if (!caught(s)) add(s.impostor, IMPOSTOR_POINTS.escaped);
  else if (guessedRight(s)) add(s.impostor, IMPOSTOR_POINTS.guessedWord);
  else for (const x of s.seats) if (x.seat !== s.impostor && !x.left) add(x.seat, IMPOSTOR_POINTS.caught);
  return scores;
}

/**
 * Whether a finished game counted: the table played it out to a vote, an
 * escape or a guess. Called off with every person gone, with too few left to
 * hide among, or with the impostor gone, it did not: nobody wins a game like
 * that, so it pays no placement and is not rated.
 */
export function impostorCounted(s: Pick<ImpostorState, 'finishedAt' | 'endedBy'>): boolean {
  return s.finishedAt !== null && s.endedBy !== 'abandoned' && s.endedBy !== 'too-few' && s.endedBy !== 'impostor-left';
}

/** What a clue would be refused for, judged as the rules judge it (the server again, always). */
export function impostorClueRefusal(
  s: Pick<ImpostorState, 'dialect' | 'card' | 'impostor' | 'clues'>,
  seat: number,
  text: string,
): ImpostorRefusal | null {
  const slip = textSlip(text, s.dialect, IMPOSTOR_CLUE_LIMITS);
  if (slip) return slip;
  if (seat !== s.impostor && saysBanned(text, s.dialect, [s.card.word, ...s.card.forms])) return 'says-word';
  if (s.clues.some((c) => c.text !== null && sameClue(c.text, text, s.dialect))) return 'repeat';
  return null;
}

/** A clue box's own check, for a player who holds the word (the impostor's box checks only the slips). */
export function impostorClueSlip(
  board: Pick<ImpostorBoard, 'dialect' | 'hand' | 'clues'>,
  text: string,
): ImpostorRefusal | null {
  if (!text.trim()) return null;
  const slip = textSlip(text, board.dialect, IMPOSTOR_CLUE_LIMITS);
  if (slip) return slip;
  if (board.hand?.role === 'player' && saysBanned(text, board.dialect, [board.hand.word])) return 'says-word';
  if (board.clues.some((c) => c.text !== null && sameClue(c.text, text, board.dialect))) return 'repeat';
  return null;
}

export const impostorRules: GameRules<ImpostorState, ImpostorMove, ImpostorSettings, ImpostorBoard, ImpostorOutcome> = {
  init(settings: ImpostorSettings, seats: readonly RulesSeat[], start: RulesStart): ImpostorState {
    const deal = settings.deal;
    const people = seats.filter((x) => x.bot === null);
    const card: ImpostorCard = deal?.card ?? { word: '', meanings: { en: '' }, forms: [], hint: { ku: '', meanings: { en: '' } } };
    const impostor = people[Math.floor(seededUnit(start.seed, 'impostor') * people.length)]?.seat ?? seats[0]?.seat ?? 0;
    const state: ImpostorState = {
      dialect: settings.dialect,
      clueMs: settings.clueSeconds * 1000,
      card,
      options: seededOrder(start.seed, 'options', [card.word, ...(deal?.decoys ?? [])].slice(0, IMPOSTOR_GUESS_OPTIONS)),
      impostor,
      seats: people.map((x) => ({ seat: x.seat, left: false })),
      order: seededOrder(
        start.seed,
        'order',
        people.map((x) => x.seat),
      ),
      phase: 'clues',
      turn: null,
      clues: [],
      votes: [],
      voting: null,
      accused: null,
      guessing: null,
      guessed: null,
      finishedAt: null,
      endedBy: null,
    };
    // a deal that never came, or too few people: nothing to play
    if (!deal || people.length < IMPOSTOR_MIN_PLAYERS) {
      finish(state, start.now, 'too-few');
      return state;
    }
    nextTurn(state, start.now, 0);
    return state;
  },

  apply(state: ImpostorState, seat: number, move: ImpostorMove, now: number): ApplyResult<ImpostorState, ImpostorOutcome> {
    if (state.finishedAt !== null) return { ok: false, reason: 'finished' };
    if (!isIn(state, seat)) return { ok: false, reason: 'not-now' };
    if (move.kind === 'clue') {
      if (state.phase !== 'clues' || !state.turn) return { ok: false, reason: 'not-now' };
      if (state.turn.seat !== seat) return { ok: false, reason: 'not-your-turn' };
      const refusal = impostorClueRefusal(state, seat, move.text);
      if (refusal) return { ok: false, reason: refusal };
      const next = clone(state);
      next.clues.push({ round: next.turn!.round, seat, text: move.text.normalize('NFC').trim().replace(/\s+/g, ' ') });
      nextTurn(next, now, next.turn!.n);
      return { ok: true, state: next, outcome: { kind: 'clue' } };
    }
    if (move.kind === 'vote') {
      if (state.phase !== 'vote') return { ok: false, reason: 'not-now' };
      if (!toVote(state).includes(seat)) return { ok: false, reason: 'not-now' };
      if (move.seat === seat || !isIn(state, move.seat)) return { ok: false, reason: 'bad-vote' };
      const next = clone(state);
      next.votes.push({ seat, for: move.seat });
      if (toVote(next).length === 0) count(next, now);
      return { ok: true, state: next, outcome: { kind: 'vote', seat: move.seat } };
    }
    if (state.phase !== 'guess' || seat !== state.impostor) return { ok: false, reason: 'not-now' };
    if (!Number.isInteger(move.option) || move.option < 0 || move.option >= state.options.length) return { ok: false, reason: 'bad-option' };
    const next = clone(state);
    next.guessed = move.option;
    finish(next, now, guessedRight(next) ? 'guessed' : 'caught');
    return { ok: true, state: next, outcome: { kind: 'guess', right: guessedRight(next) } };
  },

  waitingFor(state: ImpostorState): number[] {
    if (state.finishedAt !== null) return [];
    if (state.phase === 'clues') return state.turn ? [state.turn.seat] : [];
    if (state.phase === 'vote') return toVote(state);
    if (state.phase === 'guess') return [state.impostor];
    return [];
  },

  dueAt(state: ImpostorState): number | null {
    if (state.finishedAt !== null) return null;
    if (state.phase === 'clues') return state.turn?.endsAt ?? null;
    if (state.phase === 'vote') return state.voting?.endsAt ?? null;
    if (state.phase === 'guess') return state.guessing?.endsAt ?? null;
    return null;
  },

  timeout(state: ImpostorState, seats: readonly number[], now: number): ImpostorState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    if (next.phase === 'clues' && next.turn && seats.includes(next.turn.seat)) {
      next.clues.push({ round: next.turn.round, seat: next.turn.seat, text: null });
      nextTurn(next, now, next.turn.n);
      return next;
    }
    if (next.phase === 'vote') {
      const waiting = toVote(next).filter((seat) => seats.includes(seat));
      if (waiting.length === 0) return state;
      for (const seat of waiting) next.votes.push({ seat, for: null });
      if (toVote(next).length === 0) count(next, now);
      return next;
    }
    if (next.phase === 'guess' && seats.includes(next.impostor)) {
      finish(next, now, 'caught');
      return next;
    }
    return state;
  },

  drop(state: ImpostorState, seat: number, now: number): ImpostorState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    const s = next.seats.find((x) => x.seat === seat);
    if (!s || s.left) return state;
    s.left = true;
    if (seat === next.impostor) {
      finish(next, now, 'impostor-left');
      return next;
    }
    // too few left to hide among; once the impostor is caught, the guess still stands
    if (next.phase !== 'guess' && present(next).length < IMPOSTOR_MIN_PLAYERS) {
      finish(next, now, 'too-few');
      return next;
    }
    if (next.phase === 'clues' && next.turn?.seat === seat) {
      next.clues.push({ round: next.turn.round, seat, text: null });
      nextTurn(next, now, next.turn.n);
    } else if (next.phase === 'vote' && toVote(next).length === 0) {
      count(next, now);
    }
    return next;
  },

  end(state: ImpostorState, now: number): ImpostorState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    finish(next, now, 'abandoned');
    return next;
  },

  finished(state: ImpostorState): boolean {
    return state.finishedAt !== null;
  },

  counted(state: ImpostorState): boolean {
    return impostorCounted(state);
  },

  viewFor(state: ImpostorState, seat: number | null, hidden: readonly number[] = []): ImpostorBoard {
    const over = state.finishedAt !== null;
    const playing = seat !== null && state.seats.some((x) => x.seat === seat);
    const scores = over ? impostorScores(state) : null;
    const hand: ImpostorHand | null = !playing
      ? null
      : seat === state.impostor
        ? { role: 'impostor' }
        : { role: 'player', word: state.card.word, meanings: state.card.meanings };
    const iso = (ms: number): string => new Date(ms).toISOString();
    return {
      dialect: state.dialect,
      phase: state.phase,
      rounds: IMPOSTOR_CLUE_ROUNDS,
      hint: { ku: state.card.hint.ku, meanings: state.card.hint.meanings },
      hand,
      order: [...state.order],
      turn: state.turn ? { seat: state.turn.seat, round: state.turn.round, n: state.turn.n, startedAt: iso(state.turn.startedAt), endsAt: iso(state.turn.endsAt) } : null,
      // a clue the viewer may not be shown reads as a turn that passed without one
      clues: state.clues.map((c) => ({ ...c, text: hidden.includes(c.seat) ? null : c.text })),
      vote:
        state.phase === 'vote' && state.voting
          ? {
              startedAt: iso(state.voting.startedAt),
              endsAt: iso(state.voting.endsAt),
              voted: state.votes.map((v) => v.seat),
              mine: state.votes.find((v) => v.seat === seat)?.for ?? null,
            }
          : null,
      accused: state.accused && (state.phase === 'guess' || over) ? { ...state.accused } : null,
      guess:
        state.phase === 'guess' && state.guessing
          ? { seat: state.impostor, startedAt: iso(state.guessing.startedAt), endsAt: iso(state.guessing.endsAt), options: [...state.options] }
          : null,
      reveal: over
        ? {
            impostor: state.impostor,
            word: state.card.word,
            meanings: state.card.meanings,
            caught: caught(state),
            guessed: state.guessed === null ? null : (state.options[state.guessed] ?? null),
            guessedRight: guessedRight(state),
            votes: state.votes.map((v) => ({ ...v })),
          }
        : null,
      seats: state.seats.map((x) => ({ seat: x.seat, left: x.left, score: scores ? (scores.get(x.seat) ?? 0) : null })),
      yourTurn: !over && state.phase === 'clues' && state.turn?.seat === seat,
      yourVote: !over && state.phase === 'vote' && seat !== null && toVote(state).includes(seat),
      yourGuess: !over && state.phase === 'guess' && seat === state.impostor,
      endedBy: state.endedBy,
    };
  },

  places(state: ImpostorState): readonly Placed[] {
    const scores = impostorScores(state);
    const rank = (list: SeatState[]): SeatState[] => [...list].sort((a, b) => (scores.get(b.seat) ?? 0) - (scores.get(a.seat) ?? 0) || a.seat - b.seat);
    // still at the table first, by points; then those who left
    const ordered = [...rank(state.seats.filter((x) => !x.left)), ...rank(state.seats.filter((x) => x.left))];
    const placed: Placed[] = [];
    ordered.forEach((x, i) => {
      const prev = ordered[i - 1];
      const score = scores.get(x.seat) ?? 0;
      const tie = prev && prev.left === x.left && (scores.get(prev.seat) ?? 0) === score;
      placed.push({ seat: x.seat, place: tie ? placed[i - 1]!.place : i + 1, score });
    });
    return placed;
  },
};
