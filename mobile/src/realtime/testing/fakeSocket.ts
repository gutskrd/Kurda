/**
 * A WebSocket for tests of anything on the shared connection: install it as
 * `globalThis.WebSocket`, render under RealtimeProvider, then say `hello`
 * (the connection is ready, onOpen fires) and `push` events into a room as
 * the gateway would.
 */
export class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
  hello(resumedRooms: string[] = []): void {
    this.readyState = 1;
    this.onmessage?.({ data: JSON.stringify({ type: 'hello', resumeToken: 'r', resumedRooms }) });
  }
  push(room: string, event: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify({ type: 'event', room, event }) });
  }
}
