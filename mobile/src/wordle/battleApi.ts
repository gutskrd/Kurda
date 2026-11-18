import type { RatedState } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { joined } from '../play/joining';
import type { Feedback, ScoredGuess } from './board';
import type { WordMeanings } from './WordAnswer';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface OpponentView {
  /** `seat:N` — never another player's account id. */
  userId: string;
  seat?: number;
  /** A friend's name (or anyone's in an open battle); null shows "Opponent N". */
  name?: string | null;
  guessCount: number;
  solved: boolean;
  status: string;
  /** Green letters found so far — how far along they are, without their word. */
  progress: number;
  finished: boolean;
}

export interface BattleState {
  id: string;
  /** `cancelled`: the host left the lobby, which calls the battle off for everyone. */
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  difficulty: Difficulty;
  targetLength: number;
  maxPlayers: number;
  /** The viewer's own id when they host, else the host's `seat:N`. */
  createdBy: string;
  isHost?: boolean;
  /**
   * The six-character join code (Games → Join with a code) while the battle can be joined; null once started,
   * finished or cancelled. Older servers omit it.
   */
  code?: string | null;
  /** The rematch or next round, once there is one. */
  nextLobbyId?: string | null;
  /** Everyone in it, by seat, named as this viewer may see them. */
  players?: Array<{ seat: number; userId: string; name: string | null; avatarUrl: string | null; isMe: boolean; isHost: boolean; gone: boolean }>;
  me: {
    guesses: ScoredGuess[];
    keyboard: Record<string, Feedback>;
    status: string;
    solved: boolean;
    remainingAttempts: number;
  } | null;
  opponents: OpponentView[];
  /** Revealed only once the whole match is finished. */
  target: string | null;
  /** Rated or Friendly (Game Ranks): the host's choice, and once started whether it counts. */
  rated?: RatedState;
}

/** The post-match scoreboard: everyone's placement, the word, and XP awarded. */
export interface BattleResults {
  id: string;
  target: string;
  /** What the word means, in every language a word card gives; absent from a server from before it. */
  meanings?: WordMeanings;
  difficulty: Difficulty;
  ranking: Array<{
    /** The viewer's own id on their own row, `seat:N` on everyone else's. */
    userId: string;
    /** The player's seat (`seat:N` is everyone else's userId): what a report names them by. */
    seat?: number;
    /** Null unless you may see it (a friend, or anyone in an open battle). */
    name?: string | null;
    isMe?: boolean;
    rank: number;
    solved: boolean;
    guessCount: number;
    progress: number;
    xpAwarded: number | null;
  }>;
}

/**
 * Peyvok Battle over the poll-safe REST endpoints: this polls while a match is live, and a realtime push can be
 * layered on later without changes. An opponent's row carries only a guess count and how many letters are green,
 * never their guesses, which would give away the shared answer.
 */
/** `rated`: the host's Rated/Friendly choice, which the server remembers for their next battle. */
export const createBattle = (client: ApiClient, difficulty: Difficulty, rated?: boolean): Promise<ApiResult<BattleState>> =>
  client.post('/wordle/battles', rated === undefined ? { difficulty } : { difficulty, rated });

export const joinBattle = (client: ApiClient, id: string): Promise<ApiResult<BattleState>> =>
  client.post(`/wordle/battles/${id}/join`);

export const startBattle = (client: ApiClient, id: string): Promise<ApiResult<BattleState>> =>
  client.post(`/wordle/battles/${id}/start`);

/** Leave the lobby (the host leaving cancels it for everyone), or a battle under way, finishing where you stand so nobody waits. */
export const leaveBattle = (client: ApiClient, id: string): Promise<ApiResult<{ ok: true }>> =>
  client.post(`/wordle/battles/${id}/leave`);

/** The host takes a player out of the lobby, by seat; they cannot join it again. */
export const removeFromBattle = (client: ApiClient, id: string, seat: number): Promise<ApiResult<BattleState>> =>
  client.post(`/wordle/battles/${id}/remove`, { seat });

export const guessInBattle = (client: ApiClient, id: string, word: string): Promise<ApiResult<BattleState>> =>
  client.post(`/wordle/battles/${id}/guesses`, { word });

export const getBattle = (client: ApiClient, id: string): Promise<ApiResult<BattleState>> =>
  // Let an invite accepted a moment ago land first: until it has, this battle is nobody's (play/joining.ts).
  joined(id).then(() => client.get(`/wordle/battles/${id}`));

/** 409s until the match is over — the word is in here, so it cannot come sooner. */
export const getResults = (client: ApiClient, id: string): Promise<ApiResult<BattleResults>> =>
  client.get(`/wordle/battles/${id}/results`);
