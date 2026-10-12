import type { GameAccess, InviteSummary, LobbyCard, PlayGame } from '@kurda/shared';

/** Where a lobby is, in the words every game shares. */
export type LobbyPhase = 'lobby' | 'started' | 'finished' | 'cancelled';

/**
 * What the play layer needs to know about any game's lobby: who hosts it, who
 * is in it, whether it can still be joined, and what comes after it. Each
 * adapter reads it from its own tables; nothing here leaves the server as is.
 */
export interface LobbyFacts {
  game: PlayGame;
  lobbyId: string;
  hostId: string | null;
  phase: LobbyPhase;
  /** a new player may join right now (a lobby; Stories also while reading) */
  joinable: boolean;
  access: GameAccess;
  chatGroupId: string | null;
  maxPlayers: number;
  /** not removed by the host, still there or gone */
  memberIds: string[];
  /** in it now: not removed, not gone */
  activeIds: string[];
  removedIds: string[];
  /** the rematch or next round, once there is one */
  nextLobbyId: string | null;
  /** the game this one followed, for the running score */
  rematchOf: string | null;
  /** two players ask each other; more than two, the host opens the next round */
  rematchKind: 'pair' | 'round';
}

/** How a join through the play layer (accepting an invite) went. */
export type JoinOutcome = 'joined' | 'already' | 'not-found' | 'started' | 'full';

/** Two players' wins over a run of rematches, the asker first. */
export interface Series {
  me: number;
  other: number;
  draws: number;
}

/**
 * One game, as the play layer drives it: invites, chat cards and playing
 * again work the same for every game through this (contract §B3).
 */
export interface PlayAdapter {
  readonly game: PlayGame;
  /** checks `settings` (400 on anything that is not a preset) and makes a lobby with the host in it */
  create(hostId: string, settings: unknown, opts: { chatGroupId: string | null }): Promise<string>;
  /** the game's own join, so the join rule is checked in one place, under the game's lock */
  join(userId: string, lobbyId: string): Promise<JoinOutcome>;
  facts(lobbyId: string): Promise<LobbyFacts | null>;
  card(viewerId: string, lobbyId: string): Promise<LobbyCard>;
  summary(lobbyId: string): Promise<InviteSummary | null>;
  /** a two-player rematch both asked for: a new game with both in it, started at once; asking twice gives the same one */
  startPairRematch(lobbyId: string): Promise<string>;
  /** the host's "Play again" for three or more: a new lobby with the same settings and only the host in it */
  openNextRound(hostId: string, lobbyId: string): Promise<string>;
  /** wins between the two over this run of rematches, or null when the game cannot tell */
  series(lobbyId: string, me: string, other: string): Promise<Series | null>;
  /** an unstarted lobby the host is still inviting to is not idle */
  touch?(lobbyId: string): Promise<void>;
  /** calls off a lobby whose card could not be posted (the host is the only one in it) */
  cancel?(hostId: string, lobbyId: string): Promise<void>;
  /** closes idle lobbies and ends games that are over (run on a timer) */
  sweep?(): Promise<void>;
}
