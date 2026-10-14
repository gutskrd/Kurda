import { describe, expect, it } from 'vitest';
import {
  CLOSE_BAD_TICKET,
  CLOSE_CONNECTED_ELSEWHERE,
  RealtimeClient,
  backoffDelay,
  realtimeUrl,
  type RealtimeEvent,
  type WebSocketLike,
} from './RealtimeClient';

class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  closed: number | undefined;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code?: number): void {
    this.closed = code;
    this.readyState = 3;
  }
  /** the server's side */
  hello(resumeToken = 'tok', resumedRooms: string[] = []): void {
    this.readyState = 1;
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ type: 'hello', resumeToken, resumedRooms }) });
  }
  frame(f: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(f) });
  }
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup(opts: { tickets?: Array<string | null> } = {}) {
  FakeSocket.all = [];
  const timers: Array<{ fn: () => void; ms: number; done: boolean }> = [];
  let clock = 0;
  const tickets = opts.tickets ? [...opts.tickets] : null;
  let n = 0;
  const client = new RealtimeClient({
    baseUrl: 'https://api.example.test',
    fetchTicket: async () => (tickets ? (tickets.shift() ?? null) : `t${++n}`),
    WebSocketImpl: FakeSocket,
    random: () => 0,
    setTimer: (fn, ms) => {
      const t = { fn, ms, done: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { done: boolean }).done = true;
    },
    now: () => clock,
  });
  const pending = () => timers.filter((t) => !t.done);
  const fire = async () => {
    const next = pending()[0];
    if (!next) throw new Error('no timer pending');
    next.done = true;
    next.fn();
    await flush();
  };
  return {
    client,
    pending,
    fire,
    advance: (ms: number) => {
      clock += ms;
    },
    socket: () => FakeSocket.all.at(-1)!,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('realtime url and backoff', () => {
  it('turns the API origin into the websocket url, with the resume token when there is one', () => {
    expect(realtimeUrl('https://api.hevalo.app/', 'a b')).toBe('wss://api.hevalo.app/realtime?ticket=a%20b');
    expect(realtimeUrl('http://localhost:3000', 't', 'r/1')).toBe('ws://localhost:3000/realtime?ticket=t&resume=r%2F1');
  });

  it('doubles from the first delay up to the cap, adding at most a third at random', () => {
    expect(backoffDelay(1, 1000, 30_000, () => 0)).toBe(1000);
    expect(backoffDelay(3, 1000, 30_000, () => 0)).toBe(4000);
    expect(backoffDelay(9, 1000, 30_000, () => 0)).toBe(30_000);
    expect(backoffDelay(1, 1000, 30_000, () => 0.999)).toBeLessThanOrEqual(1333);
  });
});

describe('RealtimeClient', () => {
  it('opens one socket with a ticket and hands every event to every listener', async () => {
    const { client, socket } = setup();
    const seen: Array<[RealtimeEvent, string]> = [];
    const seenToo: string[] = [];
    client.subscribe((e, room) => seen.push([e, room]));
    client.subscribe((e) => seenToo.push(e.type));
    client.start();
    await flush();
    expect(FakeSocket.all).toHaveLength(1);
    expect(socket().url).toBe('wss://api.example.test/realtime?ticket=t1');
    socket().hello();
    expect(client.state).toBe('open');
    socket().frame({ type: 'event', room: 'user:me', event: { type: 'play_invite', invite: { id: 'i' } } });
    expect(seen).toEqual([[{ type: 'play_invite', invite: { id: 'i' } }, 'user:me']]);
    expect(seenToo).toEqual(['play_invite']);
  });

  it('ignores frames that are not JSON or have no event type, and survives a listener that throws', async () => {
    const { client, socket } = setup();
    const seen: string[] = [];
    client.subscribe(() => {
      throw new Error('a buggy screen');
    });
    client.subscribe((e) => seen.push(e.type));
    client.start();
    await flush();
    socket().hello();
    socket().onmessage?.({ data: 'not json' });
    socket().frame({ type: 'event', room: 'x', event: { nope: 1 } });
    socket().frame({ type: 'event', room: 'x', event: { type: 'dm' } });
    expect(seen).toEqual(['dm']);
  });

  it('reconnects after a drop with growing delays and the resume token, and resets after a stable connection', async () => {
    const { client, socket, pending, fire, advance } = setup();
    client.start();
    await flush();
    socket().hello('resume-1');
    socket().drop();
    expect(client.state).toBe('waiting');
    expect(pending()[0]!.ms).toBe(1000);
    await fire();
    expect(socket().url).toContain('resume=resume-1');
    socket().drop();
    expect(pending()[0]!.ms).toBe(2000);
    await fire();
    socket().hello('resume-2');
    advance(15_000); // open long enough to count as stable
    socket().drop();
    expect(pending()[0]!.ms).toBe(1000);
  });

  it('waits out the takeover cooldown after 4001, and forgets the resume token after a refused ticket', async () => {
    const { client, socket, pending, fire } = setup();
    client.start();
    await flush();
    socket().hello('r');
    socket().drop(CLOSE_CONNECTED_ELSEWHERE);
    expect(pending()[0]!.ms).toBe(30_000);
    await fire();
    socket().drop(CLOSE_BAD_TICKET);
    await fire();
    expect(socket().url).not.toContain('resume=');
  });

  it('retries when no ticket can be had (offline), without opening a socket', async () => {
    const { client, pending, fire } = setup({ tickets: [null, 'ok'] });
    client.start();
    await flush();
    expect(FakeSocket.all).toHaveLength(0);
    expect(pending()).toHaveLength(1);
    await fire();
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('joins watched rooms on open, counts watchers, and rejoins what a resume did not bring back', async () => {
    const { client, socket, fire } = setup();
    const leaveA = client.joinRoom('group:a');
    const leaveA2 = client.joinRoom('group:a');
    client.joinRoom('group:b');
    client.start();
    await flush();
    socket().hello('r', []);
    expect(socket().sent).toEqual([
      { type: 'join', room: 'group:a' },
      { type: 'join', room: 'group:b' },
    ]);
    socket().frame({ type: 'joined', room: 'group:a' });
    socket().frame({ type: 'joined', room: 'group:b' });
    leaveA();
    expect(socket().sent).toHaveLength(2); // someone still watches group:a
    leaveA2();
    expect(socket().sent.at(-1)).toEqual({ type: 'leave', room: 'group:a' });

    // a resume that brought group:b back needs no join; one nobody watches is left
    socket().drop();
    await fire();
    socket().hello('r2', ['group:b', 'group:gone']);
    expect(socket().sent).toEqual([{ type: 'leave', room: 'group:gone' }]);
  });

  it('asks again for a room it was not yet let into, a few times, and then leaves it be', async () => {
    const { client, socket, pending, fire } = setup();
    client.joinRoom('group:new');
    client.start();
    await flush();
    socket().hello();
    socket().sent = [];
    for (let i = 0; i < 3; i += 1) {
      socket().frame({ type: 'error', code: 'NOT_INVITED', room: 'group:new' });
      await fire();
    }
    expect(socket().sent).toEqual([
      { type: 'join', room: 'group:new' },
      { type: 'join', room: 'group:new' },
      { type: 'join', room: 'group:new' },
    ]);
    socket().frame({ type: 'error', code: 'NOT_INVITED', room: 'group:new' });
    expect(pending()).toHaveLength(0);
  });

  it('closes in the background, keeps the resume token, and comes back at once in front', async () => {
    const { client, socket, pending } = setup();
    client.start();
    await flush();
    socket().hello('keep');
    const first = socket();
    client.pause();
    expect(first.closed).toBe(1000);
    expect(client.state).toBe('paused');
    expect(pending()).toHaveLength(0); // nothing reconnects in the background
    client.resume();
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    expect(socket().url).toContain('resume=keep');
  });

  it('coming to the front skips a backoff that was waiting', async () => {
    const { client, socket, pending } = setup();
    client.start();
    await flush();
    socket().drop();
    // still waiting on the first retry
    expect(pending()).toHaveLength(1);
    client.resume();
    await flush();
    expect(pending()).toHaveLength(0);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('keeps the takeover cooldown when the app comes to the front during it (iOS inactive → active)', async () => {
    const { client, socket, pending, fire } = setup();
    client.start();
    await flush();
    socket().hello('r');
    socket().drop(CLOSE_CONNECTED_ELSEWHERE);
    client.resume();
    await flush();
    expect(client.state).toBe('waiting');
    expect(pending()).toHaveLength(1);
    expect(pending()[0]!.ms).toBe(30_000);
    expect(FakeSocket.all).toHaveLength(1);
    await fire();
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('back from the background inside a takeover cooldown, waits only what is left of it', async () => {
    const { client, socket, pending, fire, advance } = setup();
    client.start();
    await flush();
    socket().hello('r');
    socket().drop(CLOSE_CONNECTED_ELSEWHERE);
    advance(10_000);
    client.pause();
    expect(pending()).toHaveLength(0);
    client.resume();
    await flush();
    expect(client.state).toBe('waiting');
    expect(pending()).toHaveLength(1);
    expect(pending()[0]!.ms).toBe(20_000);
    await fire();
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('back from the background after a takeover cooldown has passed, connects at once', async () => {
    const { client, socket, pending, advance } = setup();
    client.start();
    await flush();
    socket().hello('r');
    socket().drop(CLOSE_CONNECTED_ELSEWHERE);
    client.pause();
    advance(60_000);
    client.resume();
    await flush();
    expect(pending()).toHaveLength(0);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('tells open listeners each time a connection is ready, and stops for good', async () => {
    const { client, socket, fire, pending } = setup();
    let opens = 0;
    client.onOpen(() => {
      opens += 1;
    });
    client.start();
    await flush();
    socket().hello();
    socket().drop();
    await fire();
    socket().hello();
    expect(opens).toBe(2);
    client.stop();
    expect(socket().closed).toBe(1000);
    expect(client.state).toBe('stopped');
    expect(pending()).toHaveLength(0);
  });

  it('drops a ticket that arrives after the client was stopped', async () => {
    let release: (t: string) => void = () => undefined;
    FakeSocket.all = [];
    const client = new RealtimeClient({
      baseUrl: 'https://x',
      fetchTicket: () => new Promise<string>((r) => (release = r)),
      WebSocketImpl: FakeSocket,
    });
    client.start();
    client.stop();
    release('late');
    await flush();
    expect(FakeSocket.all).toHaveLength(0);
  });
});
