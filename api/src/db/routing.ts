/**
 * Read-after-write routing (KUR-114). Reads are offloaded to a replica, but a
 * user who just wrote must not read stale data from a lagging replica — so for a
 * short window after each write, that user's reads are pinned back to the
 * primary. The window is per-user and self-expiring, so pinning costs nothing
 * once replication has caught up.
 */

/** How long after a user's write their reads stay pinned to the primary. */
export const READ_AFTER_WRITE_WINDOW_MS = 3_000;

export function shouldPinToPrimary(
  lastWriteMs: number | undefined,
  now: number,
  windowMs: number = READ_AFTER_WRITE_WINDOW_MS,
): boolean {
  if (lastWriteMs === undefined) return false;
  return now - lastWriteMs < windowMs;
}

/** Tracks each user's last write so their reads can pin to primary briefly. */
export class WritePinTracker {
  private readonly lastWrite = new Map<string, number>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly windowMs: number = READ_AFTER_WRITE_WINDOW_MS,
  ) {}

  markWrite(userId: string): void {
    this.lastWrite.set(userId, this.now());
    this.sweep();
  }

  isPinned(userId: string): boolean {
    return shouldPinToPrimary(this.lastWrite.get(userId), this.now(), this.windowMs);
  }

  /** Drop entries past the window so the map can't grow without bound. */
  private sweep(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [userId, at] of this.lastWrite) {
      if (at < cutoff) this.lastWrite.delete(userId);
    }
  }
}
