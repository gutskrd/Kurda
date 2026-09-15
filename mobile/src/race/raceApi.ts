import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** 1 short, 3 long — the lengths an admin curates texts at. */
export type RaceLength = 1 | 2 | 3;

export interface RaceGame {
  id: string;
  text: { id: string; title: string; body: string; difficulty: number };
  startedAt: string;
}

export interface RaceResult {
  /** correctly typed characters, counted position by position */
  correctChars: number;
  /** how much of the target was reproduced exactly, 0..1 */
  accuracy: number;
  /** words per minute, on correct characters only */
  wpm: number;
  /** what the race is ranked on: speed weighted by how right it was */
  score: number;
  /** every character of the target matched */
  perfect: boolean;
  /** faster than a person can type — reported honestly, but worth nothing */
  implausible: boolean;
  elapsedMs: number;
  xpAwarded: number;
}

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
 */
export const startRace = (client: ApiClient, difficulty: RaceLength): Promise<ApiResult<RaceGame>> =>
  client.post('/race', { difficulty });

export const finishRace = (client: ApiClient, id: string, typed: string): Promise<ApiResult<RaceResult>> =>
  client.post(`/race/${id}/finish`, { typed });
