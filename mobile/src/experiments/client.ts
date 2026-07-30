/**
 * A/B experiment client SDK (KUR-107) — pure and injectable (no React Native).
 * Assignments are SERVER-assigned (deterministic by userId), so the client only
 * caches them: the same user sees the same variant on every device and after a
 * reinstall. `getVariant` reads synchronously from the cache; `init` hydrates
 * from local storage first (instant, offline-safe) then refreshes from the API.
 */

export type Assignments = Record<string, string>;

export interface AssignmentFetcher {
  (path: string): Promise<{ ok: boolean; data?: { assignments: Assignments } }>;
}

export interface AssignmentStore {
  get(): Promise<Assignments | null>;
  set(a: Assignments): Promise<void>;
}

export class ExperimentClient {
  private assignments: Assignments = {};

  constructor(
    private readonly fetcher: AssignmentFetcher,
    private readonly store?: AssignmentStore,
  ) {}

  /** Load cached assignments immediately, then refresh from the server. */
  async init(): Promise<void> {
    const cached = await this.store?.get();
    if (cached) this.assignments = { ...cached };
    await this.refresh();
  }

  /** Pull the latest assignments; keeps the cached values on failure (offline). */
  async refresh(): Promise<void> {
    const res = await this.fetcher('/experiments');
    if (res.ok && res.data) {
      this.assignments = { ...res.data.assignments };
      await this.store?.set(this.assignments);
    }
  }

  /** The user's variant for an experiment, or `fallback` if unknown. */
  getVariant(key: string, fallback = 'control'): string {
    return this.assignments[key] ?? fallback;
  }

  isVariant(key: string, variant: string): boolean {
    return this.getVariant(key) === variant;
  }

  snapshot(): Assignments {
    return { ...this.assignments };
  }
}
