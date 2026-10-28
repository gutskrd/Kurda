import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DECLINE_REASONS, MAX_INVITEES_PER_REQUEST, PLAY_GAMES, type DeclineReason, type PlayGame } from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import type { XpService } from '../xp/service.js';
import type { FriendService } from '../friends/service.js';
import { WordleBattleService } from '../game/wordle-battle-service.js';
import { RhymeMatchService } from '../game/rhyme-match-service.js';
import type { PlayEvents } from './events.js';
import { PlayService, type PlayDeps } from './service.js';
import { WordleBattleAdapter } from './adapters/wordle-battle.js';
import { RhymeMatchAdapter } from './adapters/rhyme-match.js';
import { StoriesAdapter, type StoryGamesPort } from './adapters/stories.js';
import type { PlayAdapter } from './types.js';
import type { RankService } from '../ranks/service.js';

/** How often the games close idle lobbies, end games that are over, and invites expire. */
export const PLAY_SWEEP_MS = 30_000;

const game = z.enum(PLAY_GAMES);
const userIds = z.array(z.uuid()).min(1).max(MAX_INVITEES_PER_REQUEST);
const lobbyParams = z.object({ game, lobbyId: z.uuid() });
const inviteParam = z.object({ id: z.uuid() });
const ratedBody = z.object({ rated: z.boolean() });

const createBody = z.object({
  game,
  /** the game's own presets; each game checks them (400 BAD_SETTINGS) */
  settings: z.record(z.string(), z.unknown()).default({}),
  invite: z.array(z.uuid()).max(MAX_INVITEES_PER_REQUEST).optional(),
  chat: z.union([z.object({ userId: z.uuid() }), z.object({ groupId: z.uuid() })]).optional(),
});
const inviteBody = z.object({ game, lobbyId: z.uuid(), userIds });
// the reason is optional, and so is the body: a bare POST is a plain "not now"
const declineBody = z.object({ reason: z.enum(DECLINE_REASONS).optional() }).nullish();

export interface PlayRouteDeps {
  events: PlayEvents;
  xp?: XpService;
  friends: Pick<FriendService, 'statusesBetween'>;
  inbox: PlayDeps['inbox'];
  chat: PlayDeps['chat'];
  groupChat: PlayDeps['groupChat'];
  groups: PlayDeps['groups'];
  /**
   * The story games service (API-games' StoryGamesService), once it is wired
   * in; until then Stories cannot be played through invites.
   */
  stories?: StoryGamesPort;
  /** Game Ranks, shared with the games' own routes (one set of rank events) */
  ranks?: RankService;
}

/**
 * Inviting friends to any online game, game cards in chats, and playing
 * again (contract §B3; @kurda/shared `play`). Every route that starts or joins
 * a game, or reaches someone else, needs a birth month on record.
 */
export function registerPlayRoutes(app: FastifyInstance, deps: PlayRouteDeps): PlayService {
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);
  const adapters: PlayAdapter[] = [
    new WordleBattleAdapter(
      new WordleBattleService(app.db, {
        xp: deps.xp,
        publicUrl,
        ranks: deps.ranks,
        onChange: (id, o) => deps.events.changed('wordle-battle', id, o),
      }),
    ),
    new RhymeMatchAdapter(
      new RhymeMatchService(app.db, {
        xp: deps.xp,
        publicUrl,
        ranks: deps.ranks,
        onChange: (id, o) => deps.events.changed('rhyme-match', id, o),
      }),
    ),
  ];
  if (deps.stories) {
    adapters.push(new StoriesAdapter(app.db, deps.stories));
    // The story games tell us only that a game changed, not whether a chat
    // card could show it, so every answer and "continue" reaches the room of a
    // group the game was shared into (play/events.ts). Once the service says
    // which changes are moves in a game under way, pass `{ card: false }` for
    // those, as Peyvok Battle and Rhyme Match do.
    deps.stories.onChange((id) => deps.events.changed('stories', id));
  }
  const play = new PlayService(app.db, {
    adapters,
    events: deps.events,
    friends: deps.friends,
    inbox: deps.inbox,
    chat: deps.chat,
    groupChat: deps.groupChat,
    groups: deps.groups,
    log: app.log,
    publicUrl,
  });

  /** Make a lobby with the host in it, post its card where it was started, and ask friends. */
  app.post(
    '/play/lobbies',
    { schema: { body: createBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireBirthMonth },
    async (req, reply) => {
      const body = req.body as z.infer<typeof createBody>;
      const created = await play.createLobby(req.user!.id, body);
      return reply.code(201).send(created);
    },
  );

  /** Ask friends into your lobby: always ok, with how many were asked. */
  app.post(
    '/play/invites',
    { schema: { body: inviteBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireBirthMonth },
    async (req) => {
      const body = req.body as z.infer<typeof inviteBody>;
      const { invited } = await play.invite(req.user!.id, body.game, body.lobbyId, body.userIds);
      return { ok: true, invited };
    },
  );

  /** The banners to show, and your list of answers to your own invites. */
  app.get('/play/invites', { preHandler: requireAuth }, async (req) => play.lists(req.user!.id));

  /** Yes: into the lobby (the game's own join). Saying yes twice is one yes. */
  app.post(
    '/play/invites/:id/accept',
    { schema: { params: inviteParam }, config: { skipValidation: true, rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireBirthMonth },
    async (req) => play.accept(req.user!.id, (req.params as { id: string }).id),
  );

  /** Not now — a preset reason, never free text. */
  app.post(
    '/play/invites/:id/decline',
    { schema: { params: inviteParam, body: declineBody }, preHandler: requireAuth },
    async (req) => {
      const reason = ((req.body as { reason?: DeclineReason } | undefined)?.reason ?? null) as DeclineReason | null;
      await play.decline(req.user!.id, (req.params as { id: string }).id, reason);
      return { ok: true };
    },
  );

  /** The host takes an invite back. */
  app.delete('/play/invites/:id', { schema: { params: inviteParam }, preHandler: requireAuth }, async (req) => {
    await play.cancel(req.user!.id, (req.params as { id: string }).id);
    return { ok: true };
  });

  /** The host's Rated/Friendly toggle, in the lobby only (Game Ranks). */
  app.put(
    '/play/:game/:lobbyId/rated',
    { schema: { params: lobbyParams, body: ratedBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req) => {
      const p = req.params as { game: PlayGame; lobbyId: string };
      const { rated } = req.body as z.infer<typeof ratedBody>;
      await play.setRated(req.user!.id, p.game, p.lobbyId, rated);
      return { ok: true, rated };
    },
  );

  /** A game card's live state, as the viewer may see it ('unavailable' otherwise). */
  app.get('/play/cards/:game/:lobbyId', { schema: { params: lobbyParams }, preHandler: requireAuth }, async (req) => {
    const p = req.params as { game: PlayGame; lobbyId: string };
    return play.card(req.user!.id, p.game, p.lobbyId);
  });

  /** Where playing again stands: offers, the next game once there is one, the running score. */
  app.get('/play/:game/:lobbyId/rematch', { schema: { params: lobbyParams }, preHandler: requireAuth }, async (req) => {
    const p = req.params as { game: PlayGame; lobbyId: string };
    return play.rematchState(req.user!.id, p.game, p.lobbyId);
  });

  /** Play again: offer a rematch (two players), or open the next round (the host of more). */
  app.post(
    '/play/:game/:lobbyId/rematch',
    { schema: { params: lobbyParams }, config: { skipValidation: true, rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireBirthMonth },
    async (req) => {
      const p = req.params as { game: PlayGame; lobbyId: string };
      return play.offerRematch(req.user!.id, p.game, p.lobbyId);
    },
  );

  /** No thanks, or leaving the results: a rematch offer is off. */
  app.delete('/play/:game/:lobbyId/rematch', { schema: { params: lobbyParams }, preHandler: requireAuth }, async (req) => {
    const p = req.params as { game: PlayGame; lobbyId: string };
    return play.declineRematch(req.user!.id, p.game, p.lobbyId);
  });

  // idle lobbies, games that are over and invites past their time are closed on
  // a timer too, not only when somebody happens to look
  const sweep = setInterval(
    () => void play.sweep().catch((err) => app.log.warn({ err }, 'play sweep failed')),
    PLAY_SWEEP_MS,
  );
  app.addHook('onClose', async () => {
    clearInterval(sweep);
    deps.events.close();
  });

  return play;
}
