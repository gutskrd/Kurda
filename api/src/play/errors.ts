import type { z } from 'zod';
import { AppError } from '../plugins/errors.js';

/**
 * The one answer for a game someone may not see: missing, called off, not
 * theirs to join, removed — all the same, so none of them says anything about
 * anybody.
 */
export function gameNotFound(): AppError {
  return new AppError('GAME_NOT_FOUND', 404, 'no such game');
}

/** Only a known adult may open a game to every adult with the link. */
export function openGamesAdultsOnly(): AppError {
  return new AppError('OPEN_GAMES_ADULTS_ONLY', 403, 'only adults can open a game to everyone');
}

/** What the play layer's rematch and next-round calls answer when they cannot. */
export function nextGameError(reason: 'not-found' | 'not-finished' | 'not-pair' | 'forbidden' | 'empty-pool' | 'empty-lexicon'): AppError {
  switch (reason) {
    case 'not-found':
      return gameNotFound();
    case 'not-finished':
      return new AppError('NOT_FINISHED', 409, 'this game has not finished');
    case 'not-pair':
      return new AppError('NOT_A_PAIR', 409, 'a rematch is for two players');
    case 'forbidden':
      return new AppError('NOT_HOST', 403, 'only the host can open the next round');
    case 'empty-pool':
    case 'empty-lexicon':
      return new AppError('EMPTY_POOL', 503, 'no words available for play');
  }
}

/** What changing a lobby's Rated/Friendly badge answers when it cannot. */
export function setRatedError(reason: 'not-found' | 'forbidden' | 'not-lobby'): AppError {
  switch (reason) {
    case 'not-found':
      return gameNotFound();
    case 'forbidden':
      return new AppError('NOT_HOST', 403, 'only the host can change this');
    case 'not-lobby':
      return new AppError('GAME_STARTED', 409, 'Rated or Friendly can only change before the start');
  }
}

/** A game's settings, checked against its own presets (400 like any bad request body). */
export function parseSettings<S extends z.ZodType>(schema: S, settings: unknown): z.infer<S> {
  const parsed = schema.safeParse(settings ?? {});
  if (!parsed.success) {
    throw new AppError(
      'BAD_SETTINGS',
      400,
      'these settings are not offered',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return parsed.data;
}
