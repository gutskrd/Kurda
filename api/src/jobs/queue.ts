import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/env.js';
import type { JobDefinition } from './registry.js';
import { priorityForJob, shouldShed } from './backpressure.js';

export const QUEUE_NAME = 'kurda-jobs';

/**
 * How long a job that ran out of retries is kept, in seconds, and at most how many. The failed set is the
 * dead-letter queue, inspectable and re-runnable, and the admin's email page counts a week of failed sends from it.
 * Kept bounded because failed jobs hold payloads (addresses among them) and stack traces in memory-priced Redis.
 */
export const FAILED_JOB_RETENTION = { age: 30 * 24 * 3600, count: 5_000 };

export const DEFAULT_JOB_OPTIONS = {
  attempts: 4, // 1 initial + 3 retries
  backoff: { type: 'exponential', delay: 1_000 } as const,
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  // failed-after-retries jobs are kept for a while, not for ever (above)
  removeOnFail: FAILED_JOB_RETENTION,
};

/** BullMQ requires maxRetriesPerRequest: null on its connections. */
export function createQueueConnection(config: AppConfig): Redis {
  return new Redis(config.REDIS_URL as string, { maxRetriesPerRequest: null });
}

export interface EnqueueOptions {
  /** Dedupe key: two enqueues with the same key create one job. */
  idempotencyKey?: string;
  delayMs?: number;
  attempts?: number;
  backoffDelayMs?: number;
}

/** How a job is retried: what this enqueue asks, else the job's own `retry`, else the queue default. */
export function jobRetryOptions(def: Pick<JobDefinition<unknown>, 'retry'>, opts: Pick<EnqueueOptions, 'attempts' | 'backoffDelayMs'> = {}): { attempts?: number; backoff?: { type: 'exponential'; delay: number } } {
  const attempts = opts.attempts ?? def.retry?.attempts;
  const delay = opts.backoffDelayMs ?? def.retry?.backoffDelayMs;
  return {
    ...(attempts ? { attempts } : {}),
    ...(delay ? { backoff: { type: 'exponential' as const, delay } } : {}),
  };
}

function validPayload<T>(def: JobDefinition<T>, payload: T): T {
  const parsed = def.schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`invalid payload for job "${def.name}": ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

export class JobQueue {
  constructor(private readonly queue: Queue) {}

  static create(config: AppConfig): JobQueue {
    return new JobQueue(
      new Queue(QUEUE_NAME, {
        connection: createQueueConnection(config),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    );
  }

  /** Validates the payload against the job's schema before it reaches Redis, so a bad producer fails its own request. */
  async enqueue<T>(def: JobDefinition<T>, payload: T, opts: EnqueueOptions = {}): Promise<string> {
    const job = await this.queue.add(def.name, validPayload(def, payload), {
      jobId: opts.idempotencyKey,
      delay: opts.delayMs,
      // Priority: auth emails, then push, then analytics.
      priority: priorityForJob(def.name),
      ...jobRetryOptions(def, opts),
    });
    return job.id as string;
  }

  /** `enqueue` for many payloads of one job in a single round trip; none is queued unless every one is valid. */
  async enqueueAll<T>(def: JobDefinition<T>, payloads: readonly T[]): Promise<void> {
    if (payloads.length === 0) return;
    const opts = { priority: priorityForJob(def.name), ...jobRetryOptions(def) };
    await this.queue.addBulk(payloads.map((payload) => ({ name: def.name, data: validPayload(def, payload), opts })));
  }

  /** The waiting-job depth, the backpressure signal. */
  async waitingCount(): Promise<number> {
    return this.queue.getWaitingCount();
  }

  /** Enqueues unless backpressure sheds this job's class at the current depth; returns null when shed. */
  async enqueueUnlessShed<T>(def: JobDefinition<T>, payload: T, opts: EnqueueOptions = {}): Promise<string | null> {
    if (shouldShed(def.name, await this.waitingCount())) return null;
    return this.enqueue(def, payload, opts);
  }

  /** Upserts a repeatable schedule for a job (stable id per job name). */
  async scheduleEvery<T>(def: JobDefinition<T>, everyMs: number, payload: T): Promise<void> {
    // Repeatable jobs use job schedulers in this BullMQ version.
    await this.queue.upsertJobScheduler(
      `repeat:${def.name}`,
      { every: everyMs },
      { name: def.name, data: payload },
    );
  }

  /** Upserts a calendar schedule (a cron pattern in UTC), for work tied to a moment rather than an interval. */
  async scheduleCron<T>(def: JobDefinition<T>, pattern: string, payload: T): Promise<void> {
    await this.queue.upsertJobScheduler(
      `cron:${def.name}`,
      { pattern, tz: 'UTC' },
      { name: def.name, data: payload },
    );
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  get raw(): Queue {
    return this.queue;
  }
}
