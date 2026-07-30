import { describe, expect, it } from 'vitest';
import { batchMessages, BATCH_LIMITS } from './batching.js';
import type { PushMessage, PushPlatform } from './provider.js';

function msg(platform: PushPlatform, token: string): PushMessage {
  return { token, platform, title: 't', body: 'b' };
}

describe('batchMessages', () => {
  it('groups by platform, android batches before ios', () => {
    const batches = batchMessages([
      msg('ios', 'i1'),
      msg('android', 'a1'),
      msg('ios', 'i2'),
      msg('android', 'a2'),
    ]);
    expect(batches).toHaveLength(2);
    expect(batches[0]!.every((m) => m.platform === 'android')).toBe(true);
    expect(batches[0]!.map((m) => m.token)).toEqual(['a1', 'a2']);
    expect(batches[1]!.map((m) => m.token)).toEqual(['i1', 'i2']);
  });

  it('chunks each platform to its provider limit', () => {
    const android = Array.from({ length: BATCH_LIMITS.android + 1 }, (_, i) => msg('android', `a${i}`));
    const batches = batchMessages(android);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(BATCH_LIMITS.android);
    expect(batches[1]).toHaveLength(1);
  });

  it('is empty for no messages', () => {
    expect(batchMessages([])).toEqual([]);
  });
});
