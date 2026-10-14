import type { AccentMode, RaceGameView, RaceLength, RaceResultView, TypingDialect } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

export type { RaceLength };
export type RaceGame = RaceGameView;
export type RaceResult = RaceResultView;

/**
 * Typing Race (KUR-307). A solo time trial, not a match — there is no lobby
 * and no invite, which is why this is the one game of the four with no shared
 * link behind it.
 *
 * Speed is the server's to decide, and deliberately so: as the route file puts
 * it, "The start endpoint records when it handed the text over and the finish
 * endpoint measures against that, so a client cannot report its own time — the
 * leaderboard would be worthless if it could." The clock on screen is for the
 * racer's benefit and is never sent anywhere.
 *
 * A race is in a variety (a Soranî racer is handed a Soranî text) and an accent
 * mode, which the server stores with it: personal bests are per mode, since a
 * race where e counts for ê is not the same race as one where it does not.
 * The shapes are `@kurda/shared` typing.ts.
 */
export const startRace = (
  client: ApiClient,
  options: { length: RaceLength; dialect: TypingDialect; accentMode: AccentMode },
): Promise<ApiResult<RaceGame>> => client.post('/race', options);

export const finishRace = (client: ApiClient, id: string, typed: string): Promise<ApiResult<RaceResult>> =>
  client.post(`/race/${id}/finish`, { typed });
