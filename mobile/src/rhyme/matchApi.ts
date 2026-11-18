import type { RatedState } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { joined } from '../play/joining';
import type { RhymeHint } from '../wordle/WordAnswer';

export type Dialect = 'kurmanci' | 'sorani';
export type RhymeQuality = 'perfect' | 'near' | 'none';
/** `inflected`: a word whose ending does all the rhyming (malan for baran). */
export type RhymeReject = 'not-a-word' | 'is-prompt' | 'already-used' | 'no-rhyme' | 'profane' | 'inflected' | 'window-closed';

export interface ScoreEntry {
  /** The viewer's own id on their own entry, `seat:N` on everyone else's. */
  userId: string;
  seat?: number;
  /** A friend's name (or anyone's in an open match); null shows "Opponent". */
  name?: string | null;
  score: number;
  accepted: number;
}

export interface MatchState {
  id: string;
  /** `cancelled`: the host left the lobby, which calls the match off for everyone. */
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  dialect: Dialect;
  /** Revealed once the match starts — the lobby must not give it away early. */
  prompt: string | null;
  windowMs: number;
  remainingMs: number;
  maxPlayers: number;
  /** The viewer's own id when they host, else the host's `seat:N`. */
  createdBy: string;
  isHost?: boolean;
  /**
   * The six-character join code (Games → Join with a code) while the match can be joined; null once started,
   * finished or cancelled. Older servers omit it.
   */
  code?: string | null;
  /** The rematch or next round, once there is one. */
  nextLobbyId?: string | null;
  /** Everyone in it, by seat, named as this viewer may see them. */
  players?: Array<{ seat: number; userId: string; name: string | null; avatarUrl: string | null; isMe: boolean; isHost: boolean; gone: boolean }>;
  me: { score: number; accepted: number; usedWords: string[] } | null;
  scoreboard: ScoreEntry[];
  /** Rated or Friendly (Game Ranks): the host's choice, and once started whether it counts. */
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
    /** The player's seat (`seat:N` is everyone else's userId): what a report names them by. */
    seat?: number;
    /** Null unless you may see it (a friend, or anyone in an open match). */
    name?: string | null;
    isMe?: boolean;
    rank: number;
    score: number;
    accepted: number;
    xpAwarded: number | null;
    usedWords: string[];
  }>;
  /** Perfect rhymes nobody in the match found, with their meanings; older servers omit it. */
  missed?: RhymeHint[];
}

/**
 * Rhyme Match over the REST endpoints, which are poll-safe: this polls while a match is live, as Peyvok Battle
 * does, and a realtime push can be layered on later without changing the screen. Scoring is entirely the
 * server's: the phone posts a word and is told whether and how much it counted, so a modified client cannot
 * invent points.
 */
/** `rated`: the host's Rated/Friendly choice, which the server remembers for their next match. */
export const createMatch = (client: ApiClient, dialect: Dialect, rated?: boolean): Promise<ApiResult<MatchState>> =>
  client.post('/rhyme/matches', rated === undefined ? { dialect } : { dialect, rated });

export const joinMatch = (client: ApiClient, id: string): Promise<ApiResult<MatchState>> =>
  client.post(`/rhyme/matches/${id}/join`);

export const startMatch = (client: ApiClient, id: string): Promise<ApiResult<MatchState>> =>
  client.post(`/rhyme/matches/${id}/start`);

/** Leave the lobby (the host leaving cancels it for everyone), or a match under way, keeping your score. */
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
  // Let an invite accepted a moment ago land first: until it has, this match is nobody's (play/joining.ts).
  joined(id).then(() => client.get(`/rhyme/matches/${id}`));

/** 409s until the match is over — the prompt and everyone's words are in here. */
export const getMatchResults = (client: ApiClient, id: string): Promise<ApiResult<MatchResults>> =>
  client.get(`/rhyme/matches/${id}/results`);
