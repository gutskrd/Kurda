import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RealtimeClient,
  type RealtimeClientOptions,
  type RealtimeDiagnostic,
  type WebSocketLike,
} from './RealtimeClient';

/** A controllable WebSocket stand-in — tests drive open/message/close manually. */
class MockWebSocket implements WebSocketLike {
  static instances: MockWebSocket[] = [];
  readyState = 0;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  sent: string[] = [];
  closedWith?: number;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number): void {
    this.closedWith = code;
    this.readyState = 3;
    // real sockets fire onclose asynchronously; tests trigger it explicitly
  }
  triggerOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  triggerMessage(data: unknown): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
  triggerClose(code?: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  triggerError(): void {
    this.onerror?.();
  }

  static last(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
  }
}

/** Flush chained microtasks (awaited ticket fetch, etc.). */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

interface Harness {
  client: RealtimeClient;
  tickets: string[];
  ticketCalls: () => number;
  diags: RealtimeDiagnostic[];
  failTicketOnce: () => void;
}

function makeClient(overrides: Partial<RealtimeClientOptions> = {}): Harness {
  let n = 0;
  let fail = false;
  const tickets: string[] = [];
  let calls = 0;
  const diags: RealtimeDiagnostic[] = [];
  const client = new RealtimeClient({
    url: 'https://api.example.com',
    WebSocketImpl: MockWebSocket as unknown as { new (url: string): WebSocketLike },
    random: () => 0, // deterministic: jitter picks the 50% floor
    onDiagnostic: (d) => diags.push(d),
    fetchTicket: async () => {
      calls++;
      if (fail) {
        fail = false;
        return { ok: false };
      }
      const ticket = `t${n++}`;
      tickets.push(ticket);
      return { ok: true, ticket };
    },
    ...overrides,
  });
  return {
    client,
    tickets,
    ticketCalls: () => calls,
    diags,
    failTicketOnce: () => {
      fail = true;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RealtimeClient — connect & auth', () => {
  it('starts idle', () => {
    const { client } = makeClient();
    expect(client.state).toBe('idle');
    client.destroy();
  });

  it('connect() requests a ticket and opens a wss socket with the encoded ticket', async () => {
    const h = makeClient();
    h.client.connect();
    expect(h.client.state).toBe('connecting');
    await flush();
    expect(h.ticketCalls()).toBe(1);
    expect(MockWebSocket.instances).toHaveLength(1);
    const url = MockWebSocket.last().url;
    expect(url).toBe('wss://api.example.com/realtime?ticket=t0');
    h.client.destroy();
  });

  it('converts http→ws (not https→wss) based on the base URL', async () => {
    const h = makeClient({ url: 'http://localhost:3000' });
    h.client.connect();
    await flush();
    expect(MockWebSocket.last().url.startsWith('ws://localhost:3000/realtime?ticket=')).toBe(true);
    h.client.destroy();
  });

  it('never places a JWT/bearer token in the WebSocket URL', async () => {
    const h = makeClient();
    h.client.connect();
    await flush();
    const url = MockWebSocket.last().url;
    expect(url.toLowerCase()).not.toContain('bearer');
    expect(url).not.toContain('authorization');
    expect(url).not.toContain('eyJ'); // JWT prefix
    h.client.destroy();
  });

  it('transitions to open and processes hello (resumeToken stays private)', async () => {
    const h = makeClient();
    const hellos: Array<{ resumedRooms: string[] }> = [];
    h.client.on('hello', (info) => hellos.push(info));
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    expect(h.client.state).toBe('open');
    MockWebSocket.last().triggerMessage({ type: 'hello', resumeToken: 'secret-resume', resumedRooms: ['game:1'] });
    expect(hellos).toEqual([{ resumedRooms: ['game:1'] }]);
    expect(h.client.resumedRooms).toEqual(['game:1']);
    // resume token is not exposed anywhere public
    expect(JSON.stringify(h.client)).not.toContain('secret-resume');
    h.client.destroy();
  });

  it('duplicate connect() calls do not create duplicate sockets', async () => {
    const h = makeClient();
    h.client.connect();
    h.client.connect();
    await flush();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(h.ticketCalls()).toBe(1);
    h.client.destroy();
  });
});

describe('RealtimeClient — reconnect', () => {
  async function connectOpenHello(h: Harness): Promise<void> {
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    MockWebSocket.last().triggerMessage({ type: 'hello', resumeToken: 'r-abc', resumedRooms: [] });
  }

  it('unexpected close reconnects with a fresh ticket and the in-memory resume token', async () => {
    const h = await Promise.resolve(makeClient()).then(async (x) => {
      await connectOpenHello(x);
      return x;
    });
    expect(h.client.state).toBe('open');
    MockWebSocket.last().triggerClose(1006); // abnormal
    expect(h.client.state).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.ticketCalls()).toBe(2);
    expect(MockWebSocket.instances).toHaveLength(2);
    const url = MockWebSocket.last().url;
    expect(url).toContain('ticket=t1'); // a NEW ticket
    expect(url).not.toContain('ticket=t0'); // old ticket never reused
    expect(url).toContain('resume=r-abc');
    h.client.destroy();
  });

  it('intentional disconnect() does not reconnect', async () => {
    const h = makeClient();
    await (async () => {
      h.client.connect();
      await flush();
      MockWebSocket.last().triggerOpen();
    })();
    h.client.disconnect();
    MockWebSocket.last().triggerClose(1000);
    expect(h.client.state).toBe('closed');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(h.ticketCalls()).toBe(1);
    h.client.destroy();
  });

  it('close 4003 (bad ticket) reconnects with a brand-new ticket', async () => {
    const h = makeClient();
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    MockWebSocket.last().triggerClose(4003);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.ticketCalls()).toBe(2);
    expect(MockWebSocket.last().url).toContain('ticket=t1');
    h.client.destroy();
  });

  it('close 4001 (connected elsewhere) backs off with a long cooldown, no storm', async () => {
    const h = makeClient({ takeoverCooldownMs: 30_000 });
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    MockWebSocket.last().triggerClose(4001);
    const scheduled = h.diags.filter((d) => d.category === 'reconnect-scheduled');
    expect(scheduled).toHaveLength(1);
    expect((scheduled[0] as { delayMs: number }).delayMs).toBeGreaterThanOrEqual(30_000);
    // it does NOT reconnect within a short window
    await vi.advanceTimersByTimeAsync(5_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    h.client.destroy();
  });

  it('uses exponential backoff across repeated failures', async () => {
    const h = makeClient();
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    // three quick drops before any stable period → 500, 1000, 2000 (random=0 → 50%)
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      MockWebSocket.last().triggerClose(1006);
      const last = h.diags.filter((d) => d.category === 'reconnect-scheduled').at(-1) as { delayMs: number };
      delays.push(last.delayMs);
      await vi.advanceTimersByTimeAsync(last.delayMs);
      // new socket exists but never opens/stabilizes
    }
    expect(delays).toEqual([500, 1000, 2000]);
    h.client.destroy();
  });

  it('jitter keeps the delay within [50%, 100%] of the base', async () => {
    const h = makeClient({ random: () => 0.999 });
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    MockWebSocket.last().triggerClose(1006);
    const d = (h.diags.find((x) => x.category === 'reconnect-scheduled') as { delayMs: number }).delayMs;
    expect(d).toBeGreaterThanOrEqual(500);
    expect(d).toBeLessThanOrEqual(1000);
    h.client.destroy();
  });

  it('resets backoff after a stable connection', async () => {
    const h = makeClient({ stableAfterMs: 10_000 });
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    // first drop → attempt 0 → 500
    MockWebSocket.last().triggerClose(1006);
    await vi.advanceTimersByTimeAsync(500);
    MockWebSocket.last().triggerOpen(); // reconnected
    // stay open long enough to be "stable" → backoff resets
    await vi.advanceTimersByTimeAsync(10_000);
    MockWebSocket.last().triggerClose(1006);
    const delays = h.diags.filter((d) => d.category === 'reconnect-scheduled') as Array<{ delayMs: number }>;
    expect(delays.at(-1)!.delayMs).toBe(500); // back to attempt 0, not 1000
    h.client.destroy();
  });
});

describe('RealtimeClient — message handling', () => {
  async function open(h: Harness): Promise<MockWebSocket> {
    h.client.connect();
    await flush();
    const ws = MockWebSocket.last();
    ws.triggerOpen();
    return ws;
  }

  it('emits valid event envelopes to subscribers', async () => {
    const h = makeClient();
    const events: Array<{ room: string; event: { type: string } }> = [];
    h.client.on('event', (e) => events.push(e));
    const ws = await open(h);
    ws.triggerMessage({ type: 'event', room: 'user:1', event: { type: 'dm', from: 'x' } });
    expect(events).toEqual([{ room: 'user:1', event: { type: 'dm', from: 'x' } }]);
    h.client.destroy();
  });

  it('transports unknown event types unchanged (no feature logic)', async () => {
    const h = makeClient();
    const events: Array<{ event: { type: string } }> = [];
    h.client.on('event', (e) => events.push(e));
    const ws = await open(h);
    ws.triggerMessage({ type: 'event', room: 'r', event: { type: 'totally_new_thing', foo: 1 } });
    expect(events[0]!.event).toEqual({ type: 'totally_new_thing', foo: 1 });
    h.client.destroy();
  });

  it('malformed JSON does not crash and surfaces a protocol error', async () => {
    const h = makeClient();
    const errors: Array<{ code: string }> = [];
    h.client.on('error', (e) => errors.push(e));
    const ws = await open(h);
    expect(() => ws.triggerMessage('{ not json')).not.toThrow();
    expect(errors).toEqual([{ code: 'BAD_MESSAGE' }]);
    h.client.destroy();
  });

  it('unknown top-level message types are ignored safely', async () => {
    const h = makeClient();
    const events: unknown[] = [];
    const errors: unknown[] = [];
    h.client.on('event', (e) => events.push(e));
    h.client.on('error', (e) => errors.push(e));
    const ws = await open(h);
    expect(() => ws.triggerMessage({ type: 'some_future_control_frame', x: 1 })).not.toThrow();
    ws.triggerMessage({ type: 'pong', at: 1 });
    ws.triggerMessage({ type: 'joined', room: 'r' });
    expect(events).toHaveLength(0);
    expect(errors).toHaveLength(0);
    h.client.destroy();
  });

  it('server error frames become error events', async () => {
    const h = makeClient();
    const errors: Array<{ code: string; room?: string }> = [];
    h.client.on('error', (e) => errors.push(e));
    const ws = await open(h);
    ws.triggerMessage({ type: 'error', code: 'NOT_INVITED', room: 'game:9' });
    expect(errors).toEqual([{ code: 'NOT_INVITED', room: 'game:9' }]);
    h.client.destroy();
  });
});

describe('RealtimeClient — subscriptions', () => {
  it('unsubscribe removes the handler; multiple listeners both fire', async () => {
    const h = makeClient();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = h.client.on('event', (e) => a.push(e));
    h.client.on('event', (e) => b.push(e));
    h.client.connect();
    await flush();
    const ws = MockWebSocket.last();
    ws.triggerOpen();
    ws.triggerMessage({ type: 'event', room: 'r', event: { type: 'x' } });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    offA();
    ws.triggerMessage({ type: 'event', room: 'r', event: { type: 'x' } });
    expect(a).toHaveLength(1); // unsubscribed
    expect(b).toHaveLength(2);
    h.client.destroy();
  });

  it('a throwing handler does not break other handlers or the client', async () => {
    const h = makeClient();
    const good: unknown[] = [];
    h.client.on('event', () => {
      throw new Error('boom');
    });
    h.client.on('event', (e) => good.push(e));
    h.client.connect();
    await flush();
    const ws = MockWebSocket.last();
    ws.triggerOpen();
    expect(() => ws.triggerMessage({ type: 'event', room: 'r', event: { type: 'x' } })).not.toThrow();
    expect(good).toHaveLength(1);
    h.client.destroy();
  });
});

describe('RealtimeClient — teardown', () => {
  it('destroy removes listeners and prevents future emits', async () => {
    const h = makeClient();
    const events: unknown[] = [];
    h.client.on('event', (e) => events.push(e));
    h.client.connect();
    await flush();
    const ws = MockWebSocket.last();
    ws.triggerOpen();
    h.client.destroy();
    // an event arriving on the (now abandoned) socket must not reach handlers
    ws.triggerMessage({ type: 'event', room: 'r', event: { type: 'x' } });
    expect(events).toHaveLength(0);
    h.client.destroy(); // idempotent
  });

  it('destroy prevents future reconnects', async () => {
    const h = makeClient();
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    h.client.destroy();
    MockWebSocket.last().triggerClose(1006);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    h.client.connect(); // no-op after destroy
    await flush();
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('removes window/document listeners on destroy', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');
    const h = makeClient();
    h.client.destroy();
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(docRemove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('RealtimeClient — network & visibility', () => {
  it('does not reconnect while offline, then reconnects when back online', async () => {
    const h = makeClient();
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();

    window.dispatchEvent(new Event('offline'));
    MockWebSocket.last().triggerClose(1006); // drop while offline
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(1); // no storm while offline

    window.dispatchEvent(new Event('online'));
    await flush();
    expect(MockWebSocket.instances).toHaveLength(2); // reconnected on return
    h.client.destroy();
  });

  it('becoming visible reconnects a dropped connection promptly', async () => {
    const h = makeClient();
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    MockWebSocket.last().triggerClose(1006);
    expect(h.client.state).toBe('reconnecting');
    // become visible before the backoff timer fires → reconnect now
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(MockWebSocket.instances).toHaveLength(2);
    h.client.destroy();
  });
});

describe('RealtimeClient — no credential leakage', () => {
  it('never logs the ticket or resume token', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
    ];
    const h = makeClient();
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    MockWebSocket.last().triggerMessage({ type: 'hello', resumeToken: 'r-secret', resumedRooms: [] });
    MockWebSocket.last().triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const allArgs = spies.flatMap((s) => s.mock.calls.flat()).map(String).join(' ');
    expect(allArgs).not.toContain('t0');
    expect(allArgs).not.toContain('r-secret');
    // diagnostics carry only safe metadata
    const diagJson = JSON.stringify(h.diags);
    expect(diagJson).not.toContain('t0');
    expect(diagJson).not.toContain('r-secret');
    h.client.destroy();
  });
});

describe('RealtimeClient — rooms (join/leave)', () => {
  async function openClient() {
    const h = makeClient();
    h.client.connect();
    await flush();
    MockWebSocket.last().triggerOpen();
    return h;
  }

  it('sends a join frame when the socket is open', async () => {
    const h = await openClient();
    h.client.join('group:g1');
    expect(MockWebSocket.last().sent).toContain(JSON.stringify({ type: 'join', room: 'group:g1' }));
    h.client.destroy();
  });

  it('queues a join requested before open and (re)joins every desired room on open', async () => {
    const h = makeClient();
    h.client.join('group:g1'); // before connect → nothing sent yet
    h.client.connect();
    await flush();
    const ws = MockWebSocket.last();
    expect(ws.sent).toHaveLength(0);
    ws.triggerOpen();
    expect(ws.sent).toContain(JSON.stringify({ type: 'join', room: 'group:g1' }));
    h.client.destroy();
  });

  it('re-joins desired rooms on a reconnect (new socket)', async () => {
    const h = await openClient();
    h.client.join('group:g1');
    // drop the socket → client reconnects
    MockWebSocket.last().triggerClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    const ws2 = MockWebSocket.last();
    ws2.triggerOpen();
    expect(ws2.sent).toContain(JSON.stringify({ type: 'join', room: 'group:g1' }));
    h.client.destroy();
  });

  it('leave() sends a leave frame and stops re-joining after reconnect', async () => {
    const h = await openClient();
    h.client.join('group:g1');
    h.client.leave('group:g1');
    expect(MockWebSocket.last().sent).toContain(JSON.stringify({ type: 'leave', room: 'group:g1' }));
    MockWebSocket.last().triggerClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    const ws2 = MockWebSocket.last();
    ws2.triggerOpen();
    expect(ws2.sent).not.toContain(JSON.stringify({ type: 'join', room: 'group:g1' }));
    h.client.destroy();
  });
});
