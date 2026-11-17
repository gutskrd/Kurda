/**
 * Who Am I? at a table for two to six: everyone wears a card the others can read. On their turn a player asks one question
 * about their own card from an approved Kurdish list; the others answer yes, could be, no or not sure; then the card
 * itself says yes, no or "sometimes". The player may then guess from a few tiles or pass. Fewer questions score more, and
 * each right answer about another's card scores a point, up to WHO_AM_I_HELP_CAP, so helping never outweighs finding one's
 * own card. Pure rules (multi/rules.ts), run online by api/src/mp/games/who-am-i.ts, which deals every seat before
 * `init`, and on one passed-round phone by couch.ts, which is never paid or rated because the phone holds every card.
 *
 * Fair play: a question's truth is the card's (`verdictFor`), never the table's, so a wrong answer changes nothing the
 * asker is told and only misses its giver's point (`markOf`; "not sure" is never wrong and scores nothing). A player's
 * own identity is in every view but theirs until they have it, are out or the game ends, and their tiles and questions
 * give nothing away (`dealWhoAmI`); the server deals every seat a different identity, none among the others' tiles.
 * While a question is answered, views show who answered, not what. Nothing is typed: every move is a pick checked here.
 *
 * An `open` table (one room, the phone's game only, never the server's) may instead ask the room a question aloud
 * (`aloud`) and say a guess aloud for the room to judge (`said`); a close answer, another word or region's word, spends no
 * guess. It has no tiles, allows one more miss, never forces a guess, and tells a beginner the card's kind. Views suggest
 * questions to ask next (`suggestWhoAmIQuestions`) from what the player can already see.
 *
 * A turn has three timed waits: `ask` (question, guess or pass), `answer` (the others answer) and `decide` (guess or pass).
 * A player who has asked every dealt question must guess, and letting that turn run out puts them out; two wrong guesses
 * put a player out. Finished and out players keep answering. The game ends when nobody is left guessing, its time is up,
 * or fewer than two remain. Older apps' two-answer tables (`answers: 2`, cards dealt without "sometimes") and saved
 * states still play (`clone`), and boards keep the yes-or-no fields those apps read.
 */
import type { LetterDialect } from '../letters.js';
import type { Meanings } from '../content.js';
import type { GameDifficulty } from '../solo.js';
import type { ApplyResult, GameRules, Placed, RulesSeat, RulesStart } from '../multi/rules.js';
import {
  WHO_AM_I_GUESSES,
  WHO_AM_I_ROOM_GUESSES,
  isWhoAmISays,
  markOf,
  sharedCategory,
  suggestWhoAmIQuestions,
  verdictFor,
  whoAmIPoints,
  type WhoAmIAnswer,
  type WhoAmIAnswerCount,
  type WhoAmIAsked,
  type WhoAmIDeal,
  type WhoAmIMark,
  type WhoAmIQuestion,
  type WhoAmISays,
  type WhoAmITile,
} from './game.js';

export const WHO_AM_I_TABLE_MIN_PLAYERS = 2;
export const WHO_AM_I_TABLE_MAX_PLAYERS = 6;
/** How long a game may run at most, as the host may choose. */
export const WHO_AM_I_TABLE_MINUTES = [5, 10, 15] as const;
export type WhoAmITableMinutes = (typeof WHO_AM_I_TABLE_MINUTES)[number];
export const WHO_AM_I_TABLE_DEFAULT_MINUTES: WhoAmITableMinutes = 10;
/** A turn's three waits: long enough to read a Kurdish question and its meaning, short enough that one player cannot hold a table of six. */
export const WHO_AM_I_ASK_SECONDS = 60;
export const WHO_AM_I_ANSWER_SECONDS = 30;
export const WHO_AM_I_DECIDE_SECONDS = 30;
/** What a right answer about somebody else's card is worth. */
export const WHO_AM_I_HELP_POINTS = 1;
/**
 * The most right answers about other cards can add in a game. At a table of six a player answers about five questions per
 * one asked, and their own card is worth at most WHO_AM_I_START_POINTS, so without a cap answering would outscore finding
 * out who you are, and a player who is out would keep collecting.
 */
export const WHO_AM_I_HELP_CAP = 6;

export interface WhoAmITableSettings {
  dialect: LetterDialect;
  minutes: WhoAmITableMinutes;
  difficulty: GameDifficulty;
  /** each seat's deal, made by the server at the start and never stored in the lobby's settings */
  deals?: ReadonlyArray<{ seat: number; deal: WhoAmIDeal }>;
  /** a table in one room on one phone, where a question may also be asked aloud; never set by the server */
  open?: boolean;
  /**
   * The answers offered: 4 (yes, could be, no, not sure), or 2 (yes and no) when unset, as from older apps. A table of two
   * is dealt cards without "sometimes" rows.
   */
  answers?: WhoAmIAnswerCount;
}

export type WhoAmITableMove =
  | { kind: 'ask'; question: string }
  /** a question of the player's own asked of the room aloud, only at an `open` table */
  | { kind: 'aloud' }
  /** an answer to the question on the table: yes, could be, no or not sure (the last two only with four answers) */
  | { kind: 'answer'; says: WhoAmISays }
  /** the same as older apps send it: yes or no */
  | { kind: 'answer'; yes: boolean }
  | { kind: 'guess'; tile: string }
  /**
   * The player said who they are and the room, reading the card, says right or close (another word for the same thing);
   * only at an `open` table. A close guess spends nothing and passes the turn.
   */
  | { kind: 'said'; right: boolean; close?: true }
  | { kind: 'pass' };

/** What an answer move says, from `says` or an older app's yes or no; null for a move with neither or with something no app sends. */
export function whoAmISaysOf(move: { says?: unknown; yes?: unknown }): WhoAmISays | null {
  if (move.says !== undefined) return isWhoAmISays(move.says) ? move.says : null;
  return move.yes === true ? 'yes' : move.yes === false ? 'no' : null;
}

/** What the mover is told at once: whether a guess was right or close; everything else is on the board. */
export interface WhoAmITableOutcome {
  kind: WhoAmITableMove['kind'];
  correct: boolean | null;
  /** a guess said aloud that the room called close: no guess spent, and `correct` is null */
  close?: true;
}

export type WhoAmITablePhase = 'ask' | 'answer' | 'decide';

interface TableSeat {
  seat: number;
  deal: WhoAmIDeal | null;
  /** the questions this seat asked about its own card, each with the card's answer */
  asked: WhoAmIAsked[];
  /** questions of its own asked aloud at an open table: counted, never answered by the card */
  aloud: number;
  guesses: Array<{ tile: string; correct: boolean }>;
  solvedAt: number | null;
  out: boolean;
  left: boolean;
  /** right answers given about other seats' cards */
  helped: number;
  /** answers given at all, "not sure" included; everything but a turn let run out */
  answered: number;
}

/** One seat's answer to the question on the table; null when their time ran out. */
interface TableAnswer {
  seat: number;
  says: WhoAmISays | null;
}

export interface WhoAmITableState {
  dialect: LetterDialect;
  difficulty: GameDifficulty;
  /** a table in one room: questions may be asked out loud */
  open: boolean;
  /** the answers offered; a state saved before there were four has none and is a two-answer table */
  answers: WhoAmIAnswerCount;
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
  /**
   * The last question answered: who asked, what the card said and how everyone answered. `truth` is whether the card said
   * yes, as older apps read it; `verdict` is what it said.
   */
  told: { seat: number; question: string; truth: boolean; verdict: WhoAmIAnswer; answers: TableAnswer[] } | null;
  finishedAt: number | null;
  endedBy: 'all-done' | 'time' | 'too-few' | 'abandoned' | null;
}

/** The card on a forehead, as sent to those who may read it. */
export interface WhoAmITableCard {
  word: string;
  meanings: Meanings;
  category: string;
}

/** How one answer to the last question went: scored against the card (`markOf`), or `none` when its time ran out. */
export type WhoAmITableMark = WhoAmIMark | 'none';

export interface WhoAmITableBoard {
  dialect: LetterDialect;
  difficulty: GameDifficulty;
  /** a table in one room, where the player on turn may also ask the room a question of their own */
  open: boolean;
  /** the answers offered: all four, or yes and no alone */
  answers: WhoAmIAnswerCount;
  startedAt: string;
  endsAt: string;
  turn: number | null;
  phase: WhoAmITablePhase;
  phaseEndsAt: string;
  turns: number;
  /** the viewer's own game: their identity only once they have it, are out or the game is over */
  mine: {
    /** the kind of thing it is, when every tile is that kind (`sharedCategory`), and always for a beginner in one room */
    category: string | null;
    /** the tiles to guess from; none at an open table, where a guess is said aloud */
    tiles: WhoAmITile[];
    questions: WhoAmIQuestion[];
    /** the questions to ask next, best first: a few unasked ones from `questions` */
    suggested: string[];
    asked: WhoAmIAsked[];
    /** questions of their own asked aloud at an open table */
    aloud: number;
    guesses: Array<{ tile: string; correct: boolean }>;
    guessesLeft: number;
    /** every dealt question has been asked, so this turn is a guess */
    mustGuess: boolean;
    solved: boolean;
    out: boolean;
    points: number;
    identity: { id: string; word: string; meanings: Meanings } | null;
  } | null;
  /**
   * Everyone at the table. `card` is what is on that seat's forehead, for viewers who may read it: anyone playing but the
   * seat itself, and the seat too once it has it, is out or the game is over. A spectator reads none until the end.
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
  /**
   * The question being answered: who has answered (never what) and the viewer's own answer `says`; `mine` is that as yes or
   * no for older apps (null for any other answer).
   */
  pending: { seat: number; question: WhoAmIQuestion; answered: number[]; waiting: number[]; mine: boolean | null; says: WhoAmISays | null } | null;
  /**
   * The last question answered: `verdict` is what the card said, and each answer has what was said and its `mark`. `truth`,
   * `yes` and `right` are the same for older apps: whether the card said yes, the answer as yes or no (null otherwise), and
   * whether it scored.
   */
  told: {
    seat: number;
    question: WhoAmIQuestion;
    truth: boolean;
    verdict: WhoAmIAnswer;
    answers: Array<{ seat: number; yes: boolean | null; says: WhoAmISays | null; right: boolean; mark: WhoAmITableMark }>;
  } | null;
  /** once the game is over, who everyone was */
  reveal: Array<{ seat: number; word: string; meanings: Meanings }> | null;
  endedBy: WhoAmITableState['endedBy'];
}

/** One answer as a state stores it: `says`, or the yes or no an older saved state holds. */
function readAnswer(a: TableAnswer | { seat: number; yes?: boolean | null; says?: WhoAmISays | null }): TableAnswer {
  if ('says' in a && a.says !== undefined) return { seat: a.seat, says: a.says };
  const yes = (a as { yes?: boolean | null }).yes;
  return { seat: a.seat, says: yes === true ? 'yes' : yes === false ? 'no' : null };
}

/** A copy to change, in today's shape: an older saved state (yes-or-no answers, a truth, no answer count) becomes the same game with them, so it carries on. */
function clone(state: WhoAmITableState): WhoAmITableState {
  const told = state.told;
  return {
    ...state,
    answers: state.answers === 4 ? 4 : 2,
    seats: state.seats.map((s) => ({ ...s, asked: s.asked.map((a) => ({ ...a })), guesses: [...s.guesses] })),
    pending: state.pending ? { question: state.pending.question, answers: state.pending.answers.map(readAnswer) } : null,
    told: told
      ? {
          seat: told.seat,
          question: told.question,
          truth: told.truth,
          verdict: told.verdict ?? (told.truth ? 'yes' : 'no'),
          answers: told.answers.map(readAnswer),
        }
      : null,
  };
}

function wrong(s: TableSeat): number {
  return s.guesses.filter((g) => !g.correct).length;
}

/** Every question a seat asked: from its list, and its own asked aloud. */
function questions(s: TableSeat): number {
  return s.asked.length + s.aloud;
}

/** A seat's score: what its own card earned, plus a point per right answer about another's, up to the cap. */
function points(s: TableSeat): number {
  return whoAmIPoints(questions(s), wrong(s), s.solvedAt !== null) + Math.min(WHO_AM_I_HELP_CAP, s.helped * WHO_AM_I_HELP_POINTS);
}

/** Still guessing: at the table with a card, neither solved nor out. */
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

/** Whether this seat's turn must be a guess: it asked everything on its list. Never in one room, where a question of one's own can always be asked. */
function mustGuess(state: WhoAmITableState, s: TableSeat): boolean {
  return !state.open && askedAll(s);
}

/** The wrong guesses a seat may make before it is out. */
function allowed(state: WhoAmITableState): number {
  return state.open ? WHO_AM_I_ROOM_GUESSES : WHO_AM_I_GUESSES;
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

/** Passes the turn on, or ends the game when nobody is left guessing or fewer than two are at the table, since a card needs a reader. */
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
 * Everyone has answered or run out of time, so the card gives its verdict: the asker's list takes it, each answer the card
 * scores right (`markOf`) earns its giver a point, and the asker decides what to do. Every answer given counts as taking
 * part, "not sure" too; only a turn let run out does not.
 */
function resolve(state: WhoAmITableState, now: number): void {
  const asker = state.seats.find((s) => s.seat === state.turn);
  const pending = state.pending;
  if (!asker || !asker.deal || !pending) return;
  const q = asker.deal.questions.find((x) => x.id === pending.question);
  const verdict: WhoAmIAnswer = q ? verdictFor(asker.deal.identity, q.fact) : 'no';
  asker.asked.push({ question: pending.question, answer: verdict === 'yes', verdict });
  for (const a of pending.answers) {
    const giver = state.seats.find((s) => s.seat === a.seat);
    if (!giver || a.says === null) continue;
    giver.answered++;
    if (markOf(a.says, verdict) === 'right') giver.helped++;
  }
  state.told = { seat: asker.seat, question: pending.question, truth: verdict === 'yes', verdict, answers: pending.answers.map((a) => ({ ...a })) };
  state.pending = null;
  state.phase = 'decide';
  state.phaseEndsAt = now + WHO_AM_I_DECIDE_SECONDS * 1000;
}

/** Whether a seat took part: it asked, answered or guessed at least once. */
function tookPart(s: TableSeat): boolean {
  return questions(s) > 0 || s.answered > 0 || s.guesses.length > 0;
}

/** An answer as yes or no for older apps: null for any other answer, and for none. */
function yesOrNo(says: WhoAmISays | null): boolean | null {
  return says === 'yes' ? true : says === 'no' ? false : null;
}

/** The last question answered as a board shows it: each answer with what was said and how the card scored it. */
function toldView(told: NonNullable<WhoAmITableState['told']>, question: WhoAmIQuestion): NonNullable<WhoAmITableBoard['told']> {
  return {
    seat: told.seat,
    question,
    truth: told.truth,
    verdict: told.verdict,
    answers: told.answers.map((a) => {
      const mark: WhoAmITableMark = a.says === null ? 'none' : markOf(a.says, told.verdict);
      return { seat: a.seat, yes: yesOrNo(a.says), says: a.says, right: mark === 'right', mark };
    }),
  };
}

export const whoAmITableRules: GameRules<WhoAmITableState, WhoAmITableMove, WhoAmITableSettings, WhoAmITableBoard, WhoAmITableOutcome> = {
  init(settings: WhoAmITableSettings, seats: readonly RulesSeat[], start: RulesStart): WhoAmITableState {
    const deals = new Map((settings.deals ?? []).map((d) => [d.seat, d.deal]));
    const state: WhoAmITableState = {
      dialect: settings.dialect,
      difficulty: settings.difficulty,
      open: settings.open === true,
      answers: settings.answers === 4 ? 4 : 2,
      seed: start.seed,
      startedAt: start.now,
      endsAt: start.now + settings.minutes * 60_000,
      seats: seats.map((s) => ({ seat: s.seat, deal: deals.get(s.seat) ?? null, asked: [], aloud: 0, guesses: [], solvedAt: null, out: false, left: false, helped: 0, answered: 0 })),
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
      // An answer is about another's card, while their question is on the table, and is given once.
      const says = whoAmISaysOf(move);
      if (says === null) return { ok: false, reason: 'no-such-answer' };
      // A two-answer table offers yes and no alone: its cards were dealt with nothing else to say.
      if (next.answers === 2 && says !== 'yes' && says !== 'no') return { ok: false, reason: 'not-offered' };
      if (next.phase !== 'answer' || !next.pending) return { ok: false, reason: 'nothing-asked' };
      if (seat === next.turn) return { ok: false, reason: 'own-question' };
      if (next.pending.answers.some((a) => a.seat === seat)) return { ok: false, reason: 'answered' };
      next.pending.answers.push({ seat, says });
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
      // Nobody left to answer (they all just went): the card answers by itself.
      if (unanswered(next).length === 0) resolve(next, now);
      return { ok: true, state: next, outcome: { kind: 'ask', correct: null } };
    }

    if (move.kind === 'aloud') {
      // A question of the asker's own, put to the room: only at a one-room table, and one per turn like any other.
      if (!next.open) return { ok: false, reason: 'not-here' };
      if (next.phase !== 'ask') return { ok: false, reason: 'asked-this-turn' };
      me.aloud++;
      // The room's answer is the room's: the card says nothing, so no card answer stays on the table.
      next.told = null;
      next.phase = 'decide';
      next.phaseEndsAt = now + WHO_AM_I_DECIDE_SECONDS * 1000;
      return { ok: true, state: next, outcome: { kind: 'aloud', correct: null } };
    }

    // A guess or a pass: before asking or once the answer is on the table, never while it is being answered.
    if (next.phase === 'answer') return { ok: false, reason: 'being-answered' };

    if (move.kind === 'pass') {
      // With every question asked there is nothing to wait for: the turn is a guess.
      if (mustGuess(next, me)) return { ok: false, reason: 'must-guess' };
      advance(next, now);
      return { ok: true, state: next, outcome: { kind: 'pass', correct: null } };
    }

    if (move.kind === 'said') {
      // The room judges only where it sits together with the card in front of it.
      if (!next.open) return { ok: false, reason: 'not-here' };
      if (move.close === true) {
        if (move.right) return { ok: false, reason: 'right-or-close' };
        // Another word for the same thing, or another region's word: no guess is spent, and the turn goes on.
        advance(next, now);
        return { ok: true, state: next, outcome: { kind: 'said', correct: null, close: true } };
      }
      me.guesses.push({ tile: '', correct: move.right });
      if (move.right) me.solvedAt = now;
      else if (wrong(me) >= allowed(next)) me.out = true;
      advance(next, now);
      return { ok: true, state: next, outcome: { kind: 'said', correct: move.right } };
    }

    if (!deal.candidates.some((c) => c.id === move.tile)) return { ok: false, reason: 'no-such-tile' };
    if (me.guesses.some((g) => g.tile === move.tile)) return { ok: false, reason: 'guessed' };
    const correct = move.tile === deal.identity.id;
    me.guesses.push({ tile: move.tile, correct });
    if (correct) me.solvedAt = now;
    else if (wrong(me) >= allowed(next)) me.out = true;
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
      // Those who did not answer in time, or are away, are passed over: the card does not wait for them.
      const waiting = new Set(unanswered(next));
      for (const seat of seats) if (waiting.has(seat)) next.pending.answers.push({ seat, says: null });
      if (unanswered(next).length === 0) resolve(next, now);
      return next;
    }
    if (next.turn === null || !seats.includes(next.turn)) return state;
    const me = next.seats.find((s) => s.seat === next.turn)!;
    // A forced guess let run out puts the player out, so the game cannot be waited out for ever.
    if (mustGuess(next, me)) me.out = true;
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
      // The one the question was waiting on has gone: the card answers.
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
   * A game counts when it was played, not called off with everyone gone, and at least two seats took part; one player with
   * an idle second seat is paid nothing.
   */
  counted(state: WhoAmITableState): boolean {
    return state.finishedAt !== null && state.endedBy !== 'abandoned' && state.seats.filter(tookPart).length >= 2;
  },

  viewFor(saved: WhoAmITableState, seat: number | null): WhoAmITableBoard {
    // Read in today's shape, so a game saved before the four answers shows as it was.
    const state = clone(saved);
    const done = state.finishedAt !== null;
    const me = seat === null ? undefined : state.seats.find((s) => s.seat === seat);
    const deal = me?.deal ?? null;
    const showMeanings = state.difficulty === 'beginner';
    // Who may read the cards at all: someone with a card of their own, still at the table.
    const reads = !!me && present(me);
    // A beginner in one room is always told the kind, since there are no tiles on the phone for it to single the card out
    // from; elsewhere it is named only when every tile is of that kind.
    const toldKind = state.open && state.difficulty === 'beginner';
    const kind = deal ? (toldKind ? deal.identity.category : sharedCategory(deal.identity.category, deal.candidates)) : null;
    const question = (owner: number, id: string): WhoAmIQuestion => {
      const q = state.seats.find((s) => s.seat === owner)?.deal?.questions.find((x) => x.id === id);
      return { id, ku: q?.ku ?? '', meanings: q?.meanings ?? { en: '' } };
    };
    const own = (s: TableSeat): boolean => s.solvedAt !== null || s.out || done;
    return {
      dialect: state.dialect,
      difficulty: state.difficulty,
      open: state.open,
      answers: state.answers,
      startedAt: new Date(state.startedAt).toISOString(),
      endsAt: new Date(state.endsAt).toISOString(),
      turn: state.turn,
      phase: state.phase,
      phaseEndsAt: new Date(state.phaseEndsAt).toISOString(),
      turns: state.turns,
      mine:
        me && deal
          ? {
              category: kind,
              // In one room there is nothing to pick from: who they are is said aloud and the room judges it.
              tiles: state.open ? [] : deal.candidates.map((c) => ({ id: c.id, word: c.word, meanings: showMeanings ? c.meanings : null })),
              questions: deal.questions.map((q) => ({ id: q.id, ku: q.ku, meanings: q.meanings })),
              // Only while there is a card left to find, chosen from what this player already sees, never from the card.
              suggested: guessing(me) ? suggestWhoAmIQuestions(deal.questions, me.asked, kind) : [],
              asked: me.asked.map((a) => ({ ...a })),
              aloud: me.aloud,
              guesses: me.guesses.map((g) => ({ ...g })),
              guessesLeft: Math.max(0, allowed(state) - wrong(me)),
              mustGuess: guessing(me) && mustGuess(state, me),
              solved: me.solvedAt !== null,
              out: me.out,
              points: points(me),
              // Your own card comes off your forehead once you have it, are out or the game is over.
              identity: own(me) ? { id: deal.identity.id, word: deal.identity.word, meanings: deal.identity.meanings } : null,
            }
          : null,
      seats: state.seats.map((s) => ({
        seat: s.seat,
        asked: questions(s),
        wrong: wrong(s),
        solved: s.solvedAt !== null,
        out: s.out,
        left: s.left,
        helped: s.helped,
        points: points(s),
        solvedAt: s.solvedAt === null ? null : new Date(s.solvedAt).toISOString(),
        // A card is read by everyone playing but its wearer, until it comes off.
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
              mine: yesOrNo(state.pending.answers.find((a) => a.seat === seat)?.says ?? null),
              says: state.pending.answers.find((a) => a.seat === seat)?.says ?? null,
            }
          : null,
      told: state.told ? toldView(state.told, question(state.told.seat, state.told.question)) : null,
      reveal: done ? state.seats.filter((s) => s.deal).map((s) => ({ seat: s.seat, word: s.deal!.identity.word, meanings: s.deal!.identity.meanings })) : null,
      endedBy: state.endedBy,
    };
  },

  places(state: WhoAmITableState): readonly Placed[] {
    // By points; among equals, whoever has their card before whoever has not, then whoever had it sooner. Those with no
    // point and those who left share last place, so a table where nobody found a card or answered right has no winner to pay.
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
