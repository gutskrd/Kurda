import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { RoomBus, RoomEvent } from './bus.js';
import type { RealtimeKV } from './kv.js';

export const TICKET_TTL_SECONDS = 30;
export const RESUME_TTL_SECONDS = 300;
/** Close codes (4xxx = application-defined). */
export const CLOSE_CONNECTED_ELSEWHERE = 4001;
export const CLOSE_BAD_TICKET = 4003;

export interface GatewayOptions {
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}

interface Connection {
  socket: WebSocket;
  userId: string;
  rooms: Set<string>;
  resumeToken: string;
  lastPongAt: number;
}

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), room: z.string().min(1).max(80) }),
  z.object({ type: z.literal('leave'), room: z.string().min(1).max(80) }),
  z.object({ type: z.literal('ping') }),
]);

/** Feature handlers for custom client message types (game answers, ...). */
export type ClientMessageHandler = (
  userId: string,
  payload: Record<string, unknown>,
) => void | Promise<void>;

/**
 * Realtime gateway (KUR-049).
 *
 * - AUTH: clients POST /realtime/ticket (bearer-authed) for a 30s
 *   single-use ticket, then connect to GET /realtime?ticket=... — the
 *   JWT itself never rides a query string.
 * - HEARTBEAT: server pings; no pong within the timeout → terminated
 *   (defaults reap dead connections well inside 30s).
 * - RESUME: hello carries a resume token; reconnecting with it rejoins
 *   the same rooms (game reconnection, KUR-051/057).
 * - ROOMS: membership is invite-based (features call invite() before a
 *   user may join); events fan out via the RoomBus so any node can
 *   serve any room.
 * - One live connection per user: the newest wins (4001 on the old).
 */
export class RealtimeGateway {
  private readonly connections = new Map<string, Connection>();
  private readonly roomMembers = new Map<string, Set<Connection>>();
  private readonly customHandlers = new Map<string, ClientMessageHandler>();
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly kv: RealtimeKV,
    private readonly bus: RoomBus,
    opts: GatewayOptions = {},
  ) {
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 10_000;
    this.heartbeatTimeoutMs = opts.heartbeatTimeoutMs ?? 25_000;
    this.bus.onEvent((roomId, event) => this.deliverLocal(roomId, event));
  }

  /** Features authorize a user for a room before they can join it. */
  async invite(roomId: string, userId: string, ttlSeconds = 3_600): Promise<void> {
    await this.kv.set(`rt:invite:${roomId}:${userId}`, '1', ttlSeconds);
  }

  /** Server-side event fan-out to everyone in the room (all nodes). */
  async publish(roomId: string, event: RoomEvent): Promise<void> {
    await this.bus.publish(roomId, event);
  }

  /** Direct push to a single user's connection on whichever node. */
  async notifyUser(userId: string, event: RoomEvent): Promise<void> {
    await this.bus.publish(`user:${userId}`, event);
  }

  /** Registers a handler for a custom client message type ('answer', ...). */
  onClientMessage(type: string, handler: ClientMessageHandler): void {
    if (['join', 'leave', 'ping'].includes(type) || this.customHandlers.has(type)) {
      throw new Error(`client message type already registered: ${type}`);
    }
    this.customHandlers.set(type, handler);
  }

  connectionCount(): number {
    return this.connections.size;
  }

  registerRoutes(app: FastifyInstance): void {
    app.post(
      '/realtime/ticket',
      { config: { skipValidation: true }, preHandler: requireAuth },
      async (req) => {
        const ticket = randomBytes(24).toString('base64url');
        await this.kv.set(`rt:ticket:${ticket}`, req.user!.id, TICKET_TTL_SECONDS);
        return { ticket, expiresInSeconds: TICKET_TTL_SECONDS, url: '/realtime' };
      },
    );

    app.get(
      '/realtime',
      {
        websocket: true,
        config: { skipValidation: true, rateLimit: { max: 30, windowMs: 60_000, per: 'ip' as const } },
      },
      async (socket, req) => {
        const query = req.query as { ticket?: string; resume?: string };
        const userId = query.ticket ? await this.kv.take(`rt:ticket:${query.ticket}`) : null;
        if (!userId) {
          socket.close(CLOSE_BAD_TICKET, 'invalid ticket');
          return;
        }
        await this.accept(socket, userId, query.resume);
      },
    );

    this.sweepTimer = setInterval(() => this.sweep(), this.heartbeatIntervalMs);
    app.addHook('onClose', async () => {
      clearInterval(this.sweepTimer);
      for (const conn of this.connections.values()) {
        conn.socket.terminate();
      }
      await this.bus.close();
    });
  }

  private async accept(socket: WebSocket, userId: string, resume?: string): Promise<void> {
    // newest connection wins
    const existing = this.connections.get(userId);
    if (existing) {
      existing.socket.close(CLOSE_CONNECTED_ELSEWHERE, 'connected elsewhere');
      this.dropConnection(existing);
    }

    const conn: Connection = {
      socket,
      userId,
      rooms: new Set(),
      resumeToken: randomBytes(24).toString('base64url'),
      lastPongAt: Date.now(),
    };
    this.connections.set(userId, conn);
    // personal channel for server→user pushes (match found, invites, ...)
    this.joinLocal(conn, `user:${userId}`);

    socket.on('pong', () => {
      conn.lastPongAt = Date.now();
    });
    socket.on('message', (raw) => void this.onMessage(conn, raw.toString()));
    socket.on('close', () => this.dropConnection(conn));

    // resume: rejoin previous rooms (token is single-use)
    let resumedRooms: string[] = [];
    if (resume) {
      const state = await this.kv.take(`rt:resume:${resume}`);
      if (state) {
        const parsed = JSON.parse(state) as { userId: string; rooms: string[] };
        if (parsed.userId === userId) {
          resumedRooms = parsed.rooms;
          for (const room of resumedRooms) this.joinLocal(conn, room);
        }
      }
    }
    await this.persistResumeState(conn);

    this.send(conn, {
      type: 'hello',
      resumeToken: conn.resumeToken,
      resumedRooms,
    });
  }

  private async onMessage(conn: Connection, raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.send(conn, { type: 'error', code: 'BAD_MESSAGE' });
      return;
    }

    const typeName = (json as { type?: unknown }).type;
    if (typeof typeName === 'string' && this.customHandlers.has(typeName)) {
      await this.customHandlers.get(typeName)!(conn.userId, json as Record<string, unknown>);
      return;
    }

    let parsed: z.infer<typeof clientMessageSchema>;
    try {
      parsed = clientMessageSchema.parse(json);
    } catch {
      this.send(conn, { type: 'error', code: 'BAD_MESSAGE' });
      return;
    }

    if (parsed.type === 'ping') {
      conn.lastPongAt = Date.now();
      this.send(conn, { type: 'pong', at: Date.now() });
      return;
    }
    if (parsed.type === 'join') {
      const invited = await this.kv.get(`rt:invite:${parsed.room}:${conn.userId}`);
      if (!invited) {
        this.send(conn, { type: 'error', code: 'NOT_INVITED', room: parsed.room });
        return;
      }
      this.joinLocal(conn, parsed.room);
      await this.persistResumeState(conn);
      this.send(conn, { type: 'joined', room: parsed.room });
      return;
    }
    // leave
    this.leaveLocal(conn, parsed.room);
    await this.persistResumeState(conn);
    this.send(conn, { type: 'left', room: parsed.room });
  }

  private joinLocal(conn: Connection, roomId: string): void {
    conn.rooms.add(roomId);
    let members = this.roomMembers.get(roomId);
    if (!members) {
      members = new Set();
      this.roomMembers.set(roomId, members);
    }
    members.add(conn);
  }

  private leaveLocal(conn: Connection, roomId: string): void {
    conn.rooms.delete(roomId);
    const members = this.roomMembers.get(roomId);
    members?.delete(conn);
    if (members && members.size === 0) this.roomMembers.delete(roomId);
  }

  private deliverLocal(roomId: string, event: RoomEvent): void {
    const members = this.roomMembers.get(roomId);
    if (!members) return;
    for (const conn of members) {
      this.send(conn, { type: 'event', room: roomId, event });
    }
  }

  private dropConnection(conn: Connection): void {
    if (this.connections.get(conn.userId) === conn) {
      this.connections.delete(conn.userId);
    }
    for (const roomId of conn.rooms) {
      this.roomMembers.get(roomId)?.delete(conn);
    }
    // resume state stays in the KV for RESUME_TTL so a quick reconnect
    // (app backgrounded, network blip) lands back in its rooms
  }

  private async persistResumeState(conn: Connection): Promise<void> {
    // internal user channel is re-created on accept, not resumed
    const rooms = [...conn.rooms].filter((room) => !room.startsWith('user:'));
    await this.kv.set(
      `rt:resume:${conn.resumeToken}`,
      JSON.stringify({ userId: conn.userId, rooms }),
      RESUME_TTL_SECONDS,
    );
  }

  /** Terminates connections that missed the heartbeat window. */
  sweep(now = Date.now()): number {
    let reaped = 0;
    for (const conn of this.connections.values()) {
      if (now - conn.lastPongAt > this.heartbeatTimeoutMs) {
        conn.socket.terminate();
        this.dropConnection(conn);
        reaped++;
        continue;
      }
      try {
        conn.socket.ping();
      } catch {
        // terminated between iteration steps — drop next sweep
      }
    }
    return reaped;
  }

  private send(conn: Connection, payload: Record<string, unknown>): void {
    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(JSON.stringify(payload));
    }
  }
}
