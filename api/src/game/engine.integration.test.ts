/** Full game-session lifecycle (KUR-051) over real sockets (CI job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import WebSocket from 'ws';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { selectQuestions } from './question-bank.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

describe('question bank (unit)', () => {
  it('selects deterministically per seed, without leaking bank internals', () => {
    const a = selectQuestions('match:seed-1', 5);
    const b = selectQuestions('match:seed-1', 5);
    const c = selectQuestions('match:seed-2', 5);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a.map((q) => q.id)).not.toEqual(c.map((q) => q.id));
    expect(a).toHaveLength(5);
  });
});

describe.skipIf(!DATABASE_URL)('game session engine (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    ...(REDIS_URL ? { REDIS_URL } : {}),
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
  });
  let app: FastifyInstance;
  let wsUrl: string;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const sockets: WebSocket[] = [];

  interface Player {
    id: string;
    token: string;
    ws: WebSocket;
    events: WsMessage[];
  }

  function gameEvents(player: Player, type: string, match?: (e: WsMessage) => boolean): WsMessage[] {
    return player.events
      .filter((m) => m.type === 'event' && (m.event as WsMessage).type === type)
      .map((m) => m.event as WsMessage)
      .filter((e) => (match ? match(e) : true));
  }

  /** Predicate-based so replays/next-phase events can never be missed. */
  function waitForGameEvent(
    player: Player,
    type: string,
    match?: (e: WsMessage) => boolean,
    ms = 10_000,
  ): Promise<WsMessage> {
    const existing = gameEvents(player, type, match);
    if (existing.length > 0) return Promise.resolve(existing[existing.length - 1] as WsMessage);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), ms);
      player.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as WsMessage;
        if (msg.type === 'event' && (msg.event as WsMessage).type === type) {
          const event = msg.event as WsMessage;
          if (!match || match(event)) {
            clearTimeout(timer);
            resolve(event);
          }
        }
      });
    });
  }

  async function makePlayer(name: string): Promise<Player> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: `10.22.0.${Math.floor(Math.random() * 200) + 1}`,
    });
    const token = res.json().tokens.accessToken as string;
    const ticket = await app.inject({
      method: 'POST',
      url: '/realtime/ticket',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.22.1.1',
    });
    const ws = new WebSocket(`${wsUrl}/realtime?ticket=${ticket.json().ticket}`);
    sockets.push(ws);
    const events: WsMessage[] = [];
    ws.on('message', (raw) => events.push(JSON.parse(raw.toString()) as WsMessage));
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no hello')), 5_000);
      ws.on('message', (raw) => {
        if ((JSON.parse(raw.toString()) as WsMessage).type === 'hello') {
          clearTimeout(t);
          resolve();
        }
      });
    });
    return { id: res.json().user.id, token, ws, events };
  }

  function waitForRaw(player: Player, type: string, ms = 5_000): Promise<WsMessage> {
    const existing = player.events.find((m) => m.type === type);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), ms);
      player.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as WsMessage;
        if (msg.type === type) {
          clearTimeout(timer);
          resolve(msg);
        }
      });
    });
  }

  async function startMatch(a: Player, b: Player): Promise<string> {
    await app.inject({
      method: 'POST',
      url: '/matchmaking/queue',
      headers: { authorization: `Bearer ${a.token}` },
      remoteAddress: '10.22.2.1',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/matchmaking/queue',
      headers: { authorization: `Bearer ${b.token}` },
      remoteAddress: '10.22.2.2',
    });
    const roomId = res.json().roomId as string;
    // the initial 'lobby' broadcast may precede the joins — clients (and
    // this test) recover state through the snapshot endpoint after joining
    for (const p of [a, b]) {
      p.ws.send(JSON.stringify({ type: 'join', room: roomId }));
      await waitForRaw(p, 'joined');
    }
    return roomId;
  }

  beforeAll(async () => {
    app = buildApp(config, {
      engine: {
        lobbyMs: 1_500,
        countdownMs: 150,
        questionMs: 1_200,
        revealMs: 120,
        questionsPerGame: 3,
      },
      // isolate this file's matchmaking queue from other integration files
      matchmaking: { queueKeyPrefix: `kurda:mm:it:engine:${suffix}` },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    wsUrl = `ws://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    // finishing a game now writes xp_ledger rows (KUR-059); the append-only
    // trigger blocks the user cascade unless we admin-delete the ledger too
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('runs a full game: lobby → countdown → questions → reveals → results', async () => {
    const a = await makePlayer('ga');
    const b = await makePlayer('gb');
    const roomId = await startMatch(a, b);

    // joined after the lobby broadcast — the snapshot carries the state
    const lobbySnapshot = await app.inject({
      method: 'GET',
      url: `/games/${roomId}/state`,
      headers: { authorization: `Bearer ${a.token}` },
      remoteAddress: '10.22.2.9',
    });
    expect(lobbySnapshot.json().phase).toBe('lobby');
    expect(lobbySnapshot.json().questionCount).toBe(3);

    // both ready → countdown starts before the lobby timer
    a.ws.send(JSON.stringify({ type: 'ready', room: roomId }));
    b.ws.send(JSON.stringify({ type: 'ready', room: roomId }));
    await waitForGameEvent(a, 'countdown', undefined, 3_000);

    // play all questions: A answers option 0 instantly, B answers option 1
    for (let index = 0; index < 3; index++) {
      const question = await waitForGameEvent(a, 'question', (e) => e.index === index);
      expect(question.correctIndex).toBeUndefined(); // never leaked pre-reveal
      expect((question.options as string[]).length).toBe(4);
      a.ws.send(JSON.stringify({ type: 'answer', room: roomId, index, choice: 0 }));
      b.ws.send(JSON.stringify({ type: 'answer', room: roomId, index, choice: 1 }));
      const reveal = await waitForGameEvent(b, 'reveal', (e) => e.index === index);
      expect(reveal.correctIndex).toBeGreaterThanOrEqual(0);
      // a running scoreboard is pushed after every reveal (#53)
      const board = await waitForGameEvent(a, 'scoreboard', (e) => e.index === index);
      const lines = board.scores as Array<{ userId: string; points: number; rank: number }>;
      expect(lines).toHaveLength(2);
      expect(lines[0]!.rank).toBe(1);
    }

    const results = await waitForGameEvent(a, 'results');
    expect(results.provisional).toBe(false); // final authoritative scores (#53)
    const scores = results.scores as Array<{ userId: string; points: number; rank: number; correct: number }>;
    expect(scores.map((s) => s.userId).sort()).toEqual([a.id, b.id].sort());
    // points are server-computed and ranked; #1 has the most points
    expect(scores[0]!.rank).toBe(1);
    expect(scores.every((s) => typeof s.points === 'number')).toBe(true);
  }, 20_000);

  it('a mid-question disconnect auto-wrongs that question (KUR-057)', async () => {
    const a = await makePlayer('da');
    const b = await makePlayer('db');
    const roomId = await startMatch(a, b);
    a.ws.send(JSON.stringify({ type: 'ready', room: roomId }));
    b.ws.send(JSON.stringify({ type: 'ready', room: roomId }));

    // during the first question, A drops its connection
    await waitForGameEvent(b, 'question', (e) => e.index === 0, 8_000);
    a.ws.close();

    // B is told A left that question; A never scores for it
    const left = await waitForGameEvent(b, 'player_left', (e) => e.index === 0, 8_000);
    expect(left.userId).toBe(a.id);
  }, 20_000);

  it('a silent opponent never hangs the game — it completes with timeouts', async () => {
    const active = await makePlayer('act');
    const ghost = await makePlayer('gho'); // joins, then never sends anything
    const roomId = await startMatch(active, ghost);

    active.ws.send(JSON.stringify({ type: 'ready', room: roomId }));
    // ghost never readies → lobby timeout (1.5s) starts the game anyway

    for (let index = 0; index < 3; index++) {
      await waitForGameEvent(active, 'question', (e) => e.index === index, 8_000);
      active.ws.send(JSON.stringify({ type: 'answer', room: roomId, index, choice: 2 }));
      await waitForGameEvent(active, 'reveal', (e) => e.index === index, 8_000);
    }
    const results = await waitForGameEvent(active, 'results', undefined, 8_000);
    const ghostScore = (results.scores as Array<{ userId: string; correct: number }>).find(
      (s) => s.userId === ghost.id,
    );
    expect(ghostScore?.correct).toBe(0);
  }, 20_000);

  it('snapshot endpoint supports reconnects and hides the open answer', async () => {
    const a = await makePlayer('sa');
    const b = await makePlayer('sb');
    const roomId = await startMatch(a, b);
    a.ws.send(JSON.stringify({ type: 'ready', room: roomId }));
    b.ws.send(JSON.stringify({ type: 'ready', room: roomId }));
    await waitForGameEvent(a, 'question');

    const snapshot = await app.inject({
      method: 'GET',
      url: `/games/${roomId}/state`,
      headers: { authorization: `Bearer ${a.token}` },
      remoteAddress: '10.22.3.1',
    });
    expect(snapshot.statusCode).toBe(200);
    const body = snapshot.json();
    expect(body.phase).toBe('question');
    expect(body.currentQuestion.options).toHaveLength(4);
    expect(JSON.stringify(body)).not.toContain('correctIndex');

    // an outsider cannot read game state
    const outsider = await makePlayer('out');
    const denied = await app.inject({
      method: 'GET',
      url: `/games/${roomId}/state`,
      headers: { authorization: `Bearer ${outsider.token}` },
      remoteAddress: '10.22.3.2',
    });
    expect(denied.statusCode).toBe(404);
  });

  it('late answers are rejected server-side with a specific code (KUR-052)', async () => {
    const a = await makePlayer('la');
    const b = await makePlayer('lb');
    const roomId = await startMatch(a, b);
    a.ws.send(JSON.stringify({ type: 'ready', room: roomId }));
    b.ws.send(JSON.stringify({ type: 'ready', room: roomId }));

    // wait for the first reveal (question timed out for both, well past the
    // shared grace), then answer question 0 late — it must be rejected, not
    // silently dropped, and never appear in results
    await waitForGameEvent(a, 'reveal', (e) => e.index === 0, 8_000);
    a.ws.send(JSON.stringify({ type: 'answer', room: roomId, index: 0, choice: 0 }));

    const rejected = await waitForGameEvent(a, 'answer_rejected', (e) => e.index === 0, 5_000);
    expect(rejected.code).toBe('ANSWER_TOO_LATE');

    const results = await waitForGameEvent(a, 'results', undefined, 12_000);
    const mine = (results.scores as Array<{ userId: string; correct: number }>).find(
      (s) => s.userId === a.id,
    );
    expect(mine?.correct).toBe(0);
  }, 20_000);
});
