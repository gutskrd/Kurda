import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { RoomBus, RoomEvent } from './bus.js';
import type { RealtimeKV } from './kv.js';

export const TICKET_TTL_SECONDS = 30;
export const RESUME_TTL_SECONDS = 300;
/** Live connections one person may have at once (phone, tablet, a few tabs), bounded so a runaway client cannot pile up sockets. */
export const MAX_CONNECTIONS_PER_USER = 5;
/**
 * The largest client message in bytes. Clients send joins, leaves and pings of a few dozen bytes; the library default
 * of 100 MiB would let any connection make the server parse that much. A larger frame closes the connection (1009).
 */
export const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;
/**
 * Messages one connection may send in a burst (rejoining every room after a reconnect is the largest real one),
 * refilled at the rate below. Past it the connection closes, since each message can cost a Redis round trip.
 */
export const MESSAGE_BURST = 100;
export const MESSAGES_PER_SECOND = 10;
/** Close codes (4xxx = application-defined). */
export const CLOSE_CONNECTED_ELSEWHERE = 4001;
export const CLOSE_BAD_TICKET = 4003;
export const CLOSE_TOO_MANY_MESSAGES = 4008;
/** How often the session behind every connection is checked (`checkSessions`). */
export const SESSION_CHECK_MS = 60_000;
/** Bus-only instruction for `revoke`: handled by each node, never delivered. */
const REVOKE_EVENT = 'rt_revoke';
/** Control event on a user's channel: close the connections one session opened (`endSession`). */
const END_SESSION_EVENT = 'rt_end_session';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session a connection was opened in: the account and its sign-in (refresh token family). */
export interface SessionRef {
  userId: string;
  /** null for an access token from before sessions were named in it */
  familyId: string | null;
}

/**
 * Of these sessions, those ended since their connections opened: signed out, revoked, or ended by a new password, a
 * ban or a closed account. The app answers it from the database (realtime/sessions.ts).
 */
export type SessionCheck = (sessions: readonly SessionRef[]) => Promise<readonly SessionRef[]>;

export interface GatewayOptions {
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  sessionsEnded?: SessionCheck;
  sessionCheckMs?: number;
}

interface Connection {
  socket: WebSocket;
  userId: string;
  familyId: string | null;
  rooms: Set<string>;
  resumeToken: string;
  lastPongAt: number;
  /** When the last heartbeat ping was sent, for RTT. */
  pingSentAt?: number;
  /** last measured round-trip time in ms */
  rttMs?: number;
  /** Messages this connection may still send now (see MESSAGE_BURST). */
  allowance: number;
  allowanceAt: number;
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
 * Realtime gateway.
 *
 * - Auth: clients POST /realtime/ticket (bearer auth) for a 30-second single-use ticket, then connect to
 *   GET /realtime?ticket=…, so the JWT never rides a query string.
 * - Heartbeat: the server pings, and a connection with no pong within the timeout is terminated.
 * - Resume: hello carries a resume token; reconnecting with it rejoins the same rooms.
 * - Rooms: membership is invite-based (features call invite() first), and events fan out via the RoomBus so any node
 *   can serve any room.
 * - Up to MAX_CONNECTIONS_PER_USER connections per user, each on the user's own channel, so `notifyUser` reaches
 *   every device; one more closes the oldest with 4001.
 */
export class RealtimeGateway {
  /** each user's live connections on this node, oldest first */
  private readonly connections = new Map<string, Set<Connection>>();
  private readonly roomMembers = new Map<string, Set<Connection>>();
  private readonly customHandlers = new Map<string, ClientMessageHandler>();
  private readonly disconnectListeners: Array<(userId: string) => void> = [];
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private sweepTimer?: NodeJS.Timeout;
  private readonly sessionsEnded?: SessionCheck;
  private readonly sessionCheckMs: number;
  private sessionTimer?: NodeJS.Timeout;
  private checkingSessions = false;

  constructor(
    private readonly kv: RealtimeKV,
    private readonly bus: RoomBus,
    opts: GatewayOptions = {},
  ) {
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 10_000;
    this.heartbeatTimeoutMs = opts.heartbeatTimeoutMs ?? 25_000;
    this.sessionsEnded = opts.sessionsEnded;
    this.sessionCheckMs = opts.sessionCheckMs ?? SESSION_CHECK_MS;
    this.bus.onEvent((roomId, event) => this.deliverLocal(roomId, event));
  }

  /** Features authorize a user for a room before they can join it. */
  async invite(roomId: string, userId: string, ttlSeconds = 3_600): Promise<void> {
    await this.kv.set(`rt:invite:${roomId}:${userId}`, '1', ttlSeconds);
  }

  /**
   * Takes back a user's place in a room: the invite goes, so they cannot join or resume into it, and a connection of
   * theirs in it leaves on whichever node holds it (instructed over the bus, never seen by clients).
   */
  async revoke(roomId: string, userId: string): Promise<void> {
    await this.revokeAll(roomId, [userId]);
  }

  /** `revoke` for several people at once: their invites go in one delete, and each is told to leave. */
  async revokeAll(roomId: string, userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.kv.del(...userIds.map((userId) => `rt:invite:${roomId}:${userId}`));
    await Promise.all(userIds.map((userId) => this.bus.publish(roomId, { type: REVOKE_EVENT, userId })));
  }

  /**
   * Fans an event out to everyone in the room on all nodes. `hiddenFrom` names users it is not for (members with a
   * block against a group message's author); their connections stay in the room and skip this one event. The list is
   * server-only.
   */
  async publish(roomId: string, event: RoomEvent): Promise<void> {
    await this.bus.publish(roomId, event);
  }

  /**
   * Closes, on whichever node holds them, the connections one session opened, at once rather than at the next session
   * check: a phone switched to a child's profile must stop hearing its parent's messages the moment it changes hands.
   */
  async endSession(userId: string, familyId: string): Promise<void> {
    await this.bus.publish(`user:${userId}`, { type: END_SESSION_EVENT, familyId });
  }

  /** Direct push to a single user's connection on whichever node. */
  async notifyUser(userId: string, event: RoomEvent): Promise<void> {
    await this.bus.publish(`user:${userId}`, event);
  }

  /** The last measured RTT (ms) of a user's newest live connection, or null. */
  rttFor(userId: string): number | null {
    const conns = this.connections.get(userId);
    if (!conns) return null;
    return [...conns].at(-1)?.rttMs ?? null;
  }

  /** Fires when a user's last live connection on this node drops. */
  onDisconnect(listener: (userId: string) => void): void {
    this.disconnectListeners.push(listener);
  }

  /** Registers a handler for a custom client message type ('answer', ...). */
  onClientMessage(type: string, handler: ClientMessageHandler): void {
    if (['join', 'leave', 'ping'].includes(type) || this.customHandlers.has(type)) {
      throw new Error(`client message type already registered: ${type}`);
    }
    this.customHandlers.set(type, handler);
  }

  /** Live connections on this node, every user's together. */
  connectionCount(): number {
    let n = 0;
    for (const conns of this.connections.values()) n += conns.size;
    return n;
  }

  registerRoutes(app: FastifyInstance): void {
    app.post(
      '/realtime/ticket',
      { config: { skipValidation: true }, preHandler: requireAuth },
      async (req) => {
        const ticket = randomBytes(24).toString('base64url');
        const familyId = req.user!.familyId && UUID_RE.test(req.user!.familyId) ? req.user!.familyId : null;
        const session: SessionRef = { userId: req.user!.id, familyId };
        await this.kv.set(`rt:ticket:${ticket}`, JSON.stringify(session), TICKET_TTL_SECONDS);
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
        const held = query.ticket ? await this.kv.take(`rt:ticket:${query.ticket}`) : null;
        const session = held ? ticketSession(held) : null;
        if (!session) {
          socket.close(CLOSE_BAD_TICKET, 'invalid ticket');
          return;
        }
        await this.accept(socket, session, query.resume);
      },
    );

    this.sweepTimer = setInterval(() => this.sweep(), this.heartbeatIntervalMs);
    if (this.sessionsEnded) this.sessionTimer = setInterval(() => void this.checkSessions(), this.sessionCheckMs);
    app.addHook('onClose', async () => {
      clearInterval(this.sweepTimer);
      clearInterval(this.sessionTimer);
      for (const conn of this.allConnections()) {
        conn.socket.terminate();
      }
      await this.bus.close();
    });
  }

  private async accept(socket: WebSocket, session: SessionRef, resume?: string): Promise<void> {
    const { userId } = session;
    let conns = this.connections.get(userId);
    if (!conns) {
      conns = new Set();
      this.connections.set(userId, conns);
    }
    // room for this one: the oldest connections give way (a Set keeps insertion order)
    while (conns.size >= MAX_CONNECTIONS_PER_USER) {
      const oldest = conns.values().next().value!;
      oldest.socket.close(CLOSE_CONNECTED_ELSEWHERE, 'connected elsewhere');
      this.dropConnection(oldest);
    }

    const conn: Connection = {
      socket,
      userId,
      familyId: session.familyId,
      rooms: new Set(),
      resumeToken: randomBytes(24).toString('base64url'),
      lastPongAt: Date.now(),
      allowance: MESSAGE_BURST,
      allowanceAt: Date.now(),
    };
    // dropping the oldest may have emptied and removed the set
    this.connections.set(userId, conns);
    conns.add(conn);
    // personal channel for server→user pushes (match found, invites, ...)
    this.joinLocal(conn, `user:${userId}`);

    socket.on('pong', () => {
      const now = Date.now();
      conn.lastPongAt = now;
      // RTT from the heartbeat round trip, measured on the server.
      if (conn.pingSentAt !== undefined) conn.rttMs = now - conn.pingSentAt;
    });
    // A store that cannot answer fails this message, not the process: an unhandled rejection here would end it for everyone.
    socket.on('message', (raw) => {
      this.onMessage(conn, raw.toString()).catch(() => this.send(conn, { type: 'error', code: 'UNAVAILABLE' }));
    });
    socket.on('close', () => this.dropConnection(conn));

    // resume: rejoin previous rooms (token is single-use)
    const resumedRooms: string[] = [];
    if (resume) {
      const state = await this.kv.take(`rt:resume:${resume}`);
      if (state) {
        const parsed = JSON.parse(state) as { userId: string; rooms: string[] };
        if (parsed.userId === userId) {
          // Only rooms the user may still be in: a revoked invite is not undone by reconnecting.
          const invited = await this.kv.getMany(parsed.rooms.map((room) => `rt:invite:${room}:${userId}`));
          parsed.rooms.forEach((room, i) => {
            if (invited[i]) resumedRooms.push(room);
          });
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

  /** Spend one message of the connection's allowance; false when there is none left. */
  private takeMessage(conn: Connection, now = Date.now()): boolean {
    const refill = ((now - conn.allowanceAt) / 1000) * MESSAGES_PER_SECOND;
    conn.allowance = Math.min(MESSAGE_BURST, conn.allowance + refill);
    conn.allowanceAt = now;
    if (conn.allowance < 1) return false;
    conn.allowance -= 1;
    return true;
  }

  private async onMessage(conn: Connection, raw: string): Promise<void> {
    if (!this.takeMessage(conn)) {
      conn.socket.close(CLOSE_TOO_MANY_MESSAGES, 'too many messages');
      this.dropConnection(conn);
      return;
    }
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
    if (event.type === END_SESSION_EVENT) {
      for (const conn of [...(members ?? [])]) {
        if (conn.familyId === null || conn.familyId !== event.familyId) continue;
        conn.socket.close(CLOSE_BAD_TICKET, 'session ended');
        this.dropConnection(conn);
      }
      return;
    }
    if (event.type === REVOKE_EVENT) {
      for (const conn of [...(members ?? [])]) {
        if (conn.userId !== event.userId) continue;
        this.leaveLocal(conn, roomId);
        void this.persistResumeState(conn).catch(() => undefined);
      }
      return;
    }
    if (!members) return;
    const { hiddenFrom, ...shown } = event;
    const hidden = new Set(Array.isArray(hiddenFrom) ? hiddenFrom : []);
    for (const conn of members) {
      if (hidden.has(conn.userId)) continue;
      this.send(conn, { type: 'event', room: roomId, event: shown });
    }
  }

  private dropConnection(conn: Connection): void {
    const conns = this.connections.get(conn.userId);
    const wasLive = conns?.delete(conn) ?? false;
    const lastOne = wasLive && conns!.size === 0;
    if (lastOne) this.connections.delete(conn.userId);
    for (const roomId of conn.rooms) {
      const members = this.roomMembers.get(roomId);
      members?.delete(conn);
      if (members && members.size === 0) this.roomMembers.delete(roomId);
    }
    // Notify features only once the user has no connection left on this node.
    if (lastOne) {
      for (const listener of this.disconnectListeners) listener(conn.userId);
    }
    // Resume state stays for RESUME_TTL, so a quick reconnect lands back in its rooms.
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
    for (const conn of this.allConnections()) {
      if (now - conn.lastPongAt > this.heartbeatTimeoutMs) {
        conn.socket.terminate();
        this.dropConnection(conn);
        reaped++;
        continue;
      }
      try {
        conn.pingSentAt = Date.now();
        conn.socket.ping();
      } catch {
        // terminated between iteration steps — drop next sweep
      }
    }
    return reaped;
  }

  /**
   * Closes every connection whose session has ended since it opened. A ticket is checked only when the socket opens, and
   * a socket lives while it answers pings, so without this a signed-out, banned or re-passworded session would keep
   * receiving messages. Every SESSION_CHECK_MS all sessions on this node are checked in one query, and ended ones are
   * closed with CLOSE_BAD_TICKET; the apps then ask for a new ticket, which an ended session cannot get. A database that
   * cannot answer closes nothing.
   */
  async checkSessions(): Promise<number> {
    if (!this.sessionsEnded || this.checkingSessions) return 0;
    const conns = this.allConnections();
    if (conns.length === 0) return 0;
    this.checkingSessions = true;
    try {
      const sessions = new Map(conns.map((c) => [sessionKey(c), { userId: c.userId, familyId: c.familyId }]));
      const ended = new Set((await this.sessionsEnded([...sessions.values()])).map(sessionKey));
      let closed = 0;
      for (const conn of conns) {
        if (!ended.has(sessionKey(conn))) continue;
        conn.socket.close(CLOSE_BAD_TICKET, 'session ended');
        this.dropConnection(conn);
        closed++;
      }
      return closed;
    } catch {
      return 0;
    } finally {
      this.checkingSessions = false;
    }
  }

  /** Every live connection on this node, as a copy (callers drop some while iterating). */
  private allConnections(): Connection[] {
    return [...this.connections.values()].flatMap((conns) => [...conns]);
  }

  private send(conn: Connection, payload: Record<string, unknown>): void {
    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(JSON.stringify(payload));
    }
  }
}

/** One session as a map key. */
function sessionKey(s: SessionRef): string {
  return `${s.userId}:${s.familyId ?? ''}`;
}

/** The session a ticket was issued to; an older ticket that did not name one holds only the account. */
function ticketSession(held: string): SessionRef | null {
  if (!held.startsWith('{')) return { userId: held, familyId: null };
  try {
    const parsed = JSON.parse(held) as Partial<SessionRef>;
    if (typeof parsed.userId !== 'string') return null;
    return { userId: parsed.userId, familyId: typeof parsed.familyId === 'string' ? parsed.familyId : null };
  } catch {
    return null;
  }
}
