import { describe, expect, it } from 'vitest';
import { enqueue, fromEvent, fromUnseen, seenId, type PendingBadge } from './queue';

const b = (key: string, tier: number): PendingBadge => ({ key, tier, tierKey: null, secret: false });

describe('the celebration queue', () => {
  it('keeps arrival order, one entry per badge', () => {
    expect(enqueue([], [b('agir', 1), b('ders', 1)], new Set()).map((x) => x.key)).toEqual(['agir', 'ders']);
  });

  it('celebrates a badge once however it arrived — the realtime event and the unseen list are one unlock', () => {
    const q = enqueue([b('agir', 1)], [b('agir', 1)], new Set());
    expect(q).toHaveLength(1);
  });

  it('keeps only the highest tier of a badge still waiting', () => {
    const q = enqueue([b('agir', 1), b('ders', 1)], [b('agir', 2)], new Set());
    expect(q).toEqual([b('agir', 2), b('ders', 1)]);
    expect(enqueue(q, [b('agir', 1)], new Set())).toEqual(q);
  });

  it('skips what this session has already celebrated', () => {
    expect(enqueue([], [b('agir', 1)], new Set([seenId(b('agir', 1))]))).toEqual([]);
  });

  it('reads both ways in the same shape', () => {
    expect(fromEvent({ type: 'badge_unlocked', key: 'pela', family: 'habit', tier: 2, tierKey: 'ziv', secret: false })).toEqual({
      key: 'pela',
      tier: 2,
      tierKey: 'ziv',
      secret: false,
    });
    expect(fromUnseen({ key: 'tire-rast', family: 'secret', tier: 1, tierKey: 'zer', secret: true, earnedAt: '2026-10-01T00:00:00Z' })).toEqual({
      key: 'tire-rast',
      tier: 1,
      tierKey: 'zer',
      secret: true,
    });
  });
});
