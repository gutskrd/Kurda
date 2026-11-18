import type { MultiGame } from '@kurda/shared';
import type { AnyGameModule } from './module.js';
import { lastLetterModule } from './games/last-letter.js';
import { impostorModule } from './games/impostor.js';
import { whoAmITableModule } from './games/who-am-i.js';

/**
 * Every multiplayer learning game the engine runs, by name. A new game needs its rules in shared/src/games/<game>/, its
 * module here, and its name in `MULTI_GAMES` (with a migration widening the database's lists); play, reports, badges,
 * ranks and the data export pick it up from there.
 */
export const GAME_MODULES: Readonly<Record<MultiGame, AnyGameModule>> = {
  'last-letter': lastLetterModule,
  impostor: impostorModule,
  'who-am-i': whoAmITableModule,
};

export function moduleOf(game: MultiGame): AnyGameModule {
  if (!Object.hasOwn(GAME_MODULES, game)) throw new Error(`no module for ${game}`);
  return GAME_MODULES[game];
}

