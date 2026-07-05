/**
 * Integration tests — require REDIS_URL (CI integration job).
 * Exercise the full enqueue → worker → complete/DLQ pipeline.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import pino from 'pino';
import { z } from 'zod';
import { loadConfig } from '../config/env.js';
import { JobQueue, QUEUE_NAME, createQueueConnection } from './queue.js';
import { defineJob, JobRegistry } from './registry.js';
import { createWorker } from './worker.js';
import { sendEmailJob } from './email.js';

const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)('job queue (integration)', () => {
  const config = loadConfig({ REDIS_URL, LOG_LEVEL: 'fatal', NODE_ENV: 'test' });
  const log = pino({ level: 'silent' });
  let queue: JobQueue;
  let queueEvents: QueueEvents;
  const processed = vi.fn();
  let workerClose: () => Promise<void>;

  const okJob = defineJob({
    name: 'it-ok',
    schema: z.object({ msg: z.string() }),
    handler: async (p) => {
      processed(p.msg);
    },
  });
  const doomedJob = defineJob({
    name: 'it-doomed',
    schema: z.object({}),
    handler: async () => {
      throw new Error('always fails');
    },
  });

  beforeAll(async () => {
    const registry = new JobRegistry();
    registry.register(okJob);
    registry.register(doomedJob);
    registry.register(sendEmailJob);

    queue = JobQueue.create(config);
    await queue.raw.obliterate({ force: true }).catch(() => undefined);
    queueEvents = new QueueEvents(QUEUE_NAME, { connection: createQueueConnection(config) });
    await queueEvents.waitUntilReady();
    const worker = createWorker(config, log, registry);
    workerClose = () => worker.close();
  });

  afterAll(async () => {
    await workerClose();
    await queueEvents.close();
    await queue.close();
  });

  it('processes an enqueued job', async () => {
    await queue.enqueue(okJob, { msg: 'silav' });
    await vi.waitFor(() => expect(processed).toHaveBeenCalledWith('silav'), {
      timeout: 10_000,
      interval: 100,
    });
  });

  it('rejects invalid payloads at enqueue time (queue never sees them)', async () => {
    await expect(
      queue.enqueue(sendEmailJob, { to: 'not-an-email', template: 'verify-email', vars: {} }),
    ).rejects.toThrow(/invalid payload/);
  });

  it('retries with backoff then lands in the DLQ (failed set)', async () => {
    const jobId = await queue.enqueue(doomedJob, {}, { attempts: 3, backoffDelayMs: 50 });
    await vi.waitFor(
      async () => {
        const job = await queue.raw.getJob(jobId);
        expect(job).toBeDefined();
        expect(await job!.getState()).toBe('failed');
      },
      { timeout: 15_000, interval: 200 },
    );
    const job = await queue.raw.getJob(jobId);
    expect(job!.attemptsMade).toBe(3);
    const failed = await queue.raw.getFailed();
    expect(failed.some((f) => f.id === jobId)).toBe(true);
  });

  it('deduplicates by idempotency key', async () => {
    const a = await queue.enqueue(okJob, { msg: 'once' }, { idempotencyKey: 'same-key' });
    const b = await queue.enqueue(okJob, { msg: 'twice' }, { idempotencyKey: 'same-key' });
    expect(a).toBe(b);
  });
});
