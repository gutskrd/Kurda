/**
 * Job priority and load shedding. Jobs fall into three classes: critical work (auth emails) always runs first, and
 * bulk work (analytics) is shed first when the queue backs up, so a spike never delays password resets.
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
 * Whether a producer should drop this enqueue at the current waiting depth. Critical jobs are never shed, bulk goes
 * first, and standard only under a severe backlog.
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
