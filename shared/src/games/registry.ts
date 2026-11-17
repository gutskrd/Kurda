/**
 * The learning games in one list: what each is, how it is played, what it is made of and what it pays. The API counts
 * what each can be played with (GET /games/availability), the admin files content by it, and both apps build Learn's
 * games from it, so a game added here appears everywhere. Peyvok, Peyvok Battle, the rhyme games, the typing race and the
 * story games have their own pages and tables and are not here; these are the games on the shared kit (api/src/games).
 *
 * A game opens only with enough approved content in the learner's variety (`minimum`) and only in an app with a screen
 * for it; one still short is listed after the open ones as coming soon (`listedLearnGames`). XP is paid only for games
 * played online with other people: alone, against Hevalo or on one passed-round phone pays nothing (`paysAlone`). Build a
 * Sentence and Hear It, Find It are lessons' practice exercises (`place: 'lessons'`) run by the same kit and paid as
 * lessons. Retired games (`RETIRED_GAME_IDS`) are kept only so old rows still read.
 *
 * The registry is data only and imports no game; each game's rules live in its own folder (`build-sentence/`,
 * `last-letter/`, `multi/` for the shared multiplayer engine) exported through `games/index.ts`.
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

/**
 * Games no longer part of Hevalo: nothing lists, invites to or opens one, and the server refuses to start one. Their names
 * stay known because old rows carry them (matches, solo rounds, XP, chat invitations), so readers can say the game is
 * retired instead of failing.
 */
export const RETIRED_GAME_IDS = ['dont-say', 'bluff', 'kingdom', 'what-would-you-say'] as const;
export type RetiredGameId = (typeof RETIRED_GAME_IDS)[number];

export function isRetiredGame(v: unknown): v is RetiredGameId {
  return (RETIRED_GAME_IDS as readonly unknown[]).includes(v);
}

/**
 * XP sources nothing pays from any more: the retired games', and those solo rounds paid from while they still earned XP
 * (Who Am I?, Memory Thief and Detective alone, The Last Letter against Hevalo). They remain game sources, so XP already
 * in the ledger under them still counts as game XP under the league's daily cap.
 */
export const RETIRED_GAME_XP_SOURCES: readonly string[] = [
  'game_dont_say_place',
  'game_bluff_place',
  'game_what_would_you_say',
  'game_who_am_i',
  'game_memory_thief',
  'game_detective',
  'game_last_letter_solo',
];

/** How a game is played: alone, with others, or either. */
export type LearnGameMode = 'solo' | 'multi' | 'both';

/** Where a learner finds an entry: among Learn's games, or with the lessons' practice (a solo-kit exercise that is not a game). */
export type LearnGamePlace = 'games' | 'lessons';

/**
 * Approved Kurdish a game reads where it already is, besides its own rows:
 *   lesson-sentences  published lessons' translations and conversation lines, with English and accepted orders
 *   conversations     published lessons' conversations, a few lines at a time
 *   vocabulary        published lessons' word pairs and published stories' glossaries
 *   story-passages    published stories' paragraphs, with each one's glossary terms
 *   recordings        people's recordings (lesson, alphabet and dictionary audio), never synthesised ones
 *   dictionary        dictionary rows, only to check a player's word (and `in_games` words for the computer's moves)
 */
export const TRUSTED_SOURCES = ['lesson-sentences', 'conversations', 'vocabulary', 'story-passages', 'recordings', 'dictionary'] as const;
export type TrustedSource = (typeof TRUSTED_SOURCES)[number];

/** A game card's picture by name; each app draws it from its own icon set (the phone's names are these; the browser maps them). */
export type GameGlyph = 'tiles' | 'eye' | 'headphones' | 'search' | 'text-t' | 'people' | 'question';

export interface LearnGame {
  id: LearnGameId;
  mode: LearnGameMode;
  place: LearnGamePlace;
  /** how many people play one game; a solo game is 1 to 1 */
  players: { min: number; max: number };
  /** players type their own words, which pass the chat's safety checks before anyone else sees them */
  freeText: boolean;
  /** the approved sources it reads */
  sources: readonly TrustedSource[];
  /** its own `game_content` kinds */
  contentKinds: readonly GameContentKind[];
  /** The approved items of its main content one difficulty must hold for the game to be offered at it (sentences, passages, case files, cards…). */
  minimum: number;
  /** The XP ledger sources it pays from, all game sources under the league's daily cap; none for a game only ever played alone (`paysAlone`). */
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
    // Fifteen passages a difficulty, so a round of five does not repeat the same few.
    minimum: 15,
    xpSources: [],
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
    // Three cases a difficulty, so a learner who solves one has another.
    minimum: 3,
    xpSources: [],
    dialects: GAME_DIALECTS,
    glyph: 'search',
    tone: 'pine',
  },
  {
    id: 'last-letter',
    mode: 'both',
    place: 'games',
    // Alone against Hevalo, or two to six with friends (last-letter/rules.ts).
    players: { min: 1, max: 6 },
    freeText: false,
    sources: ['dictionary', 'vocabulary'],
    contentKinds: [],
    // The words a chain can check, as its own rule counts them (LAST_LETTER_MIN_DICTIONARY_WORDS).
    minimum: 1500,
    // With friends; a game against Hevalo pays nothing.
    xpSources: ['game_last_letter'],
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
    // A card is read by somebody else, online with friends or on one passed-round phone; never alone.
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
 * Whether a solo round of this earns XP: only the lessons' own exercises do. Alone, against Hevalo or on one passed-round
 * phone is practice, and XP available that way would be XP for the asking; game XP comes from playing online with others.
 */
export function paysAlone(id: LearnGameId): boolean {
  const game = learnGame(id);
  return game.place === 'lessons' && game.xpSources.length > 0;
}

/** Every XP source the learning games pay or ever paid from, for the API's list of game sources and its league cap. */
export const LEARN_GAME_XP_SOURCES: readonly string[] = [...new Set([...LEARN_GAMES.flatMap((g) => g.xpSources), ...RETIRED_GAME_XP_SOURCES])];

/** A game as Learn lists it, and whether it can be played in the learner's variety yet. */
export interface ListedLearnGame {
  game: LearnGame;
  /** false while the game is short of approved content: listed as coming soon, with no way in */
  ready: boolean;
}

/**
 * The games an app lists in Learn: those it has a screen for (`playable`), ready ones in the learner's variety first and
 * the rest after as coming soon, each in registry order, so learners see what is coming but never play on drafts. Nothing
 * is listed before availability arrives (null), so cards do not reshuffle; lesson exercises are never listed.
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
 * The exercises the lessons' practice offers besides its own sessions: those an app has a screen for that are ready in the
 * learner's variety, in registry order. Unready ones are left out, since practice is for doing things. Nothing is listed
 * before availability arrives.
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

/** Which of `count` games a page features today: a different one each UTC day, the same for everybody, on both apps; null when there are none. */
export function gameOfTheDay(count: number, now: number): number | null {
  return count > 0 ? Math.floor(now / DAY_MS) % count : null;
}

/**
 * The game a kind of content belongs to; each kind has exactly one, except riddles and proverbs (`LORE_KINDS`), the
 * Stories collections kept as game content only for review, which belong to none and are never counted, listed or played.
 */
export function gameOfKind(kind: GameContentKind): LearnGame | null {
  return LEARN_GAMES.find((g) => g.contentKinds.includes(kind)) ?? null;
}
