/**
 * Offline lesson-completion sync (KUR-042). A lesson finished offline is
 * queued with the answers the learner gave; on reconnect each is re-submitted
 * so the SERVER re-grades (anti-cheat) — offline XP shown meanwhile is
 * provisional. If the server rejects a stale cached lesson version, the entry
 * is discarded silently and the client re-fetches fresh content.
 */

export interface OfflineCompletion {
  sessionId: string;
  lessonId: string;
  answers: Array<{ exerciseId: string; answer: unknown }>;
  /** XP shown offline, provisional until the server confirms */
  provisionalXp: number;
}

/** Outcome of trying to sync one completion. */
export type SyncOutcome = 'synced' | 'stale' | 'offline';

export class OfflineCompletionQueue {
  private items: OfflineCompletion[] = [];

  enqueue(c: OfflineCompletion): void {
    this.items.push(c);
  }

  get pending(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  peek(): readonly OfflineCompletion[] {
    return this.items;
  }

  /**
   * Flush queued completions in order. `sync` re-submits one and returns:
   *   'synced' — server accepted & re-graded → dequeue
   *   'stale'  — server rejected the cached version → discard (re-fetch)
   *   'offline'— still no connection → stop, keep this and the rest
   * Returns how many were confirmed vs. discarded as stale.
   */
  async flush(sync: (c: OfflineCompletion) => Promise<SyncOutcome>): Promise<{ synced: number; stale: number }> {
    let synced = 0;
    let stale = 0;
    while (this.items.length > 0) {
      const outcome = await sync(this.items[0]!);
      if (outcome === 'offline') break;
      this.items.shift();
      if (outcome === 'synced') synced += 1;
      else stale += 1;
    }
    return { synced, stale };
  }
}
