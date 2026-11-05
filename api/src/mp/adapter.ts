import type { InviteSummary, LobbyCard, MultiGame } from '@kurda/shared';
import type { JoinOutcome, LobbyFacts, PlayAdapter, Series } from '../play/types.js';
import type { MultiplayerService } from './service.js';

/**
 * Any multiplayer learning game, as the play layer drives it (play/types.ts):
 * one adapter per game over the one engine, so invites, join codes, chat
 * cards, rematches and the next round, Rated/Friendly and the join rule work
 * for every new game the moment it is in `MULTI_GAMES`, with nothing written
 * for it here.
 */
export class GenericLobbyAdapter implements PlayAdapter {
  constructor(
    readonly game: MultiGame,
    private readonly mp: MultiplayerService,
  ) {}

  create(hostId: string, settings: unknown, opts: { chatGroupId: string | null; fromChat: boolean }): Promise<string> {
    return this.mp.create(hostId, this.game, settings, opts);
  }

  join(userId: string, lobbyId: string): Promise<JoinOutcome> {
    return this.mp.join(userId, lobbyId);
  }

  async facts(lobbyId: string): Promise<LobbyFacts | null> {
    const facts = await this.mp.facts(lobbyId);
    // a lobby of another game behind the same table is not this game's
    return facts && facts.game === this.game ? facts : null;
  }

  card(viewerId: string, lobbyId: string): Promise<LobbyCard> {
    return this.mp.card(viewerId, this.game, lobbyId);
  }

  summary(lobbyId: string): Promise<InviteSummary | null> {
    return this.mp.summary(lobbyId);
  }

  startPairRematch(lobbyId: string): Promise<string> {
    return this.mp.startPairRematch(lobbyId);
  }

  openNextRound(hostId: string, lobbyId: string): Promise<string> {
    return this.mp.openNextRound(hostId, lobbyId);
  }

  series(lobbyId: string, me: string, other: string): Promise<Series> {
    return this.mp.series(lobbyId, me, other);
  }

  setRated(hostId: string, lobbyId: string, rated: boolean): Promise<void> {
    return this.mp.setRated(hostId, lobbyId, rated);
  }

  touch(lobbyId: string): Promise<void> {
    return this.mp.touchLobby(lobbyId);
  }

  cancel(hostId: string, lobbyId: string): Promise<void> {
    return this.mp.cancelByHost(hostId, lobbyId);
  }

  sweep(): Promise<void> {
    return this.mp.sweep(this.game);
  }
}
