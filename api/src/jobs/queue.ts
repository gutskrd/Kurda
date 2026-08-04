import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/env.js';
import type { JobDefinition } from './registry.js';
import { priorityForJob, shouldShed } from './backpressure.js';

export const QUEUE_NAME = 'kurda-jobs';

export const DEFAULT_JOB_OPTIONS = {
  attempts: 4, // 1 initial + 3 retries
  backoff: { type: 'exponential', delay: 1_000 } as const,
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  // failed-after-retries jobs are kept: BullMQ's failed set is our DLQ,
  // inspectable via admin tooling (KUR-101) and re-runnable
  removeOnFail: false,
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

  /**
   * Validates the payload against the job's schema BEFORE it hits Redis —
   * a malformed producer fails its own request instead of poisoning the
   * queue.
   */
  async enqueue<T>(def: JobDefinition<T>, payload: T, opts: EnqueueOptions = {}): Promise<string> {
    const parsed = def.schema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(
        `invalid payload for job "${def.name}": ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
    }
    const job = await this.queue.add(def.name, parsed.data, {
      jobId: opts.idempotencyKey,
      delay: opts.delayMs,
      // priority queues (KUR-119): auth emails > push > analytics
      priority: priorityForJob(def.name),
      ...(opts.attempts ? { attempts: opts.attempts } : {}),
      ...(opts.backoffDelayMs ? { backoff: { type: 'exponential', delay: opts.backoffDelayMs } } : {}),
    });
    return job.id as string;
  }

  /** Current waiting-job depth — the backpressure signal (KUR-119). */
  async waitingCount(): Promise<number> {
    return this.queue.getWaitingCount();
  }

  /**
   * Enqueue unless backpressure says to shed this job's class at the current
   * depth (KUR-119). Critical jobs are never shed; bulk/analytics producers drop
   * load first so a spike never delays auth email. Returns null when shed.
   */
  async enqueueUnlessShed<T>(def: JobDefinition<T>, payload: T, opts: EnqueueOptions = {}): Promise<string | null> {
    if (shouldShed(def.name, await this.waitingCount())) return null;
    return this.enqueue(def, payload, opts);
  }

  /** Upserts a repeatable schedule for a job (stable id per job name). */
  async scheduleEvery<T>(def: JobDefinition<T>, everyMs: number, payload: T): Promise<void> {
    // bullmq 6: repeatable jobs use job schedulers (the `repeat` add-option was removed)
    await this.queue.upsertJobScheduler(
      `repeat:${def.name}`,
      { every: everyMs },
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
