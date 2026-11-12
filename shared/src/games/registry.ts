/**
 * The learning games, in one list: what each is, how it is played, what it
 * is made of and what it pays. The API counts what each game can be played
 * with (GET /games/availability), the admin panel files content by it, and
 * both apps build Learn's games from it, so a game added here is added
 * everywhere at once.
 *
 * Peyvok, Peyvok Battle, the rhyme games, the typing race and the story games
 * are not in this list: they have their own pages, rules and tables, and stay
 * as they are. These are the games built on the shared kit (api/src/games).
 *
 * A game is shown to a learner only when it has enough approved content for
 * their variety (`minimum`, at some difficulty), and only by an app that has
 * a screen for it; there is no "coming soon".
 *
 * Two entries are not games any more but exercises of the lessons' practice
 * (`place: 'lessons'`): Build a Kurdish Sentence and Hear It, Find It. They
 * are still rounds of the solo kit, made, checked and paid by the same rules,
 * which is why they stay in this list; Learn's Games never lists them, and
 * the lessons' practice does.
 *
 * Don't Say the Word!, Kurdish Bluff, The Village and What Would You Say? are
 * no longer part of Hevalo (`RETIRED_GAME_IDS`). Nothing lists, opens or
 * starts one; their names are kept only so that what was written while they
 * were played is still read for what it is.
 *
 * Per-game modules. The registry is data only and imports no game: a game's
 * own rules live in a folder of its own beside this file —
 * `build-sentence/` for Build a Kurdish Sentence, `last-letter/` for The Last
 * Letter, `multi/` for the multiplayer engine every game with friends shares — and are
 * exported through `games/index.ts`, one line per module. A new game adds its
 * entry here and its folder there; nothing else in this file changes.
 */
import type { UnitTone } from '../lesson-path.js';
import type { GameContentKind } from './content.js';
import { GAME_DIALECTS, type GameDialect } from './dialect.js';

export const LEARN_GAME_IDS = [
  'build-sentence',
  'memory-thief',
  'hear-it',
  'detective',
  'last-letter',
  'impostor',
  'who-am-i',
] as const;
export type LearnGameId = (typeof LEARN_GAME_IDS)[number];

export function isLearnGameId(v: unknown): v is LearnGameId {
  return (LEARN_GAME_IDS as readonly unknown[]).includes(v);
}

/**
 * Games that were part of Hevalo once and are not any more. No list, page,
 * invitation or lobby offers one, and the server refuses to start one. The
 * names stay known because rows written while they were played still carry
 * them (matches, rounds played alone, XP, old invitations in a chat):
 * whatever reads such a row says the game is no longer played, rather than
 * failing on a name it has never heard of.
 */
export const RETIRED_GAME_IDS = ['dont-say', 'bluff', 'kingdom', 'what-would-you-say'] as const;
export type RetiredGameId = (typeof RETIRED_GAME_IDS)[number];

export function isRetiredGame(v: unknown): v is RetiredGameId {
  return (RETIRED_GAME_IDS as readonly unknown[]).includes(v);
}

/**
 * The XP sources the retired games paid from, and the one Who Am I? paid from
 * while it could be played alone (`game_who_am_i`; the game is played with
 * others only now). They are still game sources: XP already in the ledger
 * under one of them keeps counting as game XP, under the league's daily cap,
 * exactly as it did the day it was earned.
 */
export const RETIRED_GAME_XP_SOURCES: readonly string[] = ['game_dont_say_place', 'game_bluff_place', 'game_what_would_you_say', 'game_who_am_i'];

/** How a game is played: alone, with others, or either. */
export type LearnGameMode = 'solo' | 'multi' | 'both';

/**
 * Where a learner finds an entry: among Learn's games, or with the lessons'
 * practice (an exercise the solo kit runs that is not a game).
 */
export type LearnGamePlace = 'games' | 'lessons';

/**
 * Approved Kurdish a game reads where it already is, besides its own rows:
 *   lesson-sentences — published lessons' translations and conversation lines, with English and accepted orders
 *   conversations    — published lessons' conversations, a few lines at a time
 *   vocabulary       — published lessons' word pairs, and published stories' glossaries
 *   story-passages   — published stories' paragraphs, with the glossary terms in each
 *   recordings       — people's recordings (lesson, alphabet and dictionary audio), never synthesised ones
 *   dictionary       — dictionary rows, only ever to check a player's word (and `in_games` words for the computer's moves)
 */
export const TRUSTED_SOURCES = ['lesson-sentences', 'conversations', 'vocabulary', 'story-passages', 'recordings', 'dictionary'] as const;
export type TrustedSource = (typeof TRUSTED_SOURCES)[number];

/**
 * The picture on a game's card, by name. Each app draws it from its own icon
 * set (the phone's names are these; the browser maps them to the same glyphs).
 */
export type GameGlyph = 'tiles' | 'eye' | 'headphones' | 'search' | 'text-t' | 'people' | 'question';

export interface LearnGame {
  id: LearnGameId;
  mode: LearnGameMode;
  place: LearnGamePlace;
  /** how many people play one game; a solo game is 1 to 1 */
  players: { min: number; max: number };
  /** players type their own words, which go through the chat's safety checks before anyone else sees them */
  freeText: boolean;
  /** the approved sources it reads */
  sources: readonly TrustedSource[];
  /** its own `game_content` kinds */
  contentKinds: readonly GameContentKind[];
  /**
   * The approved items of its main content one difficulty must hold for the
   * game to be offered at it: sentences, passages, case files, cards…
   */
  minimum: number;
  /** the XP ledger sources it pays from; every one is a game source, under the league's daily cap */
  xpSources: readonly string[];
  /** the varieties it can be played in; dialects never mix in one game */
  dialects: readonly GameDialect[];
  glyph: GameGlyph;
  /** its card's colour, one of the path's tones */
  tone: UnitTone;
}

export const LEARN_GAMES: readonly LearnGame[] = [
  {
    id: 'build-sentence',
    mode: 'solo',
    place: 'lessons',
    players: { min: 1, max: 1 },
    freeText: false,
    sources: ['lesson-sentences', 'vocabulary'],
    contentKinds: ['sentence'],
    minimum: 30,
    xpSources: ['game_build_sentence'],
    dialects: GAME_DIALECTS,
    glyph: 'tiles',
    tone: 'clay',
  },
  {
    id: 'memory-thief',
    mode: 'solo',
    place: 'games',
    players: { min: 1, max: 1 },
    freeText: false,
    sources: ['story-passages', 'conversations'],
    contentKinds: ['passage'],
    minimum: 6,
    xpSources: ['game_memory_thief'],
    dialects: GAME_DIALECTS,
    glyph: 'eye',
    tone: 'saffron',
  },
  {
    id: 'hear-it',
    mode: 'solo',
    place: 'lessons',
    players: { min: 1, max: 1 },
    freeText: false,
    sources: ['recordings'],
    contentKinds: [],
    minimum: 20,
    xpSources: ['game_hear_it'],
    dialects: GAME_DIALECTS,
    glyph: 'headphones',
    tone: 'meadow',
  },
  {
    id: 'detective',
    mode: 'solo',
    place: 'games',
    players: { min: 1, max: 1 },
    freeText: false,
    sources: ['lesson-sentences', 'story-passages', 'recordings'],
    contentKinds: ['case_file'],
    minimum: 1,
    xpSources: ['game_detective'],
    dialects: GAME_DIALECTS,
    glyph: 'search',
    tone: 'pine',
  },
  {
    id: 'last-letter',
    mode: 'both',
    place: 'games',
    players: { min: 1, max: 8 },
    freeText: false,
    sources: ['dictionary', 'vocabulary'],
    contentKinds: [],
    minimum: 200,
    xpSources: ['game_last_letter', 'game_last_letter_solo'],
    dialects: GAME_DIALECTS,
    glyph: 'text-t',
    tone: 'saffron',
  },
  {
    id: 'impostor',
    mode: 'multi',
    place: 'games',
    players: { min: 3, max: 8 },
    freeText: true,
    sources: ['vocabulary'],
    contentKinds: ['word_card', 'word_category'],
    minimum: 12,
    xpSources: ['game_impostor_place'],
    dialects: GAME_DIALECTS,
    glyph: 'people',
    tone: 'rose',
  },
  {
    id: 'who-am-i',
    // a card is read by somebody else: with friends online, or on one phone passed round a room; never alone
    mode: 'multi',
    place: 'games',
    players: { min: 2, max: 6 },
    freeText: false,
    sources: ['vocabulary'],
    contentKinds: ['identity', 'question_template'],
    minimum: 10,
    xpSources: ['game_who_am_i_place'],
    dialects: GAME_DIALECTS,
    glyph: 'question',
    tone: 'meadow',
  },
];

/** A game's entry; every id has one. */
export function learnGame(id: LearnGameId): LearnGame {
  return LEARN_GAMES.find((g) => g.id === id)!;
}

/**
 * Every XP source the learning games pay from or ever paid from, for the
 * API's list of game sources (and its league cap).
 */
export const LEARN_GAME_XP_SOURCES: readonly string[] = [...new Set([...LEARN_GAMES.flatMap((g) => g.xpSources), ...RETIRED_GAME_XP_SOURCES])];

/** Everything the solo kit runs a round of, the lessons' two exercises included, in the registry's order. */
export function soloGames(): LearnGame[] {
  return LEARN_GAMES.filter((g) => g.mode === 'solo' || g.mode === 'both');
}

/** A game as Learn lists it, and whether it can be played in the learner's variety yet. */
export interface ListedLearnGame {
  game: LearnGame;
  /** false while the game is still short of approved content: listed as coming soon, with no way in */
  ready: boolean;
}

/**
 * The games an app lists in Learn: every game it has a screen for
 * (`playable`), those with enough approved content in the learner's variety
 * first and the rest after them as coming soon, each group in the registry's
 * order. A game is shown before its content is ready so a learner knows it is
 * on its way; it opens only once it is, so nothing is ever played on drafts.
 * Before the availability has arrived (null) nothing is listed, so the cards
 * do not reshuffle as it lands. The lessons' exercises are never in the list.
 */
export function listedLearnGames(
  availability: { games: ReadonlyArray<{ id: string; available: boolean }> } | null | undefined,
  playable: readonly LearnGameId[],
): ListedLearnGame[] {
  if (!availability) return [];
  const open = new Set((availability.games ?? []).filter((g) => g.available).map((g) => g.id));
  const listed = LEARN_GAMES.filter((g) => g.place === 'games' && playable.includes(g.id)).map((game) => ({ game, ready: open.has(game.id) }));
  return [...listed.filter((g) => g.ready), ...listed.filter((g) => !g.ready)];
}

/**
 * The exercises the lessons' practice offers besides its own sessions: those
 * an app has a screen for (`playable`) that can be done in the learner's
 * variety now, in the registry's order. One that is short of approved content
 * is not shown at all: practice is a place to do something, and a card that
 * opens nothing does not belong in it. Nothing is listed before the
 * availability has arrived.
 */
export function lessonExercises(
  availability: { games: ReadonlyArray<{ id: string; available: boolean }> } | null | undefined,
  playable: readonly LearnGameId[],
): LearnGame[] {
  if (!availability) return [];
  const open = new Set((availability.games ?? []).filter((g) => g.available).map((g) => g.id));
  return LEARN_GAMES.filter((g) => g.place === 'lessons' && playable.includes(g.id) && open.has(g.id));
}

const DAY_MS = 86_400_000;

/**
 * Which of `count` games a page puts forward today, by its place among them:
 * a different one each day, the same one for everybody all day (UTC), on the
 * website and on the phone alike. Null while there is nothing to put forward.
 */
export function gameOfTheDay(count: number, now: number): number | null {
  return count > 0 ? Math.floor(now / DAY_MS) % count : null;
}

/** The game a kind of content belongs to (each kind belongs to exactly one). */
export function gameOfKind(kind: GameContentKind): LearnGame | null {
  return LEARN_GAMES.find((g) => g.contentKinds.includes(kind)) ?? null;
}
