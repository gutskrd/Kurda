import type { AccentMode, RaceGameView, RaceLength, RaceResultView, TypingDialect } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

export type { RaceLength };
export type RaceGame = RaceGameView;
export type RaceResult = RaceResultView;

/**
 * Typing Race API: a solo time trial with no lobby or invite. The server records when it handed the text over and
 * measures the finish against that, so a client cannot report its own time; the on-screen clock is never sent. A
 * race has a variety (a Soranî racer gets a Soranî text) and an accent mode, stored with it, and personal bests
 * are per mode. Shapes are in `@kurda/shared` typing.ts.
 */
export const startRace = (
  client: ApiClient,
  options: { length: RaceLength; dialect: TypingDialect; accentMode: AccentMode },
): Promise<ApiResult<RaceGame>> => client.post('/race', options);

export const finishRace = (client: ApiClient, id: string, typed: string): Promise<ApiResult<RaceResult>> =>
  client.post(`/race/${id}/finish`, { typed });
