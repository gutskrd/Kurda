import { describe, expect, it } from 'vitest';
import { MemoryKV } from '../realtime/kv.js';
import type pg from 'pg';
import type { MatchmakingService } from './matchmaking.js';
import { HOST_GRACE_MS, MAX_PLAYERS, PrivateRoomService } from './private-room-service.js';

// minimal fakes: pool returns a username; matchmaking returns a room id
const fakePool = {
  query: async () => ({ rowCount: 1, rows: [{ username: 'user' }] }),
} as unknown as pg.Pool;
const fakeMatch = {
  createDirectMatch: async () => ({ roomId: 'match:xyz' }),
} as unknown as MatchmakingService;

function svc(): PrivateRoomService {
  return new PrivateRoomService(new MemoryKV(), fakePool, fakeMatch);
}

describe('PrivateRoomService — host grace (KUR-056)', () => {
  it('dissolves a pre-start room after the host is gone past the grace', async () => {
    const rooms = svc();
    const t0 = 1_000_000;
    const room = await rooms.create('host', {}, t0);

    // within grace: still there
    expect(await rooms.get(room.code, t0 + HOST_GRACE_MS - 1)).not.toBeNull();
    // past grace, host never touched → dissolved
    expect(await rooms.get(room.code, t0 + HOST_GRACE_MS + 1)).toBeNull();
  });

  it('a host heartbeat resets the grace', async () => {
    const rooms = svc();
    const t0 = 2_000_000;
    const room = await rooms.create('host', {}, t0);
    await rooms.touch(room.code, 'host', t0 + HOST_GRACE_MS - 10);
    // grace is measured from the touch, so this is still alive
    expect(await rooms.get(room.code, t0 + HOST_GRACE_MS + 10)).not.toBeNull();
  });

  it('a started room survives host absence (grace only applies pre-start)', async () => {
    const rooms = svc();
    const t0 = 3_000_000;
    const room = await rooms.create('host', {}, t0);
    await rooms.join(room.code, 'guest', t0);
    await rooms.start(room.code, 'host', t0);
    expect(await rooms.get(room.code, t0 + HOST_GRACE_MS * 10)).not.toBeNull();
  });

  it('caps the room at MAX_PLAYERS', async () => {
    const rooms = svc();
    const t0 = 4_000_000;
    const room = await rooms.create('host', {}, t0);
    for (let i = 1; i < MAX_PLAYERS; i++) await rooms.join(room.code, `p${i}`, t0);
    await expect(rooms.join(room.code, 'one-too-many', t0)).rejects.toThrow(/full/i);
  });
});
