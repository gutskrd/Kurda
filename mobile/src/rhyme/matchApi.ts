import type { RatedState } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

export type Dialect = 'kurmanci' | 'sorani';
export type RhymeQuality = 'perfect' | 'near' | 'none';
export type RhymeReject = 'not-a-word' | 'is-prompt' | 'already-used' | 'no-rhyme' | 'profane' | 'window-closed';

export interface ScoreEntry {
  /** the viewer's own id on their own entry, `seat:N` on everyone else's */
  userId: string;
  seat?: number;
  /** a friend's name (or anyone's in an open match); null shows "Opponent" */
  name?: string | null;
  score: number;
  accepted: number;
}

export interface MatchState {
  id: string;
  /** `cancelled`: the host left the lobby, which calls the match off for everyone */
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  dialect: Dialect;
  /** revealed once the match starts — the lobby must not give it away early */
  prompt: string | null;
  windowMs: number;
  remainingMs: number;
  maxPlayers: number;
  /** the viewer's own id when they host, else the host's `seat:N` */
  createdBy: string;
  isHost?: boolean;
  /**
   * The six characters a friend types to join (Games → Join with a code), while
   * the match can still be joined; null once it has started, finished or been
   * called off. Older servers leave it out.
   */
  code?: string | null;
  /** the rematch or next round, once there is one */
  nextLobbyId?: string | null;
  /** everyone in it, by seat, named as this viewer may see them */
  players?: Array<{ seat: number; userId: string; name: string | null; avatarUrl: string | null; isMe: boolean; isHost: boolean; gone: boolean }>;
  me: { score: number; accepted: number; usedWords: string[] } | null;
  scoreboard: ScoreEntry[];
  /** Rated or Friendly (Game Ranks): the host's choice, and once started whether it counts */
  rated?: RatedState;
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
    /** the player's seat (`seat:N` is everyone else's userId): what a report names them by */
    seat?: number;
    /** null unless you may see it (a friend, or anyone in an open match) */
    name?: string | null;
    isMe?: boolean;
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
 * So this polls while a match is live, exactly as Peyvok Battle does, and the
 * gateway can be laid over it later without the screen changing.
 *
 * Scoring is entirely the server's: the phone posts a word and is told whether
 * it counted and for how much. It never decides what rhymes, which is what
 * keeps a modified client from inventing points.
 */
/** `rated`: the host's Rated/Friendly choice (the server remembers it for their next match). */
export const createMatch = (client: ApiClient, dialect: Dialect, rated?: boolean): Promise<ApiResult<MatchState>> =>
  client.post('/rhyme/matches', rated === undefined ? { dialect } : { dialect, rated });

export const joinMatch = (client: ApiClient, id: string): Promise<ApiResult<MatchState>> =>
  client.post(`/rhyme/matches/${id}/join`);

export const startMatch = (client: ApiClient, id: string): Promise<ApiResult<MatchState>> =>
  client.post(`/rhyme/matches/${id}/start`);

/** Leave: out of the lobby (the host leaving calls it off for everyone), or out of a match under way, your score standing. */
export const leaveMatch = (client: ApiClient, id: string): Promise<ApiResult<{ ok: true }>> =>
  client.post(`/rhyme/matches/${id}/leave`);

/** The host takes a player out of the lobby, by seat; they cannot join it again. */
export const removeFromMatch = (client: ApiClient, id: string, seat: number): Promise<ApiResult<MatchState>> =>
  client.post(`/rhyme/matches/${id}/remove`, { seat });

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
