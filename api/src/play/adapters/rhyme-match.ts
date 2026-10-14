import { z } from 'zod';
import type { InviteSummary, LobbyCard } from '@kurda/shared';
import { AppError } from '../../plugins/errors.js';
import type { RhymeMatchService } from '../../game/rhyme-match-service.js';
import { nextGameError, openGamesAdultsOnly, parseSettings, setRatedError } from '../errors.js';
import type { JoinOutcome, LobbyFacts, PlayAdapter, Series } from '../types.js';

/** The presets a Rhyme Match is created with from an invite (as on POST /rhyme/matches). */
const settingsSchema = z.object({
  dialect: z.enum(['kurmanci', 'sorani']).default('kurmanci'),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  windowMs: z.number().int().min(30_000).max(180_000).optional(),
  access: z.enum(['friends', 'open']).optional(),
  rated: z.boolean().optional(),
});

/** Rhyme Match, as the play layer drives it: a thin translation of the match service. */
export class RhymeMatchAdapter implements PlayAdapter {
  readonly game = 'rhyme-match' as const;

  constructor(private readonly matches: RhymeMatchService) {}

  async create(hostId: string, settings: unknown, opts: { chatGroupId: string | null; fromChat: boolean }): Promise<string> {
    const s = parseSettings(settingsSchema, settings);
    const res = await this.matches.create(hostId, { ...s, chatGroupId: opts.chatGroupId, fromChat: opts.fromChat });
    if (res.ok) return res.match.id;
    if (res.reason === 'open-needs-adult') throw openGamesAdultsOnly();
    throw new AppError('EMPTY_LEXICON', 503, 'no words available for play');
  }

  async join(userId: string, lobbyId: string): Promise<JoinOutcome> {
    const res = await this.matches.join(lobbyId, userId);
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
    return this.matches.facts(lobbyId);
  }

  card(viewerId: string, lobbyId: string): Promise<LobbyCard> {
    return this.matches.card(viewerId, lobbyId);
  }

  summary(lobbyId: string): Promise<InviteSummary | null> {
    return this.matches.summary(lobbyId);
  }

  async startPairRematch(lobbyId: string): Promise<string> {
    const res = await this.matches.startPairRematch(lobbyId);
    if (!res.ok) throw nextGameError(res.reason);
    return res.id;
  }

  async openNextRound(hostId: string, lobbyId: string): Promise<string> {
    const res = await this.matches.openNextRound(hostId, lobbyId);
    if (!res.ok) throw nextGameError(res.reason);
    return res.id;
  }

  series(lobbyId: string, me: string, other: string): Promise<Series> {
    return this.matches.series(lobbyId, me, other);
  }

  touch(lobbyId: string): Promise<void> {
    return this.matches.touch(lobbyId);
  }

  async setRated(hostId: string, lobbyId: string, rated: boolean): Promise<void> {
    const res = await this.matches.setRated(lobbyId, hostId, rated);
    if (!res.ok) throw setRatedError(res.reason);
  }

  async cancel(hostId: string, lobbyId: string): Promise<void> {
    await this.matches.leave(lobbyId, hostId);
  }

  sweep(): Promise<void> {
    return this.matches.sweep();
  }
}
