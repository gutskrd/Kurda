import { z } from 'zod';
import type { InviteSummary, LobbyCard } from '@kurda/shared';
import { AppError } from '../../plugins/errors.js';
import type { WordleBattleService } from '../../game/wordle-battle-service.js';
import { nextGameError, openGamesAdultsOnly, parseSettings, setRatedError } from '../errors.js';
import type { JoinOutcome, LobbyFacts, PlayAdapter, Series } from '../types.js';

/** The presets a Wordle Battle is created with from an invite (as on POST /wordle/battles). */
const settingsSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  access: z.enum(['friends', 'open']).optional(),
  rated: z.boolean().optional(),
});

/** Wordle Battle, as the play layer drives it: a thin translation of the battle service. */
export class WordleBattleAdapter implements PlayAdapter {
  readonly game = 'wordle-battle' as const;

  constructor(private readonly battles: WordleBattleService) {}

  async create(hostId: string, settings: unknown, opts: { chatGroupId: string | null; fromChat: boolean }): Promise<string> {
    const s = parseSettings(settingsSchema, settings);
    const res = await this.battles.create(hostId, { ...s, chatGroupId: opts.chatGroupId, fromChat: opts.fromChat });
    if (res.ok) return res.battle.id;
    if (res.reason === 'open-needs-adult') throw openGamesAdultsOnly();
    throw new AppError('EMPTY_POOL', 503, 'no words available for play');
  }

  async join(userId: string, lobbyId: string): Promise<JoinOutcome> {
    const res = await this.battles.join(lobbyId, userId);
    if (res.ok) return 'joined';
    switch (res.reason) {
      case 'already-joined':
        return 'already';
      case 'not-open':
        return 'started';
      case 'full':
        return 'full';
      case 'not-found':
        return 'not-found';
    }
  }

  facts(lobbyId: string): Promise<LobbyFacts | null> {
    return this.battles.facts(lobbyId);
  }

  card(viewerId: string, lobbyId: string): Promise<LobbyCard> {
    return this.battles.card(viewerId, lobbyId);
  }

  summary(lobbyId: string): Promise<InviteSummary | null> {
    return this.battles.summary(lobbyId);
  }

  async startPairRematch(lobbyId: string): Promise<string> {
    const res = await this.battles.startPairRematch(lobbyId);
    if (!res.ok) throw nextGameError(res.reason);
    return res.id;
  }

  async openNextRound(hostId: string, lobbyId: string): Promise<string> {
    const res = await this.battles.openNextRound(hostId, lobbyId);
    if (!res.ok) throw nextGameError(res.reason);
    return res.id;
  }

  series(lobbyId: string, me: string, other: string): Promise<Series> {
    return this.battles.series(lobbyId, me, other);
  }

  touch(lobbyId: string): Promise<void> {
    return this.battles.touch(lobbyId);
  }

  async setRated(hostId: string, lobbyId: string, rated: boolean): Promise<void> {
    const res = await this.battles.setRated(lobbyId, hostId, rated);
    if (!res.ok) throw setRatedError(res.reason);
  }

  async cancel(hostId: string, lobbyId: string): Promise<void> {
    await this.battles.leave(lobbyId, hostId);
  }

  sweep(): Promise<void> {
    return this.battles.sweep();
  }
}
