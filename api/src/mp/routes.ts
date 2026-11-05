import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MULTI_GAMES, type LetterDialect, type MultiGame } from '@kurda/shared';
import { requireAccount } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { gameNotFound } from '../play/errors.js';
import { requireBirthMonth } from '../users/age.js';
import type { RoomBus } from '../realtime/bus.js';
import type { XpService } from '../xp/service.js';
import type { RankService } from '../ranks/service.js';
import type { LobbyChange } from '../play/types.js';
import { StoryGameNotifier } from '../story-games/notifier.js';
import type { FreeTextDeps } from './free-text.js';
import { GenericLobbyAdapter } from './adapter.js';
import { MP_ROOM_PREFIX } from './notify.js';
import { MultiplayerService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Present when DATABASE_URL is configured. */
    multiplayer: MultiplayerService;
  }
}

const game = z.enum(MULTI_GAMES);
const lobbyParams = z.object({ game, id: z.uuid() });
const gameParam = z.object({ game });
const pollQuery = z.object({ v: z.coerce.number().int().min(0).max(2_147_483_647).optional() });
const seatBody = z.object({ seat: z.number().int().min(1).max(100) });
const teamBody = z.object({ seat: z.number().int().min(1).max(100), team: z.number().int().min(1).max(4) });
const dialectQuery = z.object({ dialect: z.enum(['kmr', 'ckb']).optional() });

/** Create 20/min, join 10/min, moves 60/min, the long-poll 120/min, other controls 60/min (as the story games). */
const perMinute = (max: number) => ({ rateLimit: { max, windowMs: 60_000 } });

export interface MultiplayerRouteDeps {
  /** the realtime room bus: wakes a game's long-polls on every instance */
  bus: RoomBus | null;
  xp: XpService;
  ranks?: RankService;
  /** the chat pipeline, for the games that take free text, and the offense ladder */
  freeText?: Omit<FreeTextDeps, 'db'>;
  /** the play layer's `play_changed` */
  onChange: (game: MultiGame, lobbyId: string, opts?: LobbyChange) => void;
}

/** How often the housekeeping runs, and how soon after boot it first does. */
const HOUSEKEEPING_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_HOUSEKEEPING_MS = 5 * 60 * 1000;

/**
 * The multiplayer learning games' own routes, under `/mp/:game` — one set for
 * every game the engine runs. Lobbies are made through the play layer
 * (`POST /play/lobbies`), so invites, codes and cards work as for every
 * game; these are the room itself. Members only on every route: anyone else,
 * and a player the host removed, gets the same 404 as for a game that does
 * not exist (someone the join rule lets in may look at an open lobby, to join
 * it). Joining and playing against Hevalo need a birth month on record, like
 * everything else that puts people together or pays.
 *
 * `GET /mp/:game/:id?v=` is the long-poll the apps fall back on when the
 * realtime connection is down: it answers at once when the game moved past
 * version `v`, else when it does (or after 20 s, or just after its next
 * deadline). With the connection up they read it without `v` on each
 * `play_changed`.
 *
 * Returns the adapters the play layer drives, one per game.
 */
export function registerMultiplayerRoutes(app: FastifyInstance, deps: MultiplayerRouteDeps): GenericLobbyAdapter[] {
  const notifier = new StoryGameNotifier(deps.bus, app.log, { roomPrefix: MP_ROOM_PREFIX });
  const mp = new MultiplayerService(app.db, {
    xp: deps.xp,
    ranks: deps.ranks,
    notifier,
    freeText: deps.freeText,
    onChange: deps.onChange,
    publicUrl: (k) => (app.storage ? app.storage.publicUrl(k) : null),
    log: app.log,
    cache: app.cache,
  });
  app.decorate('multiplayer', mp);
  // waiting polls are answered before Fastify waits for requests in flight
  app.addHook('preClose', async () => mp.close());

  const housekeeping = () =>
    void mp
      .housekeeping()
      .then((stats) => app.log.info({ ...stats }, 'multiplayer game housekeeping'))
      .catch((err) => app.log.warn({ err }, 'multiplayer game housekeeping failed'));
  const first = setTimeout(housekeeping, FIRST_HOUSEKEEPING_MS);
  const every = setInterval(housekeeping, HOUSEKEEPING_EVERY_MS);
  first.unref?.();
  every.unref?.();
  app.addHook('onClose', async () => {
    clearTimeout(first);
    clearInterval(every);
  });

  /** Whether the game is offered in each dialect now, with friends and against Hevalo (the Learn list asks). */
  app.get('/mp/:game/availability', { schema: { params: gameParam, querystring: dialectQuery }, preHandler: requireAccount }, async (req) => {
    const { game: g } = req.params as z.infer<typeof gameParam>;
    const { dialect } = req.query as z.infer<typeof dialectQuery>;
    const dialects: LetterDialect[] = dialect ? [dialect] : ['kmr', 'ckb'];
    return { dialects: await Promise.all(dialects.map(async (d) => ({ dialect: d, ...(await mp.availability(g, d)) }))) };
  });

  /** One person against Hevalo: started at once. */
  app.post(
    '/mp/:game/solo',
    { schema: { params: gameParam }, config: perMinute(20), preHandler: [requireAccount, requireBirthMonth] },
    async (req, reply) => {
      const { game: g } = req.params as z.infer<typeof gameParam>;
      return reply.code(201).send(await mp.createSolo(req.user!.id, g, req.body ?? {}));
    },
  );

  app.get(
    '/mp/:game/:id',
    { schema: { params: lobbyParams, querystring: pollQuery }, config: perMinute(120), preHandler: requireAccount },
    async (req) => {
      const { id } = req.params as z.infer<typeof lobbyParams>;
      const { v } = req.query as z.infer<typeof pollQuery>;
      // the client giving up (closed tab, aborted request) frees its slot at once
      const view = await mp.poll(id, req.user!.id, v, (stop) => req.raw.once('close', stop));
      return view ?? {};
    },
  );

  app.post(
    '/mp/:game/:id/join',
    { schema: { params: lobbyParams }, config: { ...perMinute(10), skipValidation: true }, preHandler: [requireAccount, requireBirthMonth] },
    async (req) => {
      const { id } = req.params as z.infer<typeof lobbyParams>;
      const outcome = await mp.join(req.user!.id, id);
      // every refusal of the join rule is the same 404 as a game that does not exist
      if (outcome === 'started') throw new AppError('GAME_STARTED', 409, 'this game has already started');
      if (outcome === 'full') throw new AppError('GAME_FULL', 409, 'this game is full');
      if (outcome === 'not-found') throw gameNotFound();
      return mp.view(id, req.user!.id);
    },
  );

  // a POST with nothing to send: the id in the path is all there is to check
  const bodiless = () => ({ config: { ...perMinute(60), skipValidation: true }, schema: { params: lobbyParams }, preHandler: requireAccount });

  app.post('/mp/:game/:id/start', bodiless(), async (req) => mp.start((req.params as z.infer<typeof lobbyParams>).id, req.user!.id));

  app.post('/mp/:game/:id/leave', bodiless(), async (req) => {
    await mp.leave((req.params as z.infer<typeof lobbyParams>).id, req.user!.id);
    return { ok: true };
  });

  app.post(
    '/mp/:game/:id/moves',
    { schema: { params: lobbyParams }, config: perMinute(60), preHandler: requireAccount },
    async (req) => mp.move((req.params as z.infer<typeof lobbyParams>).id, req.user!.id, req.body),
  );

  app.post(
    '/mp/:game/:id/remove',
    { schema: { params: lobbyParams, body: seatBody }, config: perMinute(60), preHandler: requireAccount },
    async (req) => mp.remove((req.params as z.infer<typeof lobbyParams>).id, req.user!.id, (req.body as z.infer<typeof seatBody>).seat),
  );

  app.post(
    '/mp/:game/:id/team',
    { schema: { params: lobbyParams, body: teamBody }, config: perMinute(60), preHandler: requireAccount },
    async (req) => {
      const body = req.body as z.infer<typeof teamBody>;
      return mp.setTeam((req.params as z.infer<typeof lobbyParams>).id, req.user!.id, body.seat, body.team);
    },
  );

  return MULTI_GAMES.map((g) => new GenericLobbyAdapter(g, mp));
}
