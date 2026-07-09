import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireAuth } from '../plugins/auth.js';
import type { GameEngine } from './engine.js';
import type { MatchmakingService } from './matchmaking.js';
import type { PrivateRoomService } from './private-room-service.js';
import { MODE_CONFIG, type GameMode } from './modes.js';
import { isValidCode, normalizeCode } from './private-room.js';

const partyBody = z.object({
  mode: z.enum(['1v1', '2v2', 'ffa']),
  /** the full lobby roster (party members first); caller must be included */
  userIds: z.array(z.uuid()).min(2).max(8),
});

export function registerMatchmakingRoutes(
  app: FastifyInstance,
  matchmaking: MatchmakingService,
): void {
  app.post(
    '/matchmaking/queue',
    {
      config: {
        skipValidation: true, // no body
        rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const },
      },
      preHandler: requireAuth,
    },
    async (req) => matchmaking.enqueue(req.user!.id),
  );

  /**
   * Party / lobby start (KUR-055): begin a team or FFA game from a known
   * roster — the pre-req hook a party of friends (KUR-088) uses to queue as a
   * duo and launch together. The caller must be in the roster and the count
   * must match the mode.
   */
  app.post(
    '/matchmaking/party',
    { schema: { body: partyBody }, preHandler: requireAuth },
    async (req) => {
      const { mode, userIds } = req.body as z.infer<typeof partyBody>;
      if (!userIds.includes(req.user!.id)) {
        throw new AppError('NOT_IN_PARTY', 403, 'you must be part of the roster');
      }
      const need = MODE_CONFIG[mode as GameMode].players;
      if (userIds.length !== need) {
        throw new AppError('BAD_ROSTER', 409, `${mode} needs exactly ${need} players`);
      }
      if (new Set(userIds).size !== userIds.length) {
        throw new AppError('BAD_ROSTER', 409, 'duplicate players in the roster');
      }
      const record = await matchmaking.createDirectMatch(userIds, mode as GameMode);
      return { roomId: record.roomId, mode: record.mode, teams: record.teams };
    },
  );

  app.post(
    '/matchmaking/cancel',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => ({ cancelled: await matchmaking.cancel(req.user!.id) }),
  );

  app.get('/matchmaking/status', { preHandler: requireAuth }, async (req) =>
    matchmaking.status(req.user!.id),
  );
}

export function registerGameRoutes(app: FastifyInstance, engine: GameEngine): void {
  /** Reconnect snapshot (KUR-051): resume lands here after rejoining. */
  app.get(
    '/games/:roomId/state',
    {
      schema: { params: z.object({ roomId: z.string().max(80) }) },
      preHandler: requireAuth,
    },
    async (req) => {
      const { roomId } = req.params as { roomId: string };
      const snapshot = engine.getSnapshot(roomId, req.user!.id);
      if (!snapshot) {
        throw new AppError('GAME_NOT_FOUND', 404, 'no active game for you with that id');
      }
      return snapshot;
    },
  );
}

const createRoomBody = z.object({
  mode: z.enum(['1v1', '2v2', 'ffa']).optional(),
  category: z.enum(['vocabulary', 'phrases']).optional(),
  level: z.number().int().min(1).max(3).optional(),
});

const codeParam = z.object({ code: z.string().min(4).max(12) });

/** Host-controlled private rooms joinable by 6-char code (KUR-056). */
export function registerPrivateRoomRoutes(app: FastifyInstance, rooms: PrivateRoomService): void {
  const requireCode = (raw: string): string => {
    const code = normalizeCode(raw);
    if (!isValidCode(code)) throw new AppError('BAD_CODE', 400, 'invalid room code');
    return code;
  };

  /** Create a room → returns the join code. */
  app.post(
    '/rooms',
    { schema: { body: createRoomBody }, preHandler: requireAuth },
    async (req) => {
      const body = req.body as z.infer<typeof createRoomBody>;
      const room = await rooms.create(req.user!.id, body);
      return { code: room.code, mode: room.mode, players: room.players };
    },
  );

  /** Join a room by code (rate-limited against code-guessing). */
  app.post(
    '/rooms/:code/join',
    {
      schema: { params: codeParam },
      config: { skipValidation: true, rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const code = requireCode((req.params as { code: string }).code);
      const room = await rooms.join(code, req.user!.id);
      return { code: room.code, mode: room.mode, players: room.players, started: room.started, roomId: room.roomId };
    },
  );

  /** Room lobby state (players, host, whether it's started). */
  app.get(
    '/rooms/:code',
    { schema: { params: codeParam }, preHandler: requireAuth },
    async (req) => {
      const code = requireCode((req.params as { code: string }).code);
      const room = await rooms.get(code);
      if (!room) throw new AppError('ROOM_NOT_FOUND', 404, 'room not found or expired');
      return {
        code: room.code,
        hostId: room.hostId,
        mode: room.mode,
        players: room.players,
        started: room.started,
        roomId: room.roomId,
      };
    },
  );

  /** Host: start the game. */
  app.post(
    '/rooms/:code/start',
    { schema: { params: codeParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      const code = requireCode((req.params as { code: string }).code);
      return rooms.start(code, req.user!.id);
    },
  );

  /** Host heartbeat (resets the pre-start grace). */
  app.post(
    '/rooms/:code/touch',
    { schema: { params: codeParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      const code = requireCode((req.params as { code: string }).code);
      await rooms.touch(code, req.user!.id);
      return { ok: true };
    },
  );
}
