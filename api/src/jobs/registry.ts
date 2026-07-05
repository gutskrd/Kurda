import type { ZodType } from 'zod';
import type pino from 'pino';

export interface JobContext {
  log: pino.Logger;
  /** BullMQ attempt number (1-based). Handlers MUST be idempotent — a job
   *  can run twice if a worker dies after the work but before the ack. */
  attempt: number;
}

export interface JobDefinition<T> {
  name: string;
  schema: ZodType<T>;
  handler: (payload: T, ctx: JobContext) => Promise<void>;
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
