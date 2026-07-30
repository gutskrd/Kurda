import { describe, expect, it } from 'vitest';
import { MemoryKV } from '../realtime/kv.js';
import type { MatchmakingService, MatchRecord } from './matchmaking.js';
import { RematchService } from './rematch-service.js';

const record = (roomId: string): MatchRecord => ({
  roomId,
  mode: '1v1',
  players: [
    { id: 'alice', username: 'alice', rating: 1000 },
    { id: 'bob', username: 'bob', rating: 1000 },
  ],
  teams: [['alice'], ['bob']],
  createdAt: 0,
});

// fake matchmaking: knows the finished game and mints a fresh room on demand
function fakeMatch(over: Partial<MatchmakingService> = {}): MatchmakingService {
  let mintCount = 0;
  return {
    matchRecord: async (roomId: string) => record(roomId),
    createDirectMatch: async () => ({ ...record('match:new'), roomId: `match:new:${++mintCount}` }),
    ...over,
  } as unknown as MatchmakingService;
}

function svc(match = fakeMatch()): RematchService {
  return new RematchService(new MemoryKV(), match);
}

describe('RematchService (KUR-059)', () => {
  it('is not ready until every player accepts', async () => {
    const rematch = svc();
    const first = await rematch.accept('match:1', 'alice');
    expect(first).toMatchObject({ ready: false, roomId: null, accepted: 1, needed: 2 });

    const status = await rematch.status('match:1', 'bob');
    expect(status).toMatchObject({ ready: false, accepted: 1, needed: 2 });
  });

  it('mints a new room once both accept and both then see it', async () => {
    const rematch = svc();
    await rematch.accept('match:2', 'alice');
    const done = await rematch.accept('match:2', 'bob');
    expect(done.ready).toBe(true);
    expect(done.roomId).toBeTruthy();

    // the waiting player learns the same new room via status
    const seen = await rematch.status('match:2', 'alice');
    expect(seen.roomId).toBe(done.roomId);
  });

  it('is idempotent: re-accepting does not mint a second room', async () => {
    let mints = 0;
    const match = fakeMatch({
      createDirectMatch: (async () => {
        mints += 1;
        return { ...record('match:new'), roomId: 'match:new' };
      }) as MatchmakingService['createDirectMatch'],
    });
    const rematch = svc(match);
    await rematch.accept('match:3', 'alice');
    await rematch.accept('match:3', 'bob');
    const again = await rematch.accept('match:3', 'alice');
    expect(mints).toBe(1);
    expect(again.roomId).toBe('match:new');
  });

  it('rejects a stranger who was not in the game', async () => {
    const rematch = svc();
    await expect(rematch.accept('match:4', 'eve')).rejects.toThrow(/not in that game/i);
  });

  it('404s when there is no finished game', async () => {
    const match = fakeMatch({ matchRecord: (async () => null) as MatchmakingService['matchRecord'] });
    const rematch = svc(match);
    await expect(rematch.accept('gone', 'alice')).rejects.toThrow(/no finished game/i);
  });
});
