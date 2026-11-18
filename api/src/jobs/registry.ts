import type { ZodType } from 'zod';
import type pino from 'pino';

export interface JobContext {
  log: pino.Logger;
  /** The 1-based attempt number. Handlers must be idempotent: a job can run twice if a worker dies before the ack. */
  attempt: number;
  /**
   * The same for every attempt of this job and no other: its id plus its creation time, since ids restart if Redis is
   * emptied. Handlers pass it to providers that can tell a retry from a new request. Absent outside the queue.
   */
  key?: string;
}

export interface JobDefinition<T> {
  name: string;
  schema: ZodType<T>;
  handler: (payload: T, ctx: JobContext) => Promise<void>;
  /**
   * How often this job is tried and the first retry delay (doubling after), where the queue's default is too short.
   * An enqueue may still override it.
   */
  retry?: { attempts: number; backoffDelayMs: number };
}

export function defineJob<T>(def: JobDefinition<T>): JobDefinition<T> {
  return def;
}

export class JobRegistry {
  private readonly jobs = new Map<string, JobDefinition<unknown>>();

  register<T>(def: JobDefinition<T>): void {
    if (this.jobs.has(def.name)) {
      throw new Error(`job "${def.name}" is already registered`);
    }
    this.jobs.set(def.name, def as JobDefinition<unknown>);
  }

  get(name: string): JobDefinition<unknown> | undefined {
    return this.jobs.get(name);
  }

  names(): string[] {
    return [...this.jobs.keys()];
  }
}
