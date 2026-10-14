import { buildInviteUrl, type RatedState } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { Feedback, ScoredGuess } from './board';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface OpponentView {
  /** `seat:N` — never another player's account id */
  userId: string;
  seat?: number;
  /** a friend's name (or anyone's in an open battle); null shows "Opponent N" */
  name?: string | null;
  guessCount: number;
  solved: boolean;
  status: string;
  /** green letters found so far — how far along they are, without their word */
  progress: number;
  finished: boolean;
}

export interface BattleState {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  difficulty: Difficulty;
  targetLength: number;
  maxPlayers: number;
  /** the viewer's own id when they host, else the host's `seat:N` */
  createdBy: string;
  isHost?: boolean;
  /** the rematch or next round, once there is one */
  nextLobbyId?: string | null;
  /** everyone in it, by seat, named as this viewer may see them */
  players?: Array<{ seat: number; userId: string; name: string | null; avatarUrl: string | null; isMe: boolean; isHost: boolean; gone: boolean }>;
  me: {
    guesses: ScoredGuess[];
    keyboard: Record<string, Feedback>;
    status: string;
    solved: boolean;
    remainingAttempts: number;
  } | null;
  opponents: OpponentView[];
  /** revealed only once the whole match is finished */
  target: string | null;
  /** Rated or Friendly (Game Ranks): the host's choice, and once started whether it counts */
  rated?: RatedState;
}

/** The post-match scoreboard: everyone's placement, the word, and XP awarded. */
export interface BattleResults {
  id: string;
  target: string;
  difficulty: Difficulty;
  ranking: Array<{
    /** the viewer's own id on their own row, `seat:N` on everyone else's */
    userId: string;
    /** the player's seat (`seat:N` is everyone else's userId): what a report names them by */
    seat?: number;
    /** null unless you may see it (a friend, or anyone in an open battle) */
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
 * Wordle Battle (KUR-306), over the REST endpoints rather than the socket.
 *
 * The API says so itself: "State/results are poll-safe; the realtime gateway
 * pushing opponent progress is an additive transport on top of these same
 * endpoints." So this polls while a match is live, and the socket can be laid
 * over it later without any of this changing.
 *
 * What an opponent's row carries is deliberately thin — a guess count and how
 * many letters they have green. Never their guesses, which would hand you the
 * answer to the word you are both racing for.
 */
/** `rated`: the host's Rated/Friendly choice (the server remembers it for their next battle). */
export const createBattle = (client: ApiClient, difficulty: Difficulty, rated?: boolean): Promise<ApiResult<BattleState>> =>
  client.post('/wordle/battles', rated === undefined ? { difficulty } : { difficulty, rated });

export const joinBattle = (client: ApiClient, id: string): Promise<ApiResult<BattleState>> =>
  client.post(`/wordle/battles/${id}/join`);

export const startBattle = (client: ApiClient, id: string): Promise<ApiResult<BattleState>> =>
  client.post(`/wordle/battles/${id}/start`);

export const guessInBattle = (client: ApiClient, id: string, word: string): Promise<ApiResult<BattleState>> =>
  client.post(`/wordle/battles/${id}/guesses`, { word });

export const getBattle = (client: ApiClient, id: string): Promise<ApiResult<BattleState>> =>
  client.get(`/wordle/battles/${id}`);

/** 409s until the match is over — the word is in here, so it cannot come sooner. */
export const getResults = (client: ApiClient, id: string): Promise<ApiResult<BattleResults>> =>
  client.get(`/wordle/battles/${id}/results`);

/**
 * The link a friend follows to join, built by the same code the browser uses.
 *
 * An invite has to be readable in whichever app it is opened in, so the shape
 * of this URL is not this app's to decide — it lives in @kurda/shared.
 */
export const inviteUrl = (id: string): string => buildInviteUrl('wordle-battle', id);
