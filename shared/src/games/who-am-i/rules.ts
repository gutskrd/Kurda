/**
 * Who Am I? at a table, for two to six: everyone wears a card on their
 * forehead that everyone else can read and they cannot. In turn, a player
 * asks one yes/no question about their own card, picked from an approved
 * Kurdish list; the others, who can see the card, answer yes or no; and the
 * card itself then says which it is. With the answer in hand the player may
 * guess, from a few tiles, or pass the turn on. Fewer questions score more,
 * and every right answer given about somebody else's card scores a point.
 *
 * Accurate, and not to be cheated:
 *   - The truth of a question is the card's, read from the identity's facts
 *     table (`answerFor`), never what the table said. A friend who answers
 *     wrong, by mistake or to mislead, changes nothing the asker is told and
 *     only misses their own point.
 *   - A player's own identity is in every view but their own, until they
 *     have it, are out, or the game is over. Nothing about it is in theirs:
 *     their tiles and questions are dealt so that neither gives it away
 *     (`dealWhoAmI`), and the server deals every seat a different identity,
 *     with none of the others' among its tiles.
 *   - While a question is being answered, a view says who has answered and
 *     not what, so nobody copies an answer and the asker reads nothing from
 *     the first one in.
 *   - Nothing is typed. A move is a question picked, yes or no, a tile, or a
 *     pass, and every one is checked here: whose turn it is, what the turn
 *     is waiting for, a question asked once, an answer given once.
 *
 * These are the rules alone, pure (shared/src/games/multi/rules.ts). The
 * game online is run by the server from them (api/src/mp/games/who-am-i.ts),
 * which deals every seat before `init`. The game on one phone passed round a
 * room runs the same rules in the app (couch.ts): there the phone holds every
 * card, so that game is never paid or rated.
 *
 * A turn has three waits, each with a clock of its own:
 *   ask     the player on turn picks a question, guesses outright, or passes
 *   answer  everyone else answers the question about the card they can see
 *   decide  the answer is on the table: the player guesses, or passes
 * A player who has asked every question they were dealt must guess; one who
 * lets that turn run out is out, so a game always ends. Two wrong guesses and
 * a player is out. Those who have their card, or are out, keep answering for
 * the others. The game is over when nobody is left guessing, when its time
 * is up, or when fewer than two people are still at the table.
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

export const WHO_AM_I_TABLE_MIN_PLAYERS = 2;
export const WHO_AM_I_TABLE_MAX_PLAYERS = 6;
/** How long a game may run at most, as the host may choose. */
export const WHO_AM_I_TABLE_MINUTES = [5, 10, 15] as const;
export type WhoAmITableMinutes = (typeof WHO_AM_I_TABLE_MINUTES)[number];
export const WHO_AM_I_TABLE_DEFAULT_MINUTES: WhoAmITableMinutes = 10;
/**
 * A turn's three waits. Each is long enough for a learner to read a Kurdish
 * question and look at what it means, and short enough that a table of six
 * is not kept waiting by one of them.
 */
export const WHO_AM_I_ASK_SECONDS = 60;
export const WHO_AM_I_ANSWER_SECONDS = 30;
export const WHO_AM_I_DECIDE_SECONDS = 30;
/** What a right answer about somebody else's card is worth. */
export const WHO_AM_I_HELP_POINTS = 1;

export interface WhoAmITableSettings {
  dialect: LetterDialect;
  minutes: WhoAmITableMinutes;
  difficulty: GameDifficulty;
  /** each seat's deal, made by the server at the start; never stored in the lobby's settings */
  deals?: ReadonlyArray<{ seat: number; deal: WhoAmIDeal }>;
}

export type WhoAmITableMove =
  | { kind: 'ask'; question: string }
  | { kind: 'answer'; yes: boolean }
  | { kind: 'guess'; tile: string }
  | { kind: 'pass' };

/** What the mover is told at once: whether a guess was right. Everything else is on the board. */
export interface WhoAmITableOutcome {
  kind: WhoAmITableMove['kind'];
  correct: boolean | null;
}

export type WhoAmITablePhase = 'ask' | 'answer' | 'decide';

interface TableSeat {
  seat: number;
  deal: WhoAmIDeal | null;
  /** the questions this seat asked about its own card, each with the card's own answer */
  asked: WhoAmIAsked[];
  guesses: Array<{ tile: string; correct: boolean }>;
  solvedAt: number | null;
  out: boolean;
  left: boolean;
  /** right answers given about other seats' cards */
  helped: number;
  /** answers given at all, right or wrong */
  answered: number;
}

/** One seat's answer to the question on the table; null when their time ran out. */
interface TableAnswer {
  seat: number;
  yes: boolean | null;
}

export interface WhoAmITableState {
  dialect: LetterDialect;
  difficulty: GameDifficulty;
  seed: string;
  startedAt: number;
  endsAt: number;
  seats: TableSeat[];
  /** the seat on turn; null once the game is over */
  turn: number | null;
  phase: WhoAmITablePhase;
  phaseEndsAt: number;
  /** turns begun, the first being 1 */
  turns: number;
  /** the question being answered, in the answer wait */
  pending: { question: string; answers: TableAnswer[] } | null;
  /** the last question answered: who asked, what the card said, and how everyone answered */
  told: { seat: number; question: string; truth: boolean; answers: TableAnswer[] } | null;
  finishedAt: number | null;
  endedBy: 'all-done' | 'time' | 'too-few' | 'abandoned' | null;
}

/** The card on a forehead, as those who may read it are sent it. */
export interface WhoAmITableCard {
  word: string;
  meanings: Meanings;
  category: string;
}

export interface WhoAmITableBoard {
  dialect: LetterDialect;
  difficulty: GameDifficulty;
  startedAt: string;
  endsAt: string;
  turn: number | null;
  phase: WhoAmITablePhase;
  phaseEndsAt: string;
  turns: number;
  /** the viewer's own game: their identity only once they have it, are out, or the game is over */
  mine: {
    /** what kind of thing it is, when every tile is that kind (`sharedCategory`) */
    category: string | null;
    tiles: WhoAmITile[];
    questions: WhoAmIQuestion[];
    asked: WhoAmIAsked[];
    guesses: Array<{ tile: string; correct: boolean }>;
    guessesLeft: number;
    /** every question dealt has been asked: this turn is a guess */
    mustGuess: boolean;
    solved: boolean;
    out: boolean;
    points: number;
    identity: { id: string; word: string; meanings: Meanings } | null;
  } | null;
  /**
   * Everyone at the table. `card` is what is on that seat's forehead, for a
   * viewer who may read it: anyone playing but the seat itself, and the seat
   * too once it has it, is out, or the game is over. Someone watching without
   * a seat reads none until the end.
   */
  seats: Array<{
    seat: number;
    asked: number;
    wrong: number;
    solved: boolean;
    out: boolean;
    left: boolean;
    helped: number;
    points: number;
    solvedAt: string | null;
    card: WhoAmITableCard | null;
  }>;
  /** the question being answered: who has answered (never what), and the viewer's own answer */
  pending: { seat: number; question: WhoAmIQuestion; answered: number[]; waiting: number[]; mine: boolean | null } | null;
  /** the last question answered */
  told: { seat: number; question: WhoAmIQuestion; truth: boolean; answers: Array<{ seat: number; yes: boolean | null; right: boolean }> } | null;
  /** once the game is over: who everyone was */
  reveal: Array<{ seat: number; word: string; meanings: Meanings }> | null;
  endedBy: WhoAmITableState['endedBy'];
}

function clone(state: WhoAmITableState): WhoAmITableState {
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s, asked: [...s.asked], guesses: [...s.guesses] })),
    pending: state.pending ? { question: state.pending.question, answers: state.pending.answers.map((a) => ({ ...a })) } : null,
    told: state.told ? { ...state.told, answers: state.told.answers.map((a) => ({ ...a })) } : null,
  };
}

function wrong(s: TableSeat): number {
  return s.guesses.filter((g) => !g.correct).length;
}

/** A seat's score: what its own card earned, and a point for every right answer about another's. */
function points(s: TableSeat): number {
  return whoAmIPoints(s.asked.length, wrong(s), s.solvedAt !== null) + s.helped * WHO_AM_I_HELP_POINTS;
}

/** Still guessing: at the table, with a card, neither solved nor out. */
function guessing(s: TableSeat): boolean {
  return !s.left && s.deal !== null && s.solvedAt === null && !s.out;
}

/** At the table at all: those who answer for the others, whether or not their own card is done. */
function present(s: TableSeat): boolean {
  return !s.left && s.deal !== null;
}

/** Every question this seat was dealt has been asked. */
function askedAll(s: TableSeat): boolean {
  return s.deal !== null && s.asked.length >= s.deal.questions.length;
}

function finish(state: WhoAmITableState, now: number, why: NonNullable<WhoAmITableState['endedBy']>): void {
  state.finishedAt = now;
  state.endedBy = why;
  state.turn = null;
  state.pending = null;
}

/** The next seat still guessing after `from`, round the table; null when nobody is. */
function nextGuessing(state: WhoAmITableState, from: number | null): number | null {
  const order = state.seats.map((s) => s.seat);
  const at = from === null ? -1 : order.indexOf(from);
  for (let i = 1; i <= order.length; i++) {
    const seat = order[(at + i + order.length) % order.length]!;
    if (guessing(state.seats.find((s) => s.seat === seat)!)) return seat;
  }
  return null;
}

/**
 * The turn passes on. The game is over instead when nobody is left guessing,
 * or when fewer than two people are at the table: a card needs somebody to
 * read it.
 */
function advance(state: WhoAmITableState, now: number): void {
  if (state.finishedAt !== null) return;
  if (state.seats.filter(present).length < 2) return finish(state, now, 'too-few');
  const next = nextGuessing(state, state.turn);
  if (next === null) return finish(state, now, 'all-done');
  state.turn = next;
  state.phase = 'ask';
  state.phaseEndsAt = now + WHO_AM_I_ASK_SECONDS * 1000;
  state.turns++;
  state.pending = null;
}

/** The seats still to answer the question on the table. */
function unanswered(state: WhoAmITableState): number[] {
  if (state.phase !== 'answer' || !state.pending || state.turn === null) return [];
  const done = new Set(state.pending.answers.map((a) => a.seat));
  return state.seats.filter((s) => present(s) && s.seat !== state.turn && !done.has(s.seat)).map((s) => s.seat);
}

/**
 * Everyone has answered, or run out of time to: the card says which it is.
 * The asker's list takes the card's answer, each answer that matched it
 * scores its giver a point, and the asker decides what to do with it.
 */
function resolve(state: WhoAmITableState, now: number): void {
  const asker = state.seats.find((s) => s.seat === state.turn);
  const pending = state.pending;
  if (!asker || !asker.deal || !pending) return;
  const q = asker.deal.questions.find((x) => x.id === pending.question);
  const truth = q ? answerFor(asker.deal.identity, q.fact) : false;
  asker.asked.push({ question: pending.question, answer: truth });
  for (const a of pending.answers) {
    const giver = state.seats.find((s) => s.seat === a.seat);
    if (!giver || a.yes === null) continue;
    giver.answered++;
    if (a.yes === truth) giver.helped++;
  }
  state.told = { seat: asker.seat, question: pending.question, truth, answers: pending.answers.map((a) => ({ ...a })) };
  state.pending = null;
  state.phase = 'decide';
  state.phaseEndsAt = now + WHO_AM_I_DECIDE_SECONDS * 1000;
}

/** A seat took part: it asked, answered or guessed at least once. */
function tookPart(s: TableSeat): boolean {
  return s.asked.length > 0 || s.answered > 0 || s.guesses.length > 0;
}

export const whoAmITableRules: GameRules<WhoAmITableState, WhoAmITableMove, WhoAmITableSettings, WhoAmITableBoard, WhoAmITableOutcome> = {
  init(settings: WhoAmITableSettings, seats: readonly RulesSeat[], start: RulesStart): WhoAmITableState {
    const deals = new Map((settings.deals ?? []).map((d) => [d.seat, d.deal]));
    const state: WhoAmITableState = {
      dialect: settings.dialect,
      difficulty: settings.difficulty,
      seed: start.seed,
      startedAt: start.now,
      endsAt: start.now + settings.minutes * 60_000,
      seats: seats.map((s) => ({ seat: s.seat, deal: deals.get(s.seat) ?? null, asked: [], guesses: [], solvedAt: null, out: false, left: false, helped: 0, answered: 0 })),
      turn: null,
      phase: 'ask',
      phaseEndsAt: start.now,
      turns: 0,
      pending: null,
      told: null,
      finishedAt: null,
      endedBy: null,
    };
    advance(state, start.now);
    return state;
  },

  apply(state: WhoAmITableState, seat: number, move: WhoAmITableMove, now: number): ApplyResult<WhoAmITableState, WhoAmITableOutcome> {
    if (state.finishedAt !== null) return { ok: false, reason: 'finished' };
    const mine = state.seats.find((s) => s.seat === seat);
    if (!mine || !present(mine)) return { ok: false, reason: 'not-playing' };
    const next = clone(state);
    const me = next.seats.find((s) => s.seat === seat)!;

    if (move.kind === 'answer') {
      // an answer is about somebody else's card, while their question is on the table, and is given once
      if (next.phase !== 'answer' || !next.pending) return { ok: false, reason: 'nothing-asked' };
      if (seat === next.turn) return { ok: false, reason: 'own-question' };
      if (next.pending.answers.some((a) => a.seat === seat)) return { ok: false, reason: 'answered' };
      next.pending.answers.push({ seat, yes: move.yes });
      if (unanswered(next).length === 0) resolve(next, now);
      return { ok: true, state: next, outcome: { kind: 'answer', correct: null } };
    }

    if (seat !== next.turn || !guessing(me)) return { ok: false, reason: 'not-your-turn' };
    const deal = me.deal!;

    if (move.kind === 'ask') {
      if (next.phase !== 'ask') return { ok: false, reason: 'asked-this-turn' };
      const q = deal.questions.find((x) => x.id === move.question);
      if (!q) return { ok: false, reason: 'no-such-question' };
      if (me.asked.some((a) => a.question === q.id)) return { ok: false, reason: 'asked' };
      next.pending = { question: q.id, answers: [] };
      next.phase = 'answer';
      next.phaseEndsAt = now + WHO_AM_I_ANSWER_SECONDS * 1000;
      // nobody there to answer (they have all just gone): the card answers by itself
      if (unanswered(next).length === 0) resolve(next, now);
      return { ok: true, state: next, outcome: { kind: 'ask', correct: null } };
    }

    // a guess or a pass: before asking, or once the answer is on the table; never while it is being answered
    if (next.phase === 'answer') return { ok: false, reason: 'being-answered' };

    if (move.kind === 'pass') {
      // with every question asked there is nothing to wait for: the turn is a guess
      if (askedAll(me)) return { ok: false, reason: 'must-guess' };
      advance(next, now);
      return { ok: true, state: next, outcome: { kind: 'pass', correct: null } };
    }

    if (!deal.candidates.some((c) => c.id === move.tile)) return { ok: false, reason: 'no-such-tile' };
    if (me.guesses.some((g) => g.tile === move.tile)) return { ok: false, reason: 'guessed' };
    const correct = move.tile === deal.identity.id;
    me.guesses.push({ tile: move.tile, correct });
    if (correct) me.solvedAt = now;
    else if (wrong(me) >= WHO_AM_I_GUESSES) me.out = true;
    advance(next, now);
    return { ok: true, state: next, outcome: { kind: 'guess', correct } };
  },

  waitingFor(state: WhoAmITableState): number[] {
    if (state.finishedAt !== null || state.turn === null) return [];
    return state.phase === 'answer' ? unanswered(state) : [state.turn];
  },

  dueAt(state: WhoAmITableState): number | null {
    return state.finishedAt === null ? Math.min(state.phaseEndsAt, state.endsAt) : null;
  },

  timeout(state: WhoAmITableState, seats: readonly number[], now: number): WhoAmITableState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    if (now >= next.endsAt) {
      finish(next, now, 'time');
      return next;
    }
    if (next.phase === 'answer' && next.pending) {
      // those who did not answer in time, or are away, are passed over: the card does not wait for them
      const waiting = new Set(unanswered(next));
      for (const seat of seats) if (waiting.has(seat)) next.pending.answers.push({ seat, yes: null });
      if (unanswered(next).length === 0) resolve(next, now);
      return next;
    }
    if (next.turn === null || !seats.includes(next.turn)) return state;
    const me = next.seats.find((s) => s.seat === next.turn)!;
    // a turn that had to be a guess and was let run out: out, so the game cannot be waited out for ever
    if (askedAll(me)) me.out = true;
    advance(next, now);
    return next;
  },

  drop(state: WhoAmITableState, seat: number, now: number): WhoAmITableState {
    if (state.finishedAt !== null) return state;
    const s = state.seats.find((x) => x.seat === seat);
    if (!s || s.left) return state;
    const next = clone(state);
    next.seats.find((x) => x.seat === seat)!.left = true;
    if (next.seats.filter(present).length < 2) {
      finish(next, now, 'too-few');
    } else if (next.turn === seat) {
      advance(next, now);
    } else if (next.phase === 'answer' && next.pending && unanswered(next).length === 0) {
      // the one the question was waiting on has gone: the card answers
      resolve(next, now);
    }
    return next;
  },

  end(state: WhoAmITableState, now: number): WhoAmITableState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    finish(next, now, 'abandoned');
    return next;
  },

  finished(state: WhoAmITableState): boolean {
    return state.finishedAt !== null;
  },

  /**
   * A game counts when it was played: not called off with everyone gone, and
   * at least two seats took part. One player with a second seat that never
   * moved has not played anyone, and is paid nothing for it.
   */
  counted(state: WhoAmITableState): boolean {
    return state.finishedAt !== null && state.endedBy !== 'abandoned' && state.seats.filter(tookPart).length >= 2;
  },

  viewFor(state: WhoAmITableState, seat: number | null): WhoAmITableBoard {
    const done = state.finishedAt !== null;
    const me = seat === null ? undefined : state.seats.find((s) => s.seat === seat);
    const deal = me?.deal ?? null;
    const showMeanings = state.difficulty === 'beginner';
    // who may read the cards at all: someone with a card of their own, still at the table
    const reads = !!me && present(me);
    const question = (owner: number, id: string): WhoAmIQuestion => {
      const q = state.seats.find((s) => s.seat === owner)?.deal?.questions.find((x) => x.id === id);
      return { id, ku: q?.ku ?? '', meanings: q?.meanings ?? { en: '' } };
    };
    const own = (s: TableSeat): boolean => s.solvedAt !== null || s.out || done;
    return {
      dialect: state.dialect,
      difficulty: state.difficulty,
      startedAt: new Date(state.startedAt).toISOString(),
      endsAt: new Date(state.endsAt).toISOString(),
      turn: state.turn,
      phase: state.phase,
      phaseEndsAt: new Date(state.phaseEndsAt).toISOString(),
      turns: state.turns,
      mine:
        me && deal
          ? {
              category: sharedCategory(deal.identity.category, deal.candidates),
              tiles: deal.candidates.map((c) => ({ id: c.id, word: c.word, meanings: showMeanings ? c.meanings : null })),
              questions: deal.questions.map((q) => ({ id: q.id, ku: q.ku, meanings: q.meanings })),
              asked: me.asked.map((a) => ({ ...a })),
              guesses: me.guesses.map((g) => ({ ...g })),
              guessesLeft: Math.max(0, WHO_AM_I_GUESSES - wrong(me)),
              mustGuess: guessing(me) && askedAll(me),
              solved: me.solvedAt !== null,
              out: me.out,
              points: points(me),
              // your own card comes off your forehead once you have it, are out, or the game is over
              identity: own(me) ? { id: deal.identity.id, word: deal.identity.word, meanings: deal.identity.meanings } : null,
            }
          : null,
      seats: state.seats.map((s) => ({
        seat: s.seat,
        asked: s.asked.length,
        wrong: wrong(s),
        solved: s.solvedAt !== null,
        out: s.out,
        left: s.left,
        helped: s.helped,
        points: points(s),
        solvedAt: s.solvedAt === null ? null : new Date(s.solvedAt).toISOString(),
        // a card is read by everyone playing but the one who wears it, until it comes off
        card:
          s.deal && (done || (s.seat === seat ? own(s) : reads))
            ? { word: s.deal.identity.word, meanings: s.deal.identity.meanings, category: s.deal.identity.category }
            : null,
      })),
      pending:
        state.pending && state.turn !== null
          ? {
              seat: state.turn,
              question: question(state.turn, state.pending.question),
              answered: state.pending.answers.map((a) => a.seat),
              waiting: unanswered(state),
              mine: state.pending.answers.find((a) => a.seat === seat)?.yes ?? null,
            }
          : null,
      told: state.told
        ? {
            seat: state.told.seat,
            question: question(state.told.seat, state.told.question),
            truth: state.told.truth,
            answers: state.told.answers.map((a) => ({ seat: a.seat, yes: a.yes, right: a.yes === state.told!.truth })),
          }
        : null,
      reveal: done ? state.seats.filter((s) => s.deal).map((s) => ({ seat: s.seat, word: s.deal!.identity.word, meanings: s.deal!.identity.meanings })) : null,
      endedBy: state.endedBy,
    };
  },

  places(state: WhoAmITableState): readonly Placed[] {
    // By points; among equals, whoever has their card before whoever has not, then whoever had it sooner. Those with no
    // point at all, and those who left, share last place: a table where nobody found a card or answered right has no winner
    // to pay as one.
    const at = (s: TableSeat): number => (s.solvedAt === null ? Number.MAX_SAFE_INTEGER : s.solvedAt);
    const scored = state.seats.filter((s) => !s.left && points(s) > 0).sort((a, b) => points(b) - points(a) || at(a) - at(b));
    const placed: Placed[] = [];
    scored.forEach((s, i) => {
      const prev = scored[i - 1];
      const tie = prev && points(prev) === points(s) && at(prev) === at(s);
      placed.push({ seat: s.seat, place: tie ? placed[i - 1]!.place : i + 1, score: points(s) });
    });
    const last = state.seats.length;
    for (const s of state.seats.filter((x) => !scored.includes(x))) placed.push({ seat: s.seat, place: last, score: 0 });
    return placed;
  },
};
