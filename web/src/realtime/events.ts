/**
 * Realtime protocol types on the web side, mirroring the server gateway (api/src/realtime/gateway.ts). The transport
 * does not interpret feature payloads, so `RealtimeEvent` keeps an open shape.
 */

/** The server's close code for a connection taken over by a newer one. */
export const CLOSE_CONNECTED_ELSEWHERE = 4001;
/** Normal, intentional client close. */
export const CLOSE_NORMAL = 1000;

/** Connection lifecycle, observable by consumers. */
export type RealtimeState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Messages the client may send to the server. */
export type ClientMessage =
  | { type: 'join'; room: string }
  | { type: 'leave'; room: string }
  | { type: 'ping' };

/**
 * A room event payload. The envelope's `type` is always present; the rest is feature-defined, such as dm, dm_read,
 * dm_typing, challenge_invite, match_found and game-state events.
 */
export type RealtimeEvent = { type: string } & Record<string, unknown>;

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
  /** True when the client itself asked to close (disconnect or destroy). */
  intentional: boolean;
}
