/**
 * Failed child pairings counted across every network. Each network is held to its own limit at the route, but someone
 * guessing from many networks at once passes every one of them, so a count of all failures in a window warns when it
 * grows past what honest mistakes make. It only warns: refusing everyone past a total would let anyone stop every
 * family from pairing a phone.
 */
import { Counter, type Registry } from 'prom-client';
import type { CounterRedis } from '../limits/counters.js';

/** The window the failures are counted in. */
export const PAIRING_WATCH_MINUTES = 15;
/** Failed pairings in one window, across every network, that are worth a warning; a busy evening makes a handful. */
export const PAIRING_FAILURES_WARN = 100;

const INCR_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n
`;

export interface PairingWatchDeps {
  /** the shared store, so every instance counts into one number; counted in this process without it or while it is down */
  redis?: CounterRedis | null;
  log: { warn: (obj: unknown, msg?: string) => void };
  registry?: Registry;
  threshold?: number;
  now?: () => Date;
}

export class PairingWatch {
  private readonly threshold: number;
  private readonly now: () => Date;
  private readonly local = new Map<number, number>();
  private readonly total: Counter | null;

  constructor(private readonly deps: PairingWatchDeps) {
    this.threshold = deps.threshold ?? PAIRING_FAILURES_WARN;
    this.now = deps.now ?? (() => new Date());
    this.total = deps.registry
      ? new Counter({ name: 'child_pairings_failed_total', help: 'Child pairing codes that did not work, from every network', registers: [deps.registry] })
      : null;
  }

  /** Counts one failed pairing; returns the window's count so far, and warns as it reaches each multiple of the threshold. */
  async failed(): Promise<number> {
    this.total?.inc();
    const window = Math.floor(this.now().getTime() / (PAIRING_WATCH_MINUTES * 60_000));
    const n = await this.count(window);
    if (n % this.threshold === 0) {
      this.deps.log.warn(
        { failed: n, windowMinutes: PAIRING_WATCH_MINUTES, threshold: this.threshold },
        'many child pairing codes failed across all networks: someone may be guessing them',
      );
    }
    return n;
  }

  private async count(window: number): Promise<number> {
    if (this.deps.redis) {
      try {
        return Number(await this.deps.redis.eval(INCR_SCRIPT, 1, `child-pairing-failed:${window}`, PAIRING_WATCH_MINUTES * 60 * 2));
      } catch {
        // counted here instead while the store is down
      }
    }
    for (const w of this.local.keys()) if (w < window) this.local.delete(w);
    const n = (this.local.get(window) ?? 0) + 1;
    this.local.set(window, n);
    return n;
  }
}
