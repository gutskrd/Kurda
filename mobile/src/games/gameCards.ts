/**
 * The games' own register: every game that has a card in Learn's Games group,
 * and each way into it.
 *
 * It was written inside the Games screen, where only that screen could read
 * it, so Search kept a list of its own — five of the ways, by hand — and the
 * games added since could not be found by name at all. Data only, with no
 * React in it, so the screen, the search and their tests all read the one
 * list: a game added here is on the Games screen and in Search at once.
 */
import type { GameEmblem } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { LearnGameRoute } from './learnGames';

export type GameRoute = 'Wordle' | 'WordleBattle' | 'Rhyme' | 'RhymeMatch' | 'Race' | LearnGameRoute;
export type GameMode = 'solo' | 'friends' | 'both';

/** One way into a game: the screen it opens, and what its button says. */
export interface GameWay {
  /** names its button for the tests (`game-<key>`) */
  key: string;
  route: GameRoute;
  label: TranslationKey;
  /** the way a game's screen opens on, where one screen holds every way to play it (Who Am I?) */
  params?: { way: 'phone' | 'friends' };
}

export interface GameCard {
  key: string;
  /** the picture drawn for it (shared/src/art/games.ts) */
  emblem: GameEmblem;
  name: TranslationKey;
  /** one line, what you do in it */
  line: TranslationKey;
  /** its ways in: one per screen it has, or one per way its one screen can open on; a game with a single way has one */
  ways: readonly GameWay[];
  mode: GameMode;
  /** still short of approved content: named under the cards as coming soon, and does not open */
  soon?: boolean;
}

/**
 * The games that have screens of their own (the rest come from the shared
 * registry, games/learnGames.ts). Peyvok and the rhymes are each one card
 * with two ways in: alone, and against a friend. Stories are not among them
 * any more: reading is Learn's own middle group, and a story's quiz starts
 * from the story.
 */
export const GAME_CARDS: readonly GameCard[] = [
  {
    key: 'wordle',
    emblem: 'peyvok',
    name: 'games.wordle.name',
    line: 'games.card.wordle',
    ways: [
      { key: 'wordle', route: 'Wordle', label: 'games.mode.solo' },
      { key: 'battle', route: 'WordleBattle', label: 'games.mode.friends' },
    ],
    mode: 'both',
  },
  {
    key: 'rhyme',
    emblem: 'rhyme',
    name: 'games.rhyme.name',
    line: 'games.card.rhyme',
    ways: [
      { key: 'rhyme', route: 'Rhyme', label: 'games.mode.solo' },
      { key: 'rhymeMatch', route: 'RhymeMatch', label: 'games.mode.friends' },
    ],
    mode: 'both',
  },
  { key: 'race', emblem: 'race', name: 'games.race.name', line: 'games.card.race', ways: [{ key: 'race', route: 'Race', label: 'games.play' }], mode: 'solo' },
];

/** What the learning games' own register says of one of them, as much as a card needs (games/learnGames.ts `PhoneGame`). */
export interface ListedGame {
  id: string;
  route: LearnGameRoute;
  name: TranslationKey;
  line: TranslationKey;
  mode: GameMode;
  ways?: readonly { key: string; label: TranslationKey; way: 'phone' | 'friends' }[];
  /** enough approved content to be played now */
  ready: boolean;
}

/** A learning game as a card: its one Play, or a button for each of its ways. */
export function learnGameCard(game: ListedGame): GameCard {
  const ways: GameWay[] = game.ways
    ? game.ways.map((w) => ({ key: w.key, route: game.route, label: w.label, params: { way: w.way } }))
    : [{ key: game.id, route: game.route, label: 'games.play' }];
  return { key: game.id, emblem: game.id as GameEmblem, name: game.name, line: game.line, ways, mode: game.mode, soon: !game.ready };
}
