/**
 * Kurdish Bluff: a party game for three to eight. Each round shows one
 * unfamiliar Kurdish word. Everyone writes a believable fake meaning for it,
 * in the language the host chose; the fakes are shuffled in with the real
 * meaning, and everyone votes for the one they think is real. Finding the real
 * meaning is worth BLUFF_FOUND_POINTS; every player who picks a fake you wrote
 * is worth BLUFF_FOOLED_POINTS to you. The reveal teaches the word: its real
 * meaning, who wrote which fake, who fell for it, and an example sentence when
 * the card has one.
 *
 * These are the rules alone, pure (shared/src/games/multi/rules.ts). The deck
 * is dealt on the server from approved `bluff_card` rows before `init` (each
 * card with its real meaning in the chosen language), and a fake has passed
 * the chat's free-text gate before it reaches `apply`
 * (api/src/mp/games/bluff.ts).
 *
 * Hidden until the reveal, in every view: the real meaning, which option is
 * real (the options are shuffled with the game's seed, which never leaves the
 * server, and named by letter in that order), who wrote what, and how anyone
 * voted — a view says only who has written and who has voted. A player is
 * never offered their own fake, nor one somebody else wrote word for word the
 * same (identical texts are one option, written by both). A player whose fake
 * is the real meaning knew the word: that is worth the same as finding it, and
 * they sit the vote out.
 *
 * Phases: write (everyone at once, against the clock), vote (everyone who has
 * at least two options to choose between), reveal (a few seconds, waiting on
 * nobody), then the next word. A phase closes as soon as nobody is left to
 * wait for. A player who is away is passed over for the phase they are in;
 * one who leaves is out, and their fake stays in play.
 */
import type { AppLocale } from '../../locales.js';
import type { LetterDialect } from '../letters.js';
import { seededUnit } from '../last-letter/rules.js';
import type { ApplyResult, GameRules, Placed, RulesSeat, RulesStart } from '../multi/rules.js';

export const BLUFF_MIN_PLAYERS = 3;
export const BLUFF_MAX_PLAYERS = 8;
/** Words in a game, as the host may choose; the middle one unless chosen. */
export const BLUFF_ROUNDS = [3, 5, 7] as const;
export type BluffRounds = (typeof BLUFF_ROUNDS)[number];
export const BLUFF_DEFAULT_ROUNDS: BluffRounds = 5;
/** Time to write a fake, as the host may choose. */
export const BLUFF_WRITE_SECONDS = [60, 90, 120] as const;
export type BluffWriteSeconds = (typeof BLUFF_WRITE_SECONDS)[number];
export const BLUFF_DEFAULT_WRITE_SECONDS: BluffWriteSeconds = 90;
/** Time to vote. */
export const BLUFF_VOTE_SECONDS = 45;
/** How long the reveal stays up before the next word. */
export const BLUFF_REVEAL_SECONDS = 15;
/** The longest fake a player may write, in characters. */
export const BLUFF_FAKE_MAX = 120;
export const BLUFF_FOUND_POINTS = 2;
export const BLUFF_FOOLED_POINTS = 1;
/** Approved cards a dialect needs before the game is offered in it. */
export const BLUFF_MIN_CARDS = 20;
/** Cards with a real meaning in a language before definitions may be written in it. */
export const BLUFF_MIN_LANGUAGE_CARDS = 10;

export interface BluffSettings {
  dialect: LetterDialect;
  /** the language every definition is written in, real and fake */
  language: AppLocale;
  rounds: BluffRounds;
  writeSeconds: BluffWriteSeconds;
  /** the cards, dealt by the server at the start; never stored in the lobby's settings */
  deck?: readonly BluffDealtCard[];
}

/** One word of the game, as the server dealt it from an approved card. */
export interface BluffDealtCard {
  /** the card's id, so a game can be traced to the reviewed row it showed */
  id: string;
  word: string;
  /** its real meaning, in the game's language */
  real: string;
  /** a sentence using it, with its meaning in the game's language (or English) when the card has one */
  example: { ku: string; meaning: string | null } | null;
}

export type BluffMove = { kind: 'write'; text: string } | { kind: 'vote'; option: string };

/** What the mover is told. */
export interface BluffOutcome {
  kind: 'write' | 'vote';
  /** the fake was the real meaning, word for word: they knew it */
  knewIt: boolean;
}

export type BluffPhase = 'write' | 'vote' | 'reveal';

interface SeatState {
  seat: number;
  score: number;
  left: boolean;
}

interface Option {
  id: string;
  text: string;
  key: string;
  real: boolean;
  authors: number[];
}

interface RoundState {
  fakes: Array<{ seat: number; text: string; key: string }>;
  knewIt: number[];
  /** passed over in the phase under way (away), so not waited for */
  passed: number[];
  options: Option[] | null;
  /** who may vote this round: those with at least two options to choose between */
  voters: number[];
  votes: Array<{ seat: number; option: string }>;
  points: Array<{ seat: number; found: number; fooled: number; knewIt: number }> | null;
}

export interface BluffState {
  dialect: LetterDialect;
  language: AppLocale;
  seed: string;
  writeMs: number;
  voteMs: number;
  revealMs: number;
  seats: SeatState[];
  deck: BluffDealtCard[];
  /** the word being played, from 0 */
  round: number;
  phase: BluffPhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  current: RoundState;
  /** the reveals of the words already played, oldest first */
  past: BluffReveal[];
  finishedAt: number | null;
  endedBy: 'rounds' | 'too-few' | 'abandoned' | null;
}

/** One option on the table during the vote: a letter and a text, nothing else. */
export interface BluffOptionView {
  id: string;
  text: string;
}

/** A word revealed: everything that was hidden about it. */
export interface BluffReveal {
  /** from 1 */
  round: number;
  word: string;
  real: string;
  example: { ku: string; meaning: string | null } | null;
  options: Array<{ id: string; text: string; real: boolean; authors: number[]; voters: number[] }>;
  /** whose fake was the real meaning */
  knewIt: number[];
  points: Array<{ seat: number; found: number; fooled: number; knewIt: number; total: number }>;
}

export interface BluffBoard {
  dialect: LetterDialect;
  language: AppLocale;
  /** from 1 */
  round: number;
  rounds: number;
  phase: BluffPhase | 'done';
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  /** the word on the table (the last one once the game is over) */
  word: string | null;
  /** who has written this round, never what */
  writtenBy: number[];
  /** who has voted, never for what */
  votedBy: number[];
  /** who may vote this round, once the writing is over */
  voters: number[];
  /** what this viewer did this round */
  mine: { wrote: string | null; knewIt: boolean; vote: string | null; canWrite: boolean; canVote: boolean } | null;
  /** the options this viewer may choose from while the vote is on: never their own, never which is real */
  options: BluffOptionView[] | null;
  /** the word just revealed, while the reveal is up; after the end, the last word */
  reveal: BluffReveal | null;
  /** every word played so far, revealed, oldest first */
  history: BluffReveal[];
  scores: Array<{ seat: number; score: number; left: boolean }>;
  endedBy: BluffState['endedBy'];
}

/** A text as two fakes are compared: case, accents, punctuation and spacing do not make two texts different. */
export function definitionKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The items in an order drawn from the seed and a salt, the same on every replica. */
function seeded<T>(seed: string, salt: string, items: readonly T[], keyOf: (item: T, i: number) => string): T[] {
  return items
    .map((item, i) => ({ item, k: seededUnit(seed, `${salt}:${keyOf(item, i)}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}

/** Option names, in the order the options are laid out. */
const LETTERS = 'ABCDEFGHIJ';

function clone(state: BluffState): BluffState {
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s })),
    current: {
      fakes: [...state.current.fakes],
      knewIt: [...state.current.knewIt],
      passed: [...state.current.passed],
      options: state.current.options ? state.current.options.map((o) => ({ ...o, authors: [...o.authors] })) : null,
      voters: [...state.current.voters],
      votes: [...state.current.votes],
      points: state.current.points ? state.current.points.map((p) => ({ ...p })) : null,
    },
    past: [...state.past],
  };
}

function freshRound(): RoundState {
  return { fakes: [], knewIt: [], passed: [], options: null, voters: [], votes: [], points: null };
}

function present(state: BluffState): SeatState[] {
  return state.seats.filter((s) => !s.left);
}

function card(state: BluffState): BluffDealtCard | null {
  return state.deck[state.round] ?? null;
}

function finish(state: BluffState, now: number, why: NonNullable<BluffState['endedBy']>): void {
  state.finishedAt = now;
  state.endedBy = why;
}

function setPhase(state: BluffState, phase: BluffPhase, now: number): void {
  state.phase = phase;
  state.phaseStartedAt = now;
  state.phaseEndsAt = now + (phase === 'write' ? state.writeMs : phase === 'vote' ? state.voteMs : state.revealMs);
  state.current.passed = [];
}

/** The seats an option is hidden from: its authors. */
function visibleTo(option: Option, seat: number): boolean {
  return !option.authors.includes(seat);
}

/** The writing is over: lay the options out, and vote — or reveal at once when nobody bluffed or nobody can vote. */
function closeWrite(state: BluffState, now: number): void {
  const c = card(state)!;
  const byKey = new Map<string, Option>();
  const realKey = definitionKey(c.real);
  byKey.set(realKey, { id: '', text: c.real, key: realKey, real: true, authors: [] });
  for (const f of state.current.fakes) {
    const had = byKey.get(f.key);
    if (had) {
      if (!had.real) had.authors.push(f.seat);
      continue;
    }
    byKey.set(f.key, { id: '', text: f.text, key: f.key, real: false, authors: [f.seat] });
  }
  const laid = seeded(state.seed, `options:${state.round}`, [...byKey.values()], (o) => o.key).map((o, i) => ({ ...o, id: LETTERS[i] ?? String(i + 1) }));
  state.current.options = laid;
  const bluffs = laid.filter((o) => !o.real).length;
  state.current.voters = present(state)
    .filter((s) => !state.current.knewIt.includes(s.seat) && laid.filter((o) => visibleTo(o, s.seat)).length >= 2)
    .map((s) => s.seat);
  if (bluffs === 0 || state.current.voters.length === 0) closeVote(state, now);
  else setPhase(state, 'vote', now);
}

/** The vote is over: score it, and show everything. */
function closeVote(state: BluffState, now: number): void {
  const options = state.current.options ?? [];
  const points = state.seats.map((s) => ({ seat: s.seat, found: 0, fooled: 0, knewIt: state.current.knewIt.includes(s.seat) ? BLUFF_FOUND_POINTS : 0 }));
  for (const v of state.current.votes) {
    const o = options.find((x) => x.id === v.option);
    if (!o) continue;
    if (o.real) points.find((p) => p.seat === v.seat)!.found += BLUFF_FOUND_POINTS;
    else for (const author of o.authors) if (author !== v.seat) points.find((p) => p.seat === author)!.fooled += BLUFF_FOOLED_POINTS;
  }
  for (const p of points) state.seats.find((s) => s.seat === p.seat)!.score += p.found + p.fooled + p.knewIt;
  state.current.points = points;
  state.past = [...state.past, revealOf(state)];
  setPhase(state, 'reveal', now);
}

/** The reveal is over: the next word, or the end. */
function closeReveal(state: BluffState, now: number): void {
  if (state.round + 1 >= state.deck.length) return finish(state, now, 'rounds');
  state.round += 1;
  state.current = freshRound();
  setPhase(state, 'write', now);
}

function closePhase(state: BluffState, now: number): void {
  if (state.phase === 'write') closeWrite(state, now);
  else if (state.phase === 'vote') closeVote(state, now);
  else closeReveal(state, now);
}

function waiting(state: BluffState): number[] {
  if (state.finishedAt !== null) return [];
  const c = state.current;
  if (state.phase === 'write') {
    return present(state)
      .map((s) => s.seat)
      .filter((seat) => !c.fakes.some((f) => f.seat === seat) && !c.knewIt.includes(seat) && !c.passed.includes(seat));
  }
  if (state.phase === 'vote') return c.voters.filter((seat) => !c.votes.some((v) => v.seat === seat) && !c.passed.includes(seat) && !state.seats.find((s) => s.seat === seat)?.left);
  return [];
}

/** Whether anyone did what the phase under way is for: wrote, or voted. */
function acted(state: BluffState): boolean {
  const c = state.current;
  return state.phase === 'write' ? c.fakes.length + c.knewIt.length > 0 : c.votes.length > 0;
}

/**
 * Close every phase that has nobody left to wait for, once somebody did what
 * it is for. A phase everyone was passed over in (all of them away) runs to its
 * clock instead, so a table that stepped away is not rushed through its words;
 * a reveal is closed by its clock alone.
 */
function settle(state: BluffState, now: number): void {
  while (state.finishedAt === null && state.phase !== 'reveal' && waiting(state).length === 0 && acted(state)) closePhase(state, now);
}

function revealOf(state: BluffState): BluffReveal {
  const c = card(state)!;
  const options = state.current.options ?? [];
  const points = state.current.points ?? [];
  return {
    round: state.round + 1,
    word: c.word,
    real: c.real,
    example: c.example ? { ...c.example } : null,
    options: options.map((o) => ({
      id: o.id,
      text: o.text,
      real: o.real,
      authors: [...o.authors],
      voters: state.current.votes.filter((v) => v.option === o.id).map((v) => v.seat),
    })),
    knewIt: [...state.current.knewIt],
    points: points.map((p) => ({ ...p, total: p.found + p.fooled + p.knewIt })),
  };
}

export const bluffRules: GameRules<BluffState, BluffMove, BluffSettings, BluffBoard, BluffOutcome> = {
  init(settings: BluffSettings, seats: readonly RulesSeat[], start: RulesStart): BluffState {
    const state: BluffState = {
      dialect: settings.dialect,
      language: settings.language,
      seed: start.seed,
      writeMs: settings.writeSeconds * 1000,
      voteMs: BLUFF_VOTE_SECONDS * 1000,
      revealMs: BLUFF_REVEAL_SECONDS * 1000,
      seats: seats.map((s) => ({ seat: s.seat, score: 0, left: false })),
      deck: (settings.deck ?? []).slice(0, settings.rounds).map((c) => ({ ...c })),
      round: 0,
      phase: 'write',
      phaseStartedAt: start.now,
      phaseEndsAt: start.now + settings.writeSeconds * 1000,
      current: freshRound(),
      past: [],
      finishedAt: null,
      endedBy: null,
    };
    if (state.deck.length === 0 || state.seats.length < 2) finish(state, start.now, 'too-few');
    return state;
  },

  apply(state: BluffState, seat: number, move: BluffMove, now: number): ApplyResult<BluffState, BluffOutcome> {
    if (state.finishedAt !== null) return { ok: false, reason: 'finished' };
    if (!waiting(state).includes(seat)) return { ok: false, reason: 'not-now' };
    const next = clone(state);
    if (move.kind === 'write') {
      if (next.phase !== 'write') return { ok: false, reason: 'not-writing' };
      const text = move.text.trim().slice(0, BLUFF_FAKE_MAX);
      const key = definitionKey(text);
      if (key === '') return { ok: false, reason: 'empty' };
      const knewIt = key === definitionKey(card(next)!.real);
      if (knewIt) next.current.knewIt.push(seat);
      else next.current.fakes.push({ seat, text, key });
      settle(next, now);
      return { ok: true, state: next, outcome: { kind: 'write', knewIt } };
    }
    if (next.phase !== 'vote') return { ok: false, reason: 'not-voting' };
    const option = next.current.options?.find((o) => o.id === move.option);
    if (!option) return { ok: false, reason: 'no-such-option' };
    if (!visibleTo(option, seat)) return { ok: false, reason: 'own-option' };
    next.current.votes.push({ seat, option: option.id });
    settle(next, now);
    return { ok: true, state: next, outcome: { kind: 'vote', knewIt: false } };
  },

  waitingFor(state: BluffState): number[] {
    return waiting(state);
  },

  dueAt(state: BluffState): number | null {
    return state.finishedAt === null ? state.phaseEndsAt : null;
  },

  timeout(state: BluffState, seats: readonly number[], now: number): BluffState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    if (now >= state.phaseEndsAt) {
      // the clock ran out: the phase closes as it stands
      closePhase(next, now);
    } else {
      // passed over while away: not waited for in this phase
      const waited = waiting(next);
      const passing = seats.filter((s) => waited.includes(s));
      if (passing.length === 0) return state;
      next.current.passed.push(...passing);
    }
    settle(next, now);
    return next;
  },

  drop(state: BluffState, seat: number, now: number): BluffState {
    if (state.finishedAt !== null) return state;
    const s = state.seats.find((x) => x.seat === seat);
    if (!s || s.left) return state;
    const next = clone(state);
    next.seats.find((x) => x.seat === seat)!.left = true;
    if (present(next).length < 2) {
      finish(next, now, 'too-few');
      return next;
    }
    settle(next, now);
    return next;
  },

  end(state: BluffState, now: number): BluffState {
    if (state.finishedAt !== null) return state;
    const next = clone(state);
    finish(next, now, 'abandoned');
    return next;
  },

  finished(state: BluffState): boolean {
    return state.finishedAt !== null;
  },

  viewFor(state: BluffState, seat: number | null): BluffBoard {
    const c = state.current;
    const done = state.finishedAt !== null;
    const word = card(state)?.word ?? state.deck.at(-1)?.word ?? null;
    const member = seat !== null && state.seats.some((s) => s.seat === seat);
    const voting = !done && state.phase === 'vote';
    const revealing = !done && state.phase === 'reveal';
    const wrote = member ? (c.fakes.find((f) => f.seat === seat)?.text ?? null) : null;
    const knewIt = member && c.knewIt.includes(seat!);
    const waitingNow = waiting(state);
    return {
      dialect: state.dialect,
      language: state.language,
      round: Math.min(state.round + 1, Math.max(1, state.deck.length)),
      rounds: state.deck.length,
      phase: done ? 'done' : state.phase,
      phaseStartedAt: done ? null : new Date(state.phaseStartedAt).toISOString(),
      phaseEndsAt: done ? null : new Date(state.phaseEndsAt).toISOString(),
      word,
      writtenBy: [...c.fakes.map((f) => f.seat), ...c.knewIt].sort((a, b) => a - b),
      votedBy: c.votes.map((v) => v.seat).sort((a, b) => a - b),
      voters: state.phase === 'write' && !done ? [] : [...c.voters],
      mine: member
        ? {
            wrote: knewIt ? (card(state)?.real ?? null) : wrote,
            knewIt,
            vote: c.votes.find((v) => v.seat === seat)?.option ?? null,
            canWrite: !done && state.phase === 'write' && waitingNow.includes(seat!),
            canVote: voting && waitingNow.includes(seat!),
          }
        : null,
      // the vote: letters and texts only, and never the viewer's own
      options: voting && c.options ? c.options.filter((o) => seat === null || visibleTo(o, seat)).map((o) => ({ id: o.id, text: o.text })) : null,
      reveal: revealing || done ? (state.past.at(-1) ?? null) : null,
      history: state.past.map((r) => ({ ...r })),
      scores: state.seats.map((s) => ({ seat: s.seat, score: s.score, left: s.left })),
      endedBy: state.endedBy,
    };
  },

  places(state: BluffState): readonly Placed[] {
    // still at the table first, by score; then those who left, by score
    const order = [...state.seats].sort((a, b) => Number(a.left) - Number(b.left) || b.score - a.score || a.seat - b.seat);
    const placed: Placed[] = [];
    order.forEach((s, i) => {
      const prev = order[i - 1];
      const tie = prev && prev.left === s.left && prev.score === s.score;
      placed.push({ seat: s.seat, place: tie ? placed[i - 1]!.place : i + 1, score: s.score });
    });
    return placed;
  },
};

// ---------- where the game is offered ----------

/** One language definitions may be written in, and how many approved cards have their real meaning in it. */
export interface BluffLanguageCount {
  language: AppLocale;
  cards: number;
}

/** `GET /mp/bluff/availability`: per dialect, whether it is offered, and in which languages. */
export interface BluffAvailability {
  dialect: LetterDialect;
  group: boolean;
  solo: boolean;
  /** the languages with at least BLUFF_MIN_LANGUAGE_CARDS cards, most cards first */
  languages?: BluffLanguageCount[];
}

/**
 * The rule, from the counts: offered in a dialect once it has BLUFF_MIN_CARDS
 * approved cards and at least one language with BLUFF_MIN_LANGUAGE_CARDS of
 * them; the languages offered are those that have that many.
 */
export function bluffOffer(total: number, byLanguage: Readonly<Record<string, number>>): { group: boolean; languages: BluffLanguageCount[] } {
  const languages = Object.entries(byLanguage)
    .filter(([, n]) => n >= BLUFF_MIN_LANGUAGE_CARDS)
    .map(([language, cards]) => ({ language: language as AppLocale, cards }))
    .sort((a, b) => b.cards - a.cards || a.language.localeCompare(b.language));
  return { group: total >= BLUFF_MIN_CARDS && languages.length > 0, languages };
}

/** The language a host is offered first: their own interface's when it is offered, else English, else the one with most cards. */
export function defaultBluffLanguage(offered: readonly BluffLanguageCount[], locale: string): AppLocale | null {
  return (offered.find((l) => l.language === locale) ?? offered.find((l) => l.language === 'en') ?? offered[0])?.language ?? null;
}
