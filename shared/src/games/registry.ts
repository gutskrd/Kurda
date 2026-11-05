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
 * Per-game modules. The registry is data only and imports no game: a game's
 * own rules live in a folder of its own beside this file —
 * `build-sentence/` for Build a Kurdish Sentence, `last-letter/` for The Last
 * Letter, `multi/` for the multiplayer engine every party game shares — and are
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
  'what-would-you-say',
  'detective',
  'last-letter',
  'impostor',
  'dont-say',
  'bluff',
  'who-am-i',
  'kingdom',
] as const;
export type LearnGameId = (typeof LEARN_GAME_IDS)[number];

export function isLearnGameId(v: unknown): v is LearnGameId {
  return (LEARN_GAME_IDS as readonly unknown[]).includes(v);
}

/** How a game is played: alone, with others, either, or (the village) not played at all but grown. */
export type LearnGameMode = 'solo' | 'multi' | 'both' | 'meta';

/**
 * Approved Kurdish a game reads where it already is, besides its own rows:
 *   lesson-sentences — published lessons' translations and conversation lines, with English and accepted orders
 *   conversations    — published lessons' conversations, as pairs of one line and the next
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
export type GameGlyph = 'tiles' | 'eye' | 'headphones' | 'chat' | 'search' | 'text-t' | 'people' | 'block' | 'quotes' | 'question' | 'mountains';

export interface LearnGame {
  id: LearnGameId;
  mode: LearnGameMode;
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
   * game to be offered at it: sentences, passages, scenarios, cards…
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
    id: 'what-would-you-say',
    mode: 'solo',
    players: { min: 1, max: 1 },
    freeText: false,
    sources: ['conversations'],
    contentKinds: ['scenario'],
    minimum: 8,
    xpSources: ['game_what_would_you_say'],
    dialects: GAME_DIALECTS,
    glyph: 'chat',
    tone: 'rose',
  },
  {
    id: 'detective',
    mode: 'solo',
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
    players: { min: 1, max: 8 },
    freeText: false,
    sources: ['dictionary', 'vocabulary'],
    contentKinds: [],
    minimum: 200,
    xpSources: ['game_last_letter', 'game_last_letter_place'],
    dialects: GAME_DIALECTS,
    glyph: 'text-t',
    tone: 'saffron',
  },
  {
    id: 'impostor',
    mode: 'multi',
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
    id: 'dont-say',
    mode: 'multi',
    players: { min: 3, max: 8 },
    freeText: true,
    sources: ['vocabulary'],
    contentKinds: ['taboo_card'],
    minimum: 20,
    xpSources: ['game_dont_say_place'],
    dialects: GAME_DIALECTS,
    glyph: 'block',
    tone: 'clay',
  },
  {
    id: 'bluff',
    mode: 'multi',
    players: { min: 3, max: 8 },
    freeText: true,
    sources: [],
    contentKinds: ['bluff_card'],
    minimum: 20,
    xpSources: ['game_bluff_place'],
    dialects: GAME_DIALECTS,
    glyph: 'quotes',
    tone: 'pine',
  },
  {
    id: 'who-am-i',
    mode: 'both',
    players: { min: 1, max: 8 },
    freeText: false,
    sources: ['vocabulary'],
    contentKinds: ['identity', 'question_template'],
    minimum: 10,
    xpSources: ['game_who_am_i', 'game_who_am_i_place'],
    dialects: GAME_DIALECTS,
    glyph: 'question',
    tone: 'meadow',
  },
  {
    id: 'kingdom',
    mode: 'meta',
    players: { min: 1, max: 1 },
    freeText: false,
    sources: [],
    contentKinds: ['building_name'],
    minimum: 6,
    // the village pays no XP: it grows from learning that already paid
    xpSources: [],
    dialects: GAME_DIALECTS,
    glyph: 'mountains',
    tone: 'saffron',
  },
];

/** A game's entry; every id has one. */
export function learnGame(id: LearnGameId): LearnGame {
  return LEARN_GAMES.find((g) => g.id === id)!;
}

/** Every XP source the learning games pay from, for the API's list of game sources (and its league cap). */
export const LEARN_GAME_XP_SOURCES: readonly string[] = [...new Set(LEARN_GAMES.flatMap((g) => g.xpSources))];

/** The games played alone, in the order Learn lists them. */
export function soloGames(): LearnGame[] {
  return LEARN_GAMES.filter((g) => g.mode === 'solo' || g.mode === 'both');
}

/**
 * The games an app lists in Learn, in the registry's order: those it has a
 * screen for (`playable`) that are available in the learner's variety now.
 * Before the availability has arrived (null) nothing new is listed, so a game
 * never appears and then vanishes; the village is never a game in the list.
 */
export function listedLearnGames(
  availability: { games: ReadonlyArray<{ id: string; available: boolean }> } | null | undefined,
  playable: readonly LearnGameId[],
): LearnGame[] {
  const open = new Set((availability?.games ?? []).filter((g) => g.available).map((g) => g.id));
  return LEARN_GAMES.filter((g) => g.mode !== 'meta' && playable.includes(g.id) && open.has(g.id));
}

/** The game a kind of content belongs to (each kind belongs to exactly one). */
export function gameOfKind(kind: GameContentKind): LearnGame | null {
  return LEARN_GAMES.find((g) => g.contentKinds.includes(kind)) ?? null;
}
