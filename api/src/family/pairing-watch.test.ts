/** Failed child pairings counted across every network, and the warning when there are many (family/pairing-watch.ts). */
import { describe, expect, it, vi } from 'vitest';
import { Registry } from 'prom-client';
import { PAIRING_FAILURES_WARN, PAIRING_WATCH_MINUTES, PairingWatch } from './pairing-watch.js';

const at = (minutes: number): Date => new Date(Date.UTC(2026, 10, 26, 10, 0) + minutes * 60_000);

describe('the watch on failed pairings', () => {
  it('warns once the failures in a window reach the threshold, with the count, and again at each further threshold', async () => {
    const warn = vi.fn();
    let now = at(1);
    const watch = new PairingWatch({ log: { warn }, threshold: 3, now: () => now });
    expect(await watch.failed()).toBe(1);
    expect(await watch.failed()).toBe(2);
    expect(warn).not.toHaveBeenCalled();
    expect(await watch.failed()).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatchObject({ failed: 3, windowMinutes: PAIRING_WATCH_MINUTES });
    for (let i = 0; i < 3; i++) await watch.failed();
    expect(warn).toHaveBeenCalledTimes(2);
    // a new window counts from nothing
    now = at(PAIRING_WATCH_MINUTES + 1);
    expect(await watch.failed()).toBe(1);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('counts in the shared store when there is one, so every instance adds to one number, and in the process while it is down', async () => {
    const counts = new Map<string, number>();
    const redis = {
      eval: vi.fn(async (_script: string, _keys: number, key: string) => {
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return n;
      }),
    };
    const warn = vi.fn();
    const one = new PairingWatch({ redis, log: { warn }, threshold: 4, now: () => at(2) });
    const two = new PairingWatch({ redis, log: { warn }, threshold: 4, now: () => at(2) });
    await one.failed();
    await two.failed();
    await one.failed();
    expect(await two.failed()).toBe(4);
    expect(warn).toHaveBeenCalledTimes(1);
    redis.eval.mockRejectedValueOnce(new Error('down'));
    expect(await one.failed()).toBe(1);
  });

  it('keeps a running total for the metrics, and sets the warning at a level no honest day reaches', async () => {
    const registry = new Registry();
    const watch = new PairingWatch({ log: { warn: () => undefined }, registry });
    await watch.failed();
    await watch.failed();
    expect(await registry.getSingleMetricAsString('child_pairings_failed_total')).toContain('child_pairings_failed_total 2');
    expect(PAIRING_FAILURES_WARN).toBeGreaterThanOrEqual(50);
  });
});
