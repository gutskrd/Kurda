import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { scheduleMaintenance } from './maintenance.js';
import type { JobQueue } from './queue.js';
import { ANALYTICS_ROLLUP_JOB, ECONOMY_ROLLUP_JOB, ROLLUP_INTERVAL_MS, ROLLUP_WINDOW_DAYS } from './rollup-jobs.js';

/** A queue that records the schedules asked of it. */
function recordingQueue(): { queue: JobQueue; schedules: Array<{ name: string; everyMs: number; payload: unknown }> } {
  const schedules: Array<{ name: string; everyMs: number; payload: unknown }> = [];
  const queue = {
    scheduleEvery: async (def: { name: string }, everyMs: number, payload: unknown) => {
      schedules.push({ name: def.name, everyMs, payload });
    },
  } as unknown as JobQueue;
  return { queue, schedules };
}

describe('scheduleMaintenance', () => {
  it('schedules the dashboards’ rollups with the housekeeping, so a dedicated worker keeps them too', async () => {
    const { queue, schedules } = recordingQueue();
    const scheduled = await scheduleMaintenance(queue, {} as pg.Pool, null);
    for (const name of [ANALYTICS_ROLLUP_JOB, ECONOMY_ROLLUP_JOB]) {
      expect(scheduled).toContain(name);
      expect(schedules).toContainEqual({ name, everyMs: ROLLUP_INTERVAL_MS, payload: { days: ROLLUP_WINDOW_DAYS } });
    }
    // each schedule once
    expect(new Set(schedules.map((s) => s.name)).size).toBe(schedules.length);
  });
});
