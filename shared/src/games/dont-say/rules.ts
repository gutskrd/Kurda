/**
 * Don't Say the Word!: one player describes a Kurdish word in Kurdish without
 * saying it, or any of the words on its card that may not be said, and their
 * teammates type guesses. A turn lasts a minute; the teams take turns, and the
 * describers within a team take theirs in order. Played in two teams of at
 * least two (four to eight players), or by three together against the card
 * (co-op: each describes twice, everyone guesses for one score).
 *
 * These are the rules alone, pure (shared/src/games/multi/rules.ts). The deck
 * is dealt on the server from approved forbidden-word cards of the lobby's
 * variety and difficulty, before the game starts, and handed to `init` in the
 * settings (api/src/mp/games/dont-say.ts); whether a clue or a guess may be
 * shown at all is the free-text gate's.
 *
 * What is hidden: the card in play — its word and the words that may not be
 * said — is in the describer's view alone. Guessers and the other team see
 * the accepted clues and every guess. A card that is done (guessed, skipped,
 * buzzed or out of time) shows its word to everyone; its forbidden words are
 * shown at the end, when nobody is guessing any more.
 *
 * A clue that says the word, a forbidden word or a form of either is buzzed:
 * the describer's team loses a point and the card is put away. Everyone hears
 * the buzz; nobody but its writer is shown the clue, which would give the card
 * away.
 */
import { guessNames, saysBanned, textSlip, type TextLimits, type TextSlip } from '../clues.js';
import type { Meanings } from '../content.js';
import type { GameDialect } from '../dialect.js';
import type { GameDifficulty } from '../solo.js';
import { seededUnit } from '../last-letter/rules.js';
import type { ApplyResult, GameRules, Placed, RulesSeat, RulesStart } from '../multi/rules.js';
import { seededOrder } from '../multi/order.js';

export const DONT_SAY_MIN_PLAYERS = 3;
export const DONT_SAY_MAX_PLAYERS = 8;
/** Two teams, each of at least this many: one describes, the others guess. */
export const DONT_SAY_TEAMS = 2;
export const DONT_SAY_MIN_TEAM = 2;
/** With exactly this many players the game is played together, against the card. */
export const DONT_SAY_COOP_PLAYERS = 3;
/** Each player describes this many times in a co-op game (once in a team game). */
export const DONT_SAY_COOP_ROUNDS = 2;
/** A co-op table has done well with this many cards guessed per turn. */
export const DONT_SAY_COOP_GOAL_PER_TURN = 1;
export const DONT_SAY_TURN_MS = 60_000;
/** Before a turn's minute starts: the describer reads the card, the guessers get ready. */
export const DONT_SAY_READY_MS = 5_000;
export const DONT_SAY_SKIPS_PER_TURN = 2;
export const DONT_SAY_BUZZ_PENALTY = 1;
export const DONT_SAY_CLUE_LIMITS: TextLimits = { maxChars: 80, maxWords: 12 };
export const DONT_SAY_GUESS_LIMITS: TextLimits = { maxChars: 40, maxWords: 3 };
/** The most a turn keeps of the clues and guesses for the card in play. */
const KEEP_LINES = 30;

/** A card as the server dealt it from an approved forbidden-word card. */
export interface DontSayCard {
  target: string;
  meanings: Meanings;
  forbidden: string[];
  /** other forms of the word and of the forbidden words, refused as well */
  forms: string[];
}

export interface DontSaySettings {
  dialect: GameDialect;
  difficulty: GameDifficulty;
  /** dealt on the server at the start, shuffled; never stored with the lobby, never in a view */
  deck?: DontSayCard[];
}

export type DontSayMode = 'teams' | 'coop';

export type DontSayMove = { kind: 'clue'; text: string } | { kind: 'guess'; text: string } | { kind: 'skip' };

export type DontSayRefusal = TextSlip | 'not-your-turn' | 'not-ready' | 'no-skips' | 'finished';

/** What the mover is told: a buzz names the word the clue said (the describer holds the card). */
export type DontSayOutcome =
  | { kind: 'clue' }
  | { kind: 'buzz'; said: string }
  | { kind: 'skip' }
  | { kind: 'guess'; right: boolean };

export type DontSayResult = 'guessed' | 'buzzed' | 'skipped' | 'time';

export type DontSayEnd = 'turns-done' | 'deck-empty' | 'too-few' | 'abandoned';

interface SeatState {
  seat: number;
  team: number;
  left: boolean;
}

interface Line {
  n: number;
  seat: number;
  text: string;
}

interface Turn {
  n: number;
  seat: number;
  team: number;
  startedAt: number;
  readyAt: number;
  endsAt: number;
  /** the card in play, by its place in the deck; null when the deck ran out */
  card: number | null;
  /** cards drawn this turn, the one in play included */
  drawn: number;
  skips: number;
  clues: Line[];
  guesses: Array<Line & { right: boolean }>;
  lines: number;
}

interface Done {
  turn: number;
  team: number;
  card: number;
  result: DontSayResult;
  /** who guessed it, or who buzzed */
  by: number | null;
}

export interface DontSayState {
  dialect: GameDialect;
  mode: DontSayMode;
  deck: DontSayCard[];
  /** the next card to draw */
  next: number;
  seats: SeatState[];
  /** who describes on each turn, in order */
  order: Array<{ seat: number; team: number }>;
  scores: Record<number, number>;
  turn: Turn | null;
  done: Done[];
  /** the last buzz, for everyone's buzzer: who, and on which turn */
  buzz: { seat: number; turn: number; n: number } | null;
  buzzes: number;
  finishedAt: number | null;
  endedBy: DontSayEnd | null;
}

/** A team as everyone sees it. */
export interface DontSayTeam {
  team: number;
  seats: number[];
  score: number;
}

export interface DontSayBoard {
  dialect: GameDialect;
  mode: DontSayMode;
  teams: DontSayTeam[];
  turn: { n: number; of: number; seat: number; team: number; startedAt: string; readyAt: string; endsAt: string } | null;
  /** what the viewer does this turn */
  role: 'describer' | 'guesser' | 'watcher' | null;
  /** the card in play: the describer's alone */
  card: { target: string; meanings: Meanings; forbidden: string[] } | null;
  /** cards drawn this turn, so a stack can be drawn with the right height; says nothing about them */
  drawn: number;
  /** the describer's skips left this turn */
  skipsLeft: number | null;
  /** the accepted clues for the card in play */
  clues: Line[];
  /** the guesses for the card in play */
  guesses: Array<Line & { right: boolean }>;
  /** the last buzz */
  buzz: { seat: number; turn: number; n: number } | null;
  /** the cards that are done, newest last: their word for everyone, their forbidden words once the game is over */
  done: Array<{ turn: number; team: number; target: string; meanings: Meanings; forbidden: string[] | null; result: DontSayResult; by: number | null }>;
  /** a co-op table's aim: cards to guess in all */
  goal: number | null;
  endedBy: DontSayEnd | null;
}

/** Who is in which team when the game starts: three players play together, more in two teams. */
export function dontSayMode(players: number): DontSayMode {
  return players === DONT_SAY_COOP_PLAYERS ? 'coop' : 'teams';
}

/**
 * Why the seats cannot start a game as they stand, or null: in a team game
 * each of the two teams needs at least DONT_SAY_MIN_TEAM players.
 */
export function dontSayStartProblem(seats: ReadonlyArray<Pick<RulesSeat, 'team'>>): 'need-players' | 'too-many' | 'teams-uneven' | null {
  if (seats.length < DONT_SAY_MIN_PLAYERS) return 'need-players';
  if (seats.length > DONT_SAY_MAX_PLAYERS) return 'too-many';
  if (dontSayMode(seats.length) === 'coop') return null;
  for (let team = 1; team <= DONT_SAY_TEAMS; team++) {
    if (seats.filter((s) => s.team === team).length < DONT_SAY_MIN_TEAM) return 'teams-uneven';
  }
  return null;
}

function clone(s: DontSayState): DontSayState {
  return {
    ...s,
    seats: s.seats.map((x) => ({ ...x })),
    order: s.order.map((x) => ({ ...x })),
    scores: { ...s.scores },
    turn: s.turn ? { ...s.turn, clues: [...s.turn.clues], guesses: [...s.turn.guesses] } : null,
    done: [...s.done],
    buzz: s.buzz ? { ...s.buzz } : null,
  };
}

const isIn = (s: DontSayState, seat: number): boolean => s.seats.some((x) => x.seat === seat && !x.left);

/** Who guesses on a turn: the describer's teammates, or in co-op everyone else, still at the table. */
function guessersOf(s: DontSayState, turn: Pick<Turn, 'seat' | 'team'>): number[] {
  return s.seats.filter((x) => !x.left && x.seat !== turn.seat && (s.mode === 'coop' || x.team === turn.team)).map((x) => x.seat);
}

function finish(s: DontSayState, now: number, why: DontSayEnd): void {
  s.turn = null;
  s.finishedAt = now;
  s.endedBy = why;
}

/** Whether a team (or the co-op table) still has a describer and someone to guess. */
function viable(s: DontSayState): boolean {
  if (s.mode === 'coop') return s.seats.filter((x) => !x.left).length >= 2;
  for (let team = 1; team <= DONT_SAY_TEAMS; team++) {
    if (s.seats.filter((x) => x.team === team && !x.left).length < 2) return false;
  }
  return true;
}

/** The next card from the deck, or null when it is used up. */
function draw(s: DontSayState): number | null {
  if (s.next >= s.deck.length) return null;
  const card = s.next;
  s.next += 1;
  return card;
}

/** The turn after `after` (0 before the first), or the end. */
function nextTurn(s: DontSayState, now: number, after: number): void {
  if (!viable(s)) return finish(s, now, 'too-few');
  for (let n = after + 1; n <= s.order.length; n++) {
    const { seat, team } = s.order[n - 1]!;
    if (!isIn(s, seat)) continue;
    const card = draw(s);
    if (card === null) return finish(s, now, 'deck-empty');
    const readyAt = now + DONT_SAY_READY_MS;
    s.turn = { n, seat, team, startedAt: now, readyAt, endsAt: readyAt + DONT_SAY_TURN_MS, card, drawn: 1, skips: 0, clues: [], guesses: [], lines: 0 };
    return;
  }
  finish(s, now, 'turns-done');
}

/** The card in play is done: it is filed, and the next is drawn (the game ends when the deck has none). */
function cardDone(s: DontSayState, now: number, result: DontSayResult, by: number | null): void {
  const turn = s.turn!;
  if (turn.card !== null) s.done.push({ turn: turn.n, team: turn.team, card: turn.card, result, by });
  turn.clues = [];
  turn.guesses = [];
  if (result === 'time') return;
  const card = draw(s);
  if (card === null) return finish(s, now, 'deck-empty');
  turn.card = card;
  turn.drawn += 1;
}

function line(turn: Turn, seat: number, text: string): Line {
  turn.lines += 1;
  return { n: turn.lines, seat, text: text.normalize('NFC').trim().replace(/\s+/g, ' ') };
}

/** What a describer's clue would be, for the box before it is sent (the server judges again). */
export function dontSayClueSlip(board: Pick<DontSayBoard, 'dialect' | 'card'>, text: string): TextSlip | 'says-word' | null {
  if (!text.trim()) return null;
  const slip = textSlip(text, board.dialect, DONT_SAY_CLUE_LIMITS);
  if (slip) return slip;
  if (board.card && saysBanned(text, board.dialect, [board.card.target, ...board.card.forbidden])) return 'says-word';
  return null;
}

/** What a guess would be refused for, before it is sent. */
export function dontSayGuessSlip(dialect: GameDialect, text: string): TextSlip | null {
  return text.trim() ? textSlip(text, dialect, DONT_SAY_GUESS_LIMITS) : null;
}

/** A co-op table's aim for the whole game. */
export function dontSayGoal(state: Pick<DontSayState, 'mode' | 'order'>): number | null {
  return state.mode === 'coop' ? state.order.length * DONT_SAY_COOP_GOAL_PER_TURN : null;
}

export const dontSayRules: GameRules<DontSayState, DontSayMove, DontSaySettings, DontSayBoard, DontSayOutcome> = {
  init(settings: DontSaySettings, seats: readonly RulesSeat[], start: RulesStart): DontSayState {
    const people = seats.filter((x) => x.bot === null);
    const mode = dontSayMode(people.length);
    const seated: SeatState[] = people.map((x) => ({ seat: x.seat, team: mode === 'coop' ? 1 : (x.team ?? 1), left: false }));
    let order: Array<{ seat: number; team: number }>;
    if (mode === 'coop') {
      const round = seededOrder(
        start.seed,
        'describers',
        seated.map((x) => x.seat),
      );
      order = Array.from({ length: DONT_SAY_COOP_ROUNDS }, () => round.map((seat) => ({ seat, team: 1 }))).flat();
    } else {
      // the teams take turns; within a team the describers go in seat order, the smaller team's more than once
      const first = seededUnit(start.seed, 'first-team') < 0.5 ? 1 : 2;
      const teams = [first, first === 1 ? 2 : 1].map((team) => seated.filter((x) => x.team === team).map((x) => x.seat));
      const rounds = Math.max(...teams.map((t) => t.length));
      order = [];
      for (let k = 0; k < rounds; k++) {
        teams.forEach((members, i) => {
          if (members.length > 0) order.push({ seat: members[k % members.length]!, team: i === 0 ? first : first === 1 ? 2 : 1 });
        });
      }
    }
    const state: DontSayState = {
      dialect: settings.dialect,
      mode,
      deck: (settings.deck ?? []).map((c) => ({ ...c, forbidden: [...c.forbidden], forms: [...c.forms] })),
      next: 0,
      seats: seated,
      order,
      scores: mode === 'coop' ? { 1: 0 } : { 1: 0, 2: 0 },
      turn: null,
      done: [],
      buzz: null,
      buzzes: 0,
      finishedAt: null,
      endedBy: null,
    };
    if (dontSayStartProblem(seated) !== null) {
      finish(state, start.now, 'too-few');
      return state;
    }
    nextTurn(state, start.now, 0);
    return state;
  },

  apply(state: DontSayState, seat: number, move: DontSayMove, now: number): ApplyResult<DontSayState, DontSayOutcome> {
    if (state.finishedAt !== null || !state.turn) return { ok: false, reason: 'finished' };
    const turn = state.turn;
    const describing = turn.seat === seat;
    if (move.kind === 'guess' ? !guessersOf(state, turn).includes(seat) : !describing) return { ok: false, reason: 'not-your-turn' };
    if (now < turn.readyAt) return { ok: false, reason: 'not-ready' };
    if (turn.card === null) return { ok: false, reason: 'finished' };
    const card = state.deck[turn.card]!;

    if (move.kind === 'skip') {
      if (turn.skips >= DONT_SAY_SKIPS_PER_TURN) return { ok: false, reason: 'no-skips' };
      const next = clone(state);
      next.turn!.skips += 1;
      cardDone(next, now, 'skipped', null);
      return { ok: true, state: next, outcome: { kind: 'skip' } };
    }

    const limits = move.kind === 'clue' ? DONT_SAY_CLUE_LIMITS : DONT_SAY_GUESS_LIMITS;
    const slip = textSlip(move.text, state.dialect, limits);
    if (slip) return { ok: false, reason: slip };
    const next = clone(state);
    const t = next.turn!;

    if (move.kind === 'clue') {
      const said = saysBanned(move.text, state.dialect, [card.target, ...card.forbidden, ...card.forms]);
      if (said) {
        next.scores[t.team] = (next.scores[t.team] ?? 0) - DONT_SAY_BUZZ_PENALTY;
        next.buzzes += 1;
        next.buzz = { seat, turn: t.n, n: next.buzzes };
        cardDone(next, now, 'buzzed', seat);
        return { ok: true, state: next, outcome: { kind: 'buzz', said } };
      }
      t.clues = [...t.clues, line(t, seat, move.text)].slice(-KEEP_LINES);
      return { ok: true, state: next, outcome: { kind: 'clue' } };
    }

    if (guessNames(move.text, card.target, state.dialect)) {
      next.scores[t.team] = (next.scores[t.team] ?? 0) + 1;
      cardDone(next, now, 'guessed', seat);
      return { ok: true, state: next, outcome: { kind: 'guess', right: true } };
    }
    t.guesses = [...t.guesses, { ...line(t, seat, move.text), right: false }].slice(-KEEP_LINES);
    return { ok: true, state: next, outcome: { kind: 'guess', right: false } };
  },

  waitingFor(state: DontSayState): number[] {
    return state.turn && state.finishedAt === null ? [state.turn.seat] : [];
  },

  startProblem(seats: readonly RulesSeat[]): string | null {
    return dontSayStartProblem(seats.filter((x) => x.bot === null));
  },

  mayMove(state: DontSayState, seat: number): boolean {
    if (!state.turn || state.finishedAt !== null) return false;
    return state.turn.seat === seat || guessersOf(state, state.turn).includes(seat);
  },

  dueAt(state: DontSayState): number | null {
    return state.turn && state.finishedAt === null ? state.turn.endsAt : null;
  },

  timeout(state: DontSayState, seats: readonly number[], now: number): DontSayState {
    if (!state.turn || state.finishedAt !== null || !seats.includes(state.turn.seat)) return state;
    const next = clone(state);
    const n = next.turn!.n;
    cardDone(next, now, 'time', null);
    if (next.finishedAt === null) nextTurn(next, now, n);
    return next;
  },

  drop(state: DontSayState, seat: number, now: number): DontSayState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    const s = next.seats.find((x) => x.seat === seat);
    if (!s || s.left) return state;
    s.left = true;
    if (!viable(next)) {
      finish(next, now, 'too-few');
      return next;
    }
    if (next.turn?.seat === seat) {
      const n = next.turn.n;
      cardDone(next, now, 'time', null);
      if (next.finishedAt === null) nextTurn(next, now, n);
    }
    return next;
  },

  end(state: DontSayState, now: number): DontSayState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    finish(next, now, 'abandoned');
    return next;
  },

  finished(state: DontSayState): boolean {
    return state.finishedAt !== null;
  },

  viewFor(state: DontSayState, seat: number | null): DontSayBoard {
    const over = state.finishedAt !== null;
    const turn = state.turn;
    const playing = seat !== null && state.seats.some((x) => x.seat === seat);
    const role: DontSayBoard['role'] = !playing ? null : !turn ? 'watcher' : turn.seat === seat ? 'describer' : guessersOf(state, turn).includes(seat) ? 'guesser' : 'watcher';
    const inPlay = turn && turn.card !== null ? state.deck[turn.card]! : null;
    const iso = (ms: number): string => new Date(ms).toISOString();
    const teamNumbers = state.mode === 'coop' ? [1] : [1, 2];
    return {
      dialect: state.dialect,
      mode: state.mode,
      teams: teamNumbers.map((team) => ({ team, seats: state.seats.filter((x) => x.team === team).map((x) => x.seat), score: state.scores[team] ?? 0 })),
      turn: turn
        ? { n: turn.n, of: state.order.length, seat: turn.seat, team: turn.team, startedAt: iso(turn.startedAt), readyAt: iso(turn.readyAt), endsAt: iso(turn.endsAt) }
        : null,
      role,
      // the describer's alone, and nobody's once the game is over (the done cards say it then)
      card: role === 'describer' && inPlay && !over ? { target: inPlay.target, meanings: inPlay.meanings, forbidden: [...inPlay.forbidden] } : null,
      drawn: turn?.drawn ?? 0,
      skipsLeft: role === 'describer' && turn ? DONT_SAY_SKIPS_PER_TURN - turn.skips : null,
      clues: turn ? turn.clues.map((c) => ({ ...c })) : [],
      guesses: turn ? turn.guesses.map((g) => ({ ...g })) : [],
      buzz: state.buzz ? { ...state.buzz } : null,
      done: state.done.map((d) => {
        const c = state.deck[d.card]!;
        return { turn: d.turn, team: d.team, target: c.target, meanings: c.meanings, forbidden: over ? [...c.forbidden] : null, result: d.result, by: d.by };
      }),
      goal: dontSayGoal(state),
      endedBy: state.endedBy,
    };
  },

  places(state: DontSayState): readonly Placed[] {
    if (state.mode === 'coop') {
      const score = state.scores[1] ?? 0;
      // together against the card: all first when the table reached its aim, all last when it did not
      const reached = score >= (dontSayGoal(state) ?? 0) && state.endedBy !== 'abandoned' && state.endedBy !== 'too-few';
      return state.seats.map((x) => ({ seat: x.seat, place: reached ? 1 : state.seats.length, score }));
    }
    const ranked = [1, 2].sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
    const top = state.scores[ranked[0]!] ?? 0;
    const winners = state.seats.filter((x) => (state.scores[x.team] ?? 0) === top);
    return state.seats.map((x) => {
      const score = state.scores[x.team] ?? 0;
      return { seat: x.seat, place: score === top ? 1 : winners.length + 1, score };
    });
  },
};
