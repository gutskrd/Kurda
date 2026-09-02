/**
 * Realtime protocol types (web side), mirroring the server gateway
 * (api/src/realtime/gateway.ts). Phase B transports events; it does NOT
 * interpret feature payloads, so `RealtimeEvent` keeps an open shape and
 * feature-specific validation lives in later phases.
 */

/** Application-defined close codes the server uses (4xxx). */
export const CLOSE_CONNECTED_ELSEWHERE = 4001;
export const CLOSE_BAD_TICKET = 4003;
/** Normal, intentional client close. */
export const CLOSE_NORMAL = 1000;

/** Connection lifecycle, observable by consumers. */
export type RealtimeState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Messages the client may send to the server (Phase B uses none of these yet). */
export type ClientMessage =
  | { type: 'join'; room: string }
  | { type: 'leave'; room: string }
  | { type: 'ping' };

/**
 * A room event payload. The envelope's `type` is always present; the rest is
 * feature-defined and intentionally left open in Phase B. Known types from the
 * current server catalog (for reference only — not enforced here):
 * dm, dm_delivered, dm_read, dm_typing, challenge_invite, challenge_accepted,
 * challenge_declined, challenge_cancelled, match_found, match_timeout,
 * answer_rejected, and game-state events.
 */
export type RealtimeEvent = { type: string } & Record<string, unknown>;

/** Server → client: sent once on connect; carries the (private) resume token. */
export interface HelloMessage {
  type: 'hello';
  resumeToken?: string;
  resumedRooms?: unknown;
}
/** Server → client: the main event envelope. */
export interface EventMessage {
  type: 'event';
  room: string;
  event: RealtimeEvent;
}
export interface JoinedMessage {
  type: 'joined';
  room: string;
}
export interface LeftMessage {
  type: 'left';
  room: string;
}
export interface ErrorMessage {
  type: 'error';
  code?: string;
  room?: string;
}
export interface PongMessage {
  type: 'pong';
  at?: number;
}

export type ServerMessage =
  | HelloMessage
  | EventMessage
  | JoinedMessage
  | LeftMessage
  | ErrorMessage
  | PongMessage;

/** What consumers receive on the `hello` event — never the resume token. */
export interface HelloInfo {
  resumedRooms: string[];
}

/** What consumers receive on the `event` channel. */
export interface RealtimeEventEnvelope {
  room: string;
  event: RealtimeEvent;
}

/** A protocol-level error surfaced to consumers (never contains credentials). */
export interface RealtimeProtocolError {
  code: string;
  room?: string;
}

/** Close info surfaced to consumers. */
export interface RealtimeCloseInfo {
  code: number | undefined;
  /** true when the client itself asked to close (disconnect/destroy). */
  intentional: boolean;
}
