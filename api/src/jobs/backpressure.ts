/**
 * Job priority + load-shedding policy (KUR-119). Jobs fall into three classes;
 * critical work (auth emails) always runs and outranks everything, bulk work
 * (analytics) is shed first when the queue backs up, so a spike degrades
 * gracefully instead of delaying password resets behind a mountain of events.
 */

export type JobClass = 'critical' | 'standard' | 'bulk';

/** Explicit class per job name; anything unlisted defaults to `standard`. */
const JOB_CLASS: Record<string, JobClass> = {
  'send-email': 'critical', // auth emails: verification, password reset
  'push-send': 'standard', // notifications
  'analytics-rollup': 'bulk',
  'analytics-ingest': 'bulk',
};

export function classForJob(name: string): JobClass {
  return JOB_CLASS[name] ?? 'standard';
}

// BullMQ treats a LOWER priority number as more urgent.
const CLASS_PRIORITY: Record<JobClass, number> = { critical: 1, standard: 5, bulk: 10 };

export function priorityForJob(name: string): number {
  return CLASS_PRIORITY[classForJob(name)];
}

export interface BackpressurePolicy {
  /** Shed bulk producers once waiting depth exceeds this. */
  shedBulkAbove: number;
  /** Shed standard producers only at a much deeper backlog. */
  shedStandardAbove: number;
}

export const DEFAULT_BACKPRESSURE: BackpressurePolicy = {
  shedBulkAbove: 5_000,
  shedStandardAbove: 20_000,
};

/**
 * Whether a producer should shed (drop) this enqueue given the current waiting
 * depth. Critical jobs are NEVER shed; bulk sheds first, standard only under a
 * severe backlog — so non-critical load is dropped before critical queues
 * degrade.
 */
export function shouldShed(jobName: string, waitingDepth: number, policy: BackpressurePolicy = DEFAULT_BACKPRESSURE): boolean {
  switch (classForJob(jobName)) {
    case 'critical':
      return false;
    case 'bulk':
      return waitingDepth > policy.shedBulkAbove;
    case 'standard':
      return waitingDepth > policy.shedStandardAbove;
  }
}
