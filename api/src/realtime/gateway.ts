import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { RoomBus, RoomEvent } from './bus.js';
import type { RealtimeKV } from './kv.js';

export const TICKET_TTL_SECONDS = 30;
export const RESUME_TTL_SECONDS = 300;
/**
 * Live connections one person may have at once: a phone, a tablet and a few
 * browser tabs. Enough that one never pushes another off; bounded so a
 * runaway client cannot pile up sockets.
 */
export const MAX_CONNECTIONS_PER_USER = 5;
/**
 * The largest message a client may send, in bytes. What clients send is a
 * join, a leave or a ping, a few dozen bytes; the WebSocket library's own
 * default is 100 MiB, which every connection could otherwise make the server
 * read and parse. A larger frame closes the connection (1009).
 */
export const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;
/**
 * Messages one connection may send: a burst of this many (rejoining every room
 * after a reconnect is the largest real one), refilled at the rate below.
 * Past it the connection is closed — each message can cost a Redis round trip,
 * so an unbounded stream from one socket is load on everyone's.
 */
export const MESSAGE_BURST = 100;
export const MESSAGES_PER_SECOND = 10;
/** Close codes (4xxx = application-defined). */
export const CLOSE_CONNECTED_ELSEWHERE = 4001;
export const CLOSE_BAD_TICKET = 4003;
export const CLOSE_TOO_MANY_MESSAGES = 4008;
/** How often the session behind every connection is asked whether it still stands (`checkSessions`). */
export const SESSION_CHECK_MS = 60_000;
/** Bus-only instruction for `revoke`: handled by each node, never delivered. */
const REVOKE_EVENT = 'rt_revoke';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session a connection was opened in: the account, and the sign-in (refresh token family) it came from. */
export interface SessionRef {
  userId: string;
  /** null for an access token from before sessions were named in it */
  familyId: string | null;
}

/**
 * Of these sessions, the ones that have ended since their connections opened:
 * signed out, revoked from the session list, ended by a new password, a ban or
 * a closed account. The app answers it from the database (realtime/sessions.ts).
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
  /** when the last heartbeat ping was sent (for RTT, KUR-057) */
  pingSentAt?: number;
  /** last measured round-trip time in ms */
  rttMs?: number;
  /** messages this connection may still send now (see MESSAGE_BURST) */
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
 * - Up to MAX_CONNECTIONS_PER_USER live connections per user, each joined to
 *   the user's own channel, so `notifyUser` reaches every device and tab. It
 *   used to be one: the newest won, and a web tab and a phone took turns
 *   pushing each other off (4001) — whichever lost missed its invites. A
 *   sixth connection now closes the OLDEST with 4001.
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
   * Take back a user's place in a room: the invite goes, so they cannot join
   * or resume into it, and a connection of theirs already in it leaves it on
   * whichever node holds it (the bus carries the instruction, and no client
   * ever sees it).
   */
  async revoke(roomId: string, userId: string): Promise<void> {
    await this.kv.del(`rt:invite:${roomId}:${userId}`);
    await this.bus.publish(roomId, { type: REVOKE_EVENT, userId });
  }

  /**
   * Server-side event fan-out to everyone in the room (all nodes).
   *
   * An event may name users it is not for in `hiddenFrom`: a group message
   * goes to the whole group except the members with a block between them and
   * whoever wrote it. Their connections stay in the room — they are still in
   * the group — and are skipped for this one event. The list is the server's
   * own and no client ever sees it.
   */
  async publish(roomId: string, event: RoomEvent): Promise<void> {
    await this.bus.publish(roomId, event);
  }

  /** Direct push to a single user's connection on whichever node. */
  async notifyUser(userId: string, event: RoomEvent): Promise<void> {
    await this.bus.publish(`user:${userId}`, event);
  }

  /** Last measured RTT (ms) for a user's newest live connection, or null (KUR-057). */
  rttFor(userId: string): number | null {
    const conns = this.connections.get(userId);
    if (!conns) return null;
    return [...conns].at(-1)?.rttMs ?? null;
  }

  /** Fires when a user's last live connection on this node drops (game disconnect, KUR-057). */
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
      // RTT from the heartbeat round-trip (KUR-057), measured server-side
      if (conn.pingSentAt !== undefined) conn.rttMs = now - conn.pingSentAt;
    });
    socket.on('message', (raw) => void this.onMessage(conn, raw.toString()));
    socket.on('close', () => this.dropConnection(conn));

    // resume: rejoin previous rooms (token is single-use)
    const resumedRooms: string[] = [];
    if (resume) {
      const state = await this.kv.take(`rt:resume:${resume}`);
      if (state) {
        const parsed = JSON.parse(state) as { userId: string; rooms: string[] };
        if (parsed.userId === userId) {
          // only rooms the user may still be in: an invite taken back while
          // they were away (`revoke`) is not undone by reconnecting
          for (const room of parsed.rooms) {
            if (await this.kv.get(`rt:invite:${room}:${userId}`)) resumedRooms.push(room);
          }
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
    // notify features (game auto-wrong on mid-question disconnect, KUR-057) —
    // only once the user has no connection left on this node
    if (lastOne) {
      for (const listener of this.disconnectListeners) listener(conn.userId);
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
   * Close every connection whose session has ended since it opened.
   *
   * A ticket is checked once, when the socket opens, and a socket lives as long
   * as it answers pings. So signing out, signing out everywhere, a new
   * password, a ban or a closed account ended the session everywhere but here:
   * whoever held the socket went on hearing that person's messages, and the
   * group chats they were in, for as long as they kept it open. Every
   * SESSION_CHECK_MS each session on this node is asked after, in one query,
   * and the sockets of the ended ones are closed with CLOSE_BAD_TICKET, which
   * the apps answer by asking for a new ticket, as after any ticket that no
   * longer holds — which an ended session cannot get.
   *
   * A database that cannot answer closes nothing; the next check asks again.
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

/** The session a ticket was given to; one issued before tickets named it holds the account alone. */
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
