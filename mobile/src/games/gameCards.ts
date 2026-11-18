/**
 * The register of every game with a card in Learn's Games group, and each way into it. Data only, so the Games screen,
 * Search and their tests read the one list.
 */
import type { GameEmblem } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { LearnGameRoute } from './learnGames';

export type GameRoute = 'Wordle' | 'WordleBattle' | 'Rhyme' | 'RhymeMatch' | 'Race' | LearnGameRoute;
export type GameMode = 'solo' | 'friends' | 'both';

/**
 * What each game's name means, said in the reader's language under it. Names are Kurmancî in every language, which
 * tells a newcomer nothing; Search finds a game by either. Peyvok is a made-up word and has no meaning line; where the
 * interface is Kurdish the meaning would repeat the name, so it is left out.
 */
export const GAME_MEANING: Partial<Record<GameEmblem, TranslationKey>> = {
  rhyme: 'games.rhyme.meaning',
  race: 'games.race.meaning',
  'memory-thief': 'games.memory.meaning',
  detective: 'games.detective.meaning',
  'last-letter': 'games.lastLetter.meaning',
  impostor: 'games.impostor.meaning',
  'who-am-i': 'games.whoAmI.meaning',
};

/** One way into a game: the screen it opens, and what its button says. */
export interface GameWay {
  /** Names its button for the tests (`game-<key>`). */
  key: string;
  route: GameRoute;
  label: TranslationKey;
  /** The way a game's screen opens on, where one screen holds every way to play it (Who Am I?). */
  params?: { way: 'phone' | 'friends' };
}

export interface GameCard {
  key: string;
  /** The picture drawn for it (shared/src/art/games.ts). */
  emblem: GameEmblem;
  name: TranslationKey;
  /** One line: what you do in it. */
  line: TranslationKey;
  /** Its ways in: one per screen it has, or one per way its one screen can open on. */
  ways: readonly GameWay[];
  mode: GameMode;
  /** Still short of approved content: listed as coming soon, and does not open. */
  soon?: boolean;
}

/**
 * The games with screens of their own (the rest come from the shared registry, games/learnGames.ts). Peyvok and the
 * rhymes are each one card with two ways in: alone, and against a friend.
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

/** What the learning games' register says of one of them, as much as a card needs (games/learnGames.ts `PhoneGame`). */
export interface ListedGame {
  id: string;
  route: LearnGameRoute;
  name: TranslationKey;
  line: TranslationKey;
  mode: GameMode;
  ways?: readonly { key: string; label: TranslationKey; way: 'phone' | 'friends' }[];
  /** Enough approved content to be played now. */
  ready: boolean;
}

/** A learning game as a card: its one Play, or a button for each of its ways. */
export function learnGameCard(game: ListedGame): GameCard {
  const ways: GameWay[] = game.ways
    ? game.ways.map((w) => ({ key: w.key, route: game.route, label: w.label, params: { way: w.way } }))
    : [{ key: game.id, route: game.route, label: 'games.play' }];
  return { key: game.id, emblem: game.id as GameEmblem, name: game.name, line: game.line, ways, mode: game.mode, soon: !game.ready };
}
