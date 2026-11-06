/**
 * Who Am I? as a race, for two to six: everyone has a hidden identity of
 * their own, dealt from the same approved pool, and asks and guesses at their
 * own pace against one clock. The first correct guess wins the race; the
 * others keep playing for their own score (fewer questions score more), with
 * at most WHO_AM_I_RACE_AFTER_FIRST_SECONDS left once someone has it. Two
 * wrong guesses and a player is out.
 *
 * These are the rules alone, pure (shared/src/games/multi/rules.ts): each
 * seat's deal — the identity, its tiles and its questions — is made on the
 * server from approved rows before `init` (api/src/mp/games/who-am-i.ts), with
 * the shared `dealWhoAmI`.
 *
 * Nobody is waited on: every seat may move whenever it likes (`mayMove`),
 * and the game waits only for its clock. So a player who steps away holds
 * nobody up and is passed over for nothing; they simply stop scoring.
 *
 * Hidden: a player's own identity, from them, until they have guessed it or
 * are out; everyone else's identity, from everyone, until the end. A view of
 * the others says only how many questions they asked and how they stand.
 */
import type { LetterDialect } from '../letters.js';
import type { Meanings } from '../content.js';
import type { GameDifficulty } from '../solo.js';
import type { ApplyResult, GameRules, Placed, RulesSeat, RulesStart } from '../multi/rules.js';
import {
  WHO_AM_I_GUESSES,
  answerFor,
  sharedCategory,
  whoAmIPoints,
  type WhoAmIAsked,
  type WhoAmIDeal,
  type WhoAmIQuestion,
  type WhoAmITile,
} from './game.js';

export const WHO_AM_I_RACE_MIN_PLAYERS = 2;
export const WHO_AM_I_RACE_MAX_PLAYERS = 6;
/** How long a race may run, as the host may choose. */
export const WHO_AM_I_RACE_MINUTES = [3, 5, 8] as const;
export type WhoAmIRaceMinutes = (typeof WHO_AM_I_RACE_MINUTES)[number];
export const WHO_AM_I_RACE_DEFAULT_MINUTES: WhoAmIRaceMinutes = 5;
/** Once somebody has it, how long the others have left at most. */
export const WHO_AM_I_RACE_AFTER_FIRST_SECONDS = 90;

export interface WhoAmIRaceSettings {
  dialect: LetterDialect;
  minutes: WhoAmIRaceMinutes;
  difficulty: GameDifficulty;
  /** each seat's deal, made by the server at the start; never stored in the lobby's settings */
  deals?: ReadonlyArray<{ seat: number; deal: WhoAmIDeal }>;
}

export type WhoAmIRaceMove = { kind: 'ask'; question: string } | { kind: 'guess'; tile: string };

/** What the mover is told: the answer to a question, or whether a guess was right. */
export interface WhoAmIRaceOutcome {
  kind: 'ask' | 'guess';
  answer: boolean | null;
  correct: boolean | null;
}

interface RaceSeat {
  seat: number;
  deal: WhoAmIDeal | null;
  asked: WhoAmIAsked[];
  guesses: Array<{ tile: string; correct: boolean }>;
  solvedAt: number | null;
  out: boolean;
  left: boolean;
}

export interface WhoAmIRaceState {
  dialect: LetterDialect;
  difficulty: GameDifficulty;
  seed: string;
  startedAt: number;
  endsAt: number;
  seats: RaceSeat[];
  firstSolver: number | null;
  finishedAt: number | null;
  endedBy: 'all-done' | 'time' | 'too-few' | 'abandoned' | null;
}

export interface WhoAmIRaceBoard {
  dialect: LetterDialect;
  difficulty: GameDifficulty;
  startedAt: string;
  endsAt: string;
  /** the viewer's own game: their identity only once they have it or are out */
  mine: {
    /** what kind of thing it is, when every tile is that kind (`sharedCategory`) */
    category: string | null;
    tiles: WhoAmITile[];
    questions: WhoAmIQuestion[];
    asked: WhoAmIAsked[];
    guesses: Array<{ tile: string; correct: boolean }>;
    guessesLeft: number;
    solved: boolean;
    out: boolean;
    points: number;
    identity: { id: string; word: string; meanings: Meanings } | null;
  } | null;
  /** how everyone stands, never what they are */
  seats: Array<{ seat: number; asked: number; wrong: number; solved: boolean; out: boolean; left: boolean; points: number; solvedAt: string | null }>;
  firstSolver: number | null;
  /** once the race is over: who everyone was */
  reveal: Array<{ seat: number; word: string; meanings: Meanings }> | null;
  endedBy: WhoAmIRaceState['endedBy'];
}

function clone(state: WhoAmIRaceState): WhoAmIRaceState {
  return { ...state, seats: state.seats.map((s) => ({ ...s, asked: [...s.asked], guesses: [...s.guesses] })) };
}

function wrong(s: RaceSeat): number {
  return s.guesses.filter((g) => !g.correct).length;
}

function points(s: RaceSeat): number {
  return whoAmIPoints(s.asked.length, wrong(s), s.solvedAt !== null);
}

/** Still playing: in the game, with a deal, neither solved nor out. */
function playing(s: RaceSeat): boolean {
  return !s.left && s.deal !== null && s.solvedAt === null && !s.out;
}

function finish(state: WhoAmIRaceState, now: number, why: NonNullable<WhoAmIRaceState['endedBy']>): void {
  state.finishedAt = now;
  state.endedBy = why;
}

/** Everyone still at the table is done: the race is over. */
function settle(state: WhoAmIRaceState, now: number): void {
  if (state.finishedAt !== null) return;
  if (!state.seats.some(playing)) finish(state, now, 'all-done');
}

export const whoAmIRaceRules: GameRules<WhoAmIRaceState, WhoAmIRaceMove, WhoAmIRaceSettings, WhoAmIRaceBoard, WhoAmIRaceOutcome> = {
  init(settings: WhoAmIRaceSettings, seats: readonly RulesSeat[], start: RulesStart): WhoAmIRaceState {
    const deals = new Map((settings.deals ?? []).map((d) => [d.seat, d.deal]));
    const state: WhoAmIRaceState = {
      dialect: settings.dialect,
      difficulty: settings.difficulty,
      seed: start.seed,
      startedAt: start.now,
      endsAt: start.now + settings.minutes * 60_000,
      seats: seats.map((s) => ({ seat: s.seat, deal: deals.get(s.seat) ?? null, asked: [], guesses: [], solvedAt: null, out: false, left: false })),
      firstSolver: null,
      finishedAt: null,
      endedBy: null,
    };
    if (state.seats.filter((s) => s.deal !== null).length === 0) finish(state, start.now, 'too-few');
    return state;
  },

  apply(state: WhoAmIRaceState, seat: number, move: WhoAmIRaceMove, now: number): ApplyResult<WhoAmIRaceState, WhoAmIRaceOutcome> {
    if (state.finishedAt !== null) return { ok: false, reason: 'finished' };
    const mine = state.seats.find((s) => s.seat === seat);
    if (!mine || !playing(mine)) return { ok: false, reason: 'not-playing' };
    const deal = mine.deal!;
    const next = clone(state);
    const me = next.seats.find((s) => s.seat === seat)!;
    if (move.kind === 'ask') {
      const q = deal.questions.find((x) => x.id === move.question);
      if (!q) return { ok: false, reason: 'no-such-question' };
      if (me.asked.some((a) => a.question === q.id)) return { ok: false, reason: 'asked' };
      const answer = answerFor(deal.identity, q.fact);
      me.asked.push({ question: q.id, answer });
      return { ok: true, state: next, outcome: { kind: 'ask', answer, correct: null } };
    }
    if (!deal.candidates.some((c) => c.id === move.tile)) return { ok: false, reason: 'no-such-tile' };
    if (me.guesses.some((g) => g.tile === move.tile)) return { ok: false, reason: 'guessed' };
    const correct = move.tile === deal.identity.id;
    me.guesses.push({ tile: move.tile, correct });
    if (correct) {
      me.solvedAt = now;
      if (next.firstSolver === null) {
        next.firstSolver = seat;
        next.endsAt = Math.min(next.endsAt, now + WHO_AM_I_RACE_AFTER_FIRST_SECONDS * 1000);
      }
    } else if (wrong(me) >= WHO_AM_I_GUESSES) {
      me.out = true;
    }
    settle(next, now);
    return { ok: true, state: next, outcome: { kind: 'guess', answer: null, correct } };
  },

  // a race waits on nobody: only its clock
  waitingFor(): number[] {
    return [];
  },

  mayMove(state: WhoAmIRaceState, seat: number): boolean {
    const s = state.seats.find((x) => x.seat === seat);
    return state.finishedAt === null && !!s && playing(s);
  },

  dueAt(state: WhoAmIRaceState): number | null {
    return state.finishedAt === null ? state.endsAt : null;
  },

  timeout(state: WhoAmIRaceState, _seats: readonly number[], now: number): WhoAmIRaceState {
    if (state.finishedAt !== null || now < state.endsAt) return state;
    const next = clone(state);
    finish(next, now, 'time');
    return next;
  },

  drop(state: WhoAmIRaceState, seat: number, now: number): WhoAmIRaceState {
    if (state.finishedAt !== null) return state;
    const s = state.seats.find((x) => x.seat === seat);
    if (!s || s.left) return state;
    const next = clone(state);
    next.seats.find((x) => x.seat === seat)!.left = true;
    settle(next, now);
    return next;
  },

  end(state: WhoAmIRaceState, now: number): WhoAmIRaceState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    finish(next, now, 'abandoned');
    return next;
  },

  finished(state: WhoAmIRaceState): boolean {
    return state.finishedAt !== null;
  },

  // called off with everyone gone, or never dealt: no race was run
  counted(state: WhoAmIRaceState): boolean {
    return state.finishedAt !== null && state.endedBy !== 'abandoned' && state.endedBy !== 'too-few';
  },

  viewFor(state: WhoAmIRaceState, seat: number | null): WhoAmIRaceBoard {
    const done = state.finishedAt !== null;
    const me = seat === null ? undefined : state.seats.find((s) => s.seat === seat);
    const deal = me?.deal ?? null;
    const showMeanings = state.difficulty === 'beginner';
    return {
      dialect: state.dialect,
      difficulty: state.difficulty,
      startedAt: new Date(state.startedAt).toISOString(),
      endsAt: new Date(state.endsAt).toISOString(),
      mine:
        me && deal
          ? {
              category: sharedCategory(deal.identity.category, deal.candidates),
              tiles: deal.candidates.map((c) => ({ id: c.id, word: c.word, meanings: showMeanings ? c.meanings : null })),
              questions: deal.questions.map((q) => ({ id: q.id, ku: q.ku, meanings: q.meanings })),
              asked: me.asked.map((a) => ({ ...a })),
              guesses: me.guesses.map((g) => ({ ...g })),
              guessesLeft: Math.max(0, WHO_AM_I_GUESSES - wrong(me)),
              solved: me.solvedAt !== null,
              out: me.out,
              points: points(me),
              // your own card comes off your forehead once you have it, are out, or the race is over
              identity: me.solvedAt !== null || me.out || done ? { id: deal.identity.id, word: deal.identity.word, meanings: deal.identity.meanings } : null,
            }
          : null,
      seats: state.seats.map((s) => ({
        seat: s.seat,
        asked: s.asked.length,
        wrong: wrong(s),
        solved: s.solvedAt !== null,
        out: s.out,
        left: s.left,
        points: points(s),
        solvedAt: s.solvedAt === null ? null : new Date(s.solvedAt).toISOString(),
      })),
      firstSolver: state.firstSolver,
      reveal: done ? state.seats.filter((s) => s.deal).map((s) => ({ seat: s.seat, word: s.deal!.identity.word, meanings: s.deal!.identity.meanings })) : null,
      endedBy: state.endedBy,
    };
  },

  places(state: WhoAmIRaceState): readonly Placed[] {
    // the first to have it wins; the others who had it by their points (then who had it sooner); everyone else shares last
    const solved = state.seats
      .filter((s) => s.solvedAt !== null)
      .sort((a, b) => Number(b.seat === state.firstSolver) - Number(a.seat === state.firstSolver) || points(b) - points(a) || a.solvedAt! - b.solvedAt!);
    const placed: Placed[] = [];
    solved.forEach((s, i) => {
      const prev = solved[i - 1];
      const tie = prev && prev.seat !== state.firstSolver && points(prev) === points(s) && prev.solvedAt === s.solvedAt;
      placed.push({ seat: s.seat, place: tie ? placed[i - 1]!.place : i + 1, score: points(s) });
    });
    const last = state.seats.length;
    for (const s of state.seats.filter((x) => x.solvedAt === null)) placed.push({ seat: s.seat, place: last, score: 0 });
    return placed;
  },
};
