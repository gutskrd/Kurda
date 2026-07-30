import { describe, expect, it } from 'vitest';
import { MemoryKV } from '../realtime/kv.js';
import { ChallengeService, type ChallengeMatchmaker, type FriendCheck } from './challenge-service.js';

function fakeMatchmaker(): ChallengeMatchmaker {
  let n = 0;
  return { createDirectMatch: async () => ({ roomId: `match:c${++n}` }) };
}
class FakeNotifier {
  events: Array<{ uid: string; type: string; roomId?: string }> = [];
  async notifyUser(uid: string, ev: Record<string, unknown>): Promise<void> {
    this.events.push({ uid, type: ev.type as string, roomId: ev.roomId as string | undefined });
  }
  to(uid: string, type: string): boolean {
    return this.events.some((e) => e.uid === uid && e.type === type);
  }
}
const friendsWhere = (status: string): FriendCheck => ({ statusBetween: async () => status });

function svc(friends: FriendCheck, notifier = new FakeNotifier()) {
  return { service: new ChallengeService(new MemoryKV(), fakeMatchmaker(), notifier, friends), notifier };
}

describe('ChallengeService (KUR-088)', () => {
  it('sends a pending challenge and pushes the invite', async () => {
    const { service, notifier } = svc(friendsWhere('friends'));
    expect(await service.challenge('a', 'b')).toEqual({ status: 'pending' });
    expect(notifier.to('b', 'challenge_invite')).toBe(true);
    expect(await service.status('b', 'a')).toEqual({ outgoing: false, incoming: true });
  });

  it('accept mints an unranked room and notifies both', async () => {
    const { service, notifier } = svc(friendsWhere('friends'));
    await service.challenge('a', 'b');
    const { roomId } = await service.accept('b', 'a');
    expect(roomId).toMatch(/^match:/);
    expect(notifier.to('a', 'challenge_accepted')).toBe(true);
    // the invite is consumed
    expect(await service.status('a', 'b')).toEqual({ outgoing: false, incoming: false });
  });

  it('mutual challenges merge into a single room', async () => {
    const { service } = svc(friendsWhere('friends'));
    await service.challenge('a', 'b'); // a → b pending
    const result = await service.challenge('b', 'a'); // b → a: should match, not queue
    expect(result).toEqual({ status: 'matched', roomId: expect.stringMatching(/^match:/) });
    // no invites left dangling in either direction
    expect(await service.status('a', 'b')).toEqual({ outgoing: false, incoming: false });
  });

  it('declines are polite and clear the invite (no reason)', async () => {
    const { service, notifier } = svc(friendsWhere('friends'));
    await service.challenge('a', 'b');
    await service.decline('b', 'a');
    const declined = notifier.events.find((e) => e.type === 'challenge_declined');
    expect(declined).toBeTruthy();
    expect(await service.status('a', 'b')).toEqual({ outgoing: false, incoming: false });
  });

  it('rejects challenging a non-friend and yourself', async () => {
    const { service } = svc(friendsWhere('none'));
    await expect(service.challenge('a', 'b')).rejects.toThrow(/only challenge friends/i);
    const self = svc(friendsWhere('friends')).service;
    await expect(self.challenge('a', 'a')).rejects.toThrow(/yourself/i);
  });

  it('accepting a missing/expired challenge is a 404', async () => {
    const { service } = svc(friendsWhere('friends'));
    await expect(service.accept('b', 'a')).rejects.toThrow(/no pending challenge/i);
  });
});
