import { describe, expect, it, vi } from 'vitest';
import { PushService } from './service.js';
import { StubPushProvider, type PushPlatform } from './provider.js';
import type { DeviceToken, DeviceTokenService } from './tokens-service.js';

function fakeTokens(devices: DeviceToken[]) {
  const prune = vi.fn(async (_tokens: readonly string[]) => _tokens.length);
  const svc = {
    forUser: async () => devices,
    prune,
  } as unknown as DeviceTokenService;
  return { svc, prune };
}

const dev = (token: string, platform: PushPlatform = 'android'): DeviceToken => ({ token, platform });

describe('PushService.deliver', () => {
  it('sends to every device and reports the count', async () => {
    const provider = new StubPushProvider();
    const { svc } = fakeTokens([dev('a1'), dev('i1', 'ios')]);
    const report = await new PushService(svc, provider).deliver('u1', { category: 'events', title: 'Hi', body: 'there' });
    expect(report).toEqual({ sent: 2, pruned: 0 });
    expect(provider.sent).toHaveLength(2);
    expect(provider.sent[0]).toMatchObject({ title: 'Hi', body: 'there' });
  });

  it('tells the phone the category beside the data, so a push naming no screen still opens somewhere', async () => {
    const provider = new StubPushProvider();
    const { svc } = fakeTokens([dev('a1')]);
    await new PushService(svc, provider).deliver('u1', {
      category: 'progress',
      title: 'A new badge',
      body: 'You earned Ders today.',
      data: { kind: 'badge', day: '2026-10-21' },
    });
    await new PushService(svc, provider).deliver('u1', { category: 'events', title: 't', body: 'b' });
    expect(provider.sent[0]!.data).toEqual({ kind: 'badge', day: '2026-10-21', category: 'progress' });
    expect(provider.sent[1]!.data).toEqual({ category: 'events' });
  });

  it('lets a streak reminder lapse within hours, and leaves other news to the service default', async () => {
    const provider = new StubPushProvider();
    const { svc } = fakeTokens([dev('a1')]);
    await new PushService(svc, provider).deliver('u1', { category: 'streak', title: 't', body: 'b' });
    await new PushService(svc, provider).deliver('u1', { category: 'progress', title: 't', body: 'b' });
    expect(provider.sent[0]!.ttlSeconds).toBe(2 * 60 * 60);
    expect(provider.sent[1]!.ttlSeconds).toBeUndefined();
  });

  it('prunes tokens the provider rejects', async () => {
    const provider = new StubPushProvider(new Set(['bad']));
    const { svc, prune } = fakeTokens([dev('good'), dev('bad')]);
    const report = await new PushService(svc, provider).deliver('u1', { category: 'games', title: 't', body: 'b' });
    expect(report.sent).toBe(1);
    expect(report.pruned).toBe(1);
    expect(prune).toHaveBeenCalledWith(['bad']);
  });

  it('suppresses delivery when the preference gate denies (KUR-095)', async () => {
    const provider = new StubPushProvider();
    const { svc } = fakeTokens([dev('a1')]);
    const gate = { allows: vi.fn(async () => false) };
    const report = await new PushService(svc, provider, gate).deliver('u1', {
      category: 'marketing',
      title: 't',
      body: 'b',
    });
    expect(report).toEqual({ sent: 0, pruned: 0, suppressed: true });
    expect(gate.allows).toHaveBeenCalledWith('u1', 'marketing');
    expect(provider.sent).toHaveLength(0);
  });

  it('is a no-op when the user has no devices', async () => {
    const provider = new StubPushProvider();
    const { svc, prune } = fakeTokens([]);
    expect(await new PushService(svc, provider).deliver('u1', { category: 'games', title: 't', body: 'b' })).toEqual({ sent: 0, pruned: 0 });
    expect(provider.sent).toHaveLength(0);
    expect(prune).not.toHaveBeenCalled();
  });
});
