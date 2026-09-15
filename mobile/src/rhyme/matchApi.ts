import { buildInviteUrl } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

export type Dialect = 'kurmanci' | 'sorani';
export type RhymeQuality = 'perfect' | 'near' | 'none';
export type RhymeReject = 'not-a-word' | 'is-prompt' | 'already-used' | 'no-rhyme' | 'profane' | 'window-closed';

export interface ScoreEntry {
  userId: string;
  score: number;
  accepted: number;
}

export interface MatchState {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  dialect: Dialect;
  /** revealed once the match starts — the lobby must not give it away early */
  prompt: string | null;
  windowMs: number;
  remainingMs: number;
  maxPlayers: number;
  createdBy: string;
  me: { score: number; accepted: number; usedWords: string[] } | null;
  scoreboard: ScoreEntry[];
}

export interface SubmitOutcome {
  accepted: boolean;
  quality: RhymeQuality;
  points: number;
  normalized: string;
  reason?: RhymeReject;
}

/** The post-match scoreboard: placement, scores, everyone's words, XP. */
export interface MatchResults {
  id: string;
  prompt: string;
  dialect: Dialect;
  ranking: Array<{
    userId: string;
    rank: number;
    score: number;
    accepted: number;
    xpAwarded: number | null;
    usedWords: string[];
  }>;
}

/**
 * Rhyme Match (KUR-299), over the REST endpoints rather than the socket.
 *
 * The API says it plainly: "State/results are poll-safe; the realtime
 * scoreboard push (#049) + matchmaking (#050) layer onto these endpoints."
 * So this polls while a match is live, exactly as Wordle Battle does, and the
 * gateway can be laid over it later without the screen changing.
 *
 * Scoring is entirely the server's: the phone posts a word and is told whether
 * it counted and for how much. It never decides what rhymes, which is what
 * keeps a modified client from inventing points.
 */
export const createMatch = (client: ApiClient, dialect: Dialect): Promise<ApiResult<MatchState>> =>
  client.post('/rhyme/matches', { dialect });

export const joinMatch = (client: ApiClient, id: string): Promise<ApiResult<MatchState>> =>
  client.post(`/rhyme/matches/${id}/join`);

export const startMatch = (client: ApiClient, id: string): Promise<ApiResult<MatchState>> =>
  client.post(`/rhyme/matches/${id}/start`);

export const submitRhyme = (
  client: ApiClient,
  id: string,
  word: string,
): Promise<ApiResult<{ match: MatchState; result: SubmitOutcome }>> =>
  client.post(`/rhyme/matches/${id}/submissions`, { word });

export const getMatch = (client: ApiClient, id: string): Promise<ApiResult<MatchState>> =>
  client.get(`/rhyme/matches/${id}`);

/** 409s until the match is over — the prompt and everyone's words are in here. */
export const getMatchResults = (client: ApiClient, id: string): Promise<ApiResult<MatchResults>> =>
  client.get(`/rhyme/matches/${id}/results`);

/**
 * The link a friend follows to join, built by the same code the browser uses.
 *
 * An invite has to be readable in whichever app it is opened in, so the shape
 * of this URL is not this app's to decide — it lives in @kurda/shared.
 */
export const inviteUrl = (id: string): string => buildInviteUrl('rhyme-match', id);
