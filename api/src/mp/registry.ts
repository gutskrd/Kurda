import { MULTI_GAMES, type MultiGame } from '@kurda/shared';
import type { AnyGameModule } from './module.js';
import { lastLetterModule } from './games/last-letter.js';
import { impostorModule } from './games/impostor.js';
import { whoAmIRaceModule } from './games/who-am-i.js';

/**
 * Every multiplayer learning game the engine runs, by its name. A new game is
 * its rules in shared/src/games/<game>/, its module here, and its name in
 * `MULTI_GAMES` (with the migration that widens the database's lists); the
 * play layer, reports, badges, ranks and the account's export pick it up from
 * there.
 */
export const GAME_MODULES: Readonly<Record<MultiGame, AnyGameModule>> = {
  'last-letter': lastLetterModule,
  impostor: impostorModule,
  'who-am-i': whoAmIRaceModule,
};

export function moduleOf(game: MultiGame): AnyGameModule {
  if (!Object.hasOwn(GAME_MODULES, game)) throw new Error(`no module for ${game}`);
  return GAME_MODULES[game];
}

export const ALL_MODULES: readonly AnyGameModule[] = MULTI_GAMES.map((g) => GAME_MODULES[g]);

