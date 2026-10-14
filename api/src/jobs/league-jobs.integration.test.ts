/**
 * The league week on the job queue (contract 4 §L3): Monday's settle and
 * Wednesday's merge are calendar schedules, a starting process enqueues a
 * catch-up of whatever is due (once per week, however many processes start),
 * and the settle job runs the week's settle.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import pino from 'pino';
import { weekStart } from '@kurda/shared';
import { loadConfig } from '../config/env.js';
import { JobQueue } from './queue.js';
import {
  LEAGUE_MERGE_CRON,
  LEAGUE_MERGE_JOB,
  LEAGUE_SETTLE_CRON,
  LEAGUE_SETTLE_JOB,
  makeLeagueSettleJob,
  scheduleLeagueJobs,
} from './league-jobs.js';
import { LeagueService } from '../leagues/service.js';

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!REDIS_URL || !DATABASE_URL)('league jobs (integration)', () => {
  const config = loadConfig({ REDIS_URL, DATABASE_URL, LOG_LEVEL: 'fatal', NODE_ENV: 'test' });
  let queue: JobQueue;
  let pool: pg.Pool;
  let leagues: LeagueService;

  beforeAll(async () => {
    queue = JobQueue.create(config);
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    leagues = new LeagueService(pool);
  });

  afterAll(async () => {
    for (const name of [LEAGUE_SETTLE_JOB, LEAGUE_MERGE_JOB]) {
      await queue.raw.removeJobScheduler(`cron:${name}`).catch(() => undefined);
    }
    await queue.raw.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
    await pool.end();
  });

  it('schedules the settle for Monday 00:00 UTC and the merge for Wednesday 00:00 UTC', async () => {
    await scheduleLeagueJobs(queue, leagues, new Date('2026-10-12T09:00:00Z'));
    const schedulers = await queue.raw.getJobSchedulers();
    const byName = new Map(schedulers.map((s) => [s.name, s]));
    expect(byName.get(LEAGUE_SETTLE_JOB)).toMatchObject({ pattern: LEAGUE_SETTLE_CRON, tz: 'UTC' });
    expect(byName.get(LEAGUE_MERGE_JOB)).toMatchObject({ pattern: LEAGUE_MERGE_CRON, tz: 'UTC' });
    expect(LEAGUE_SETTLE_CRON).toBe('0 0 * * 1');
    expect(LEAGUE_MERGE_CRON).toBe('0 0 * * 3');
  });

  it('enqueues one catch-up per week however many processes start', async () => {
    const monday = new Date('2026-10-12T09:00:00Z');
    await scheduleLeagueJobs(queue, leagues, monday);
    await scheduleLeagueJobs(queue, leagues, monday);
    const settle = await queue.raw.getJob(`${LEAGUE_SETTLE_JOB}-2026-10-12`);
    expect(settle?.name).toBe(LEAGUE_SETTLE_JOB);
    // before Wednesday there is no merge to catch up on
    expect(await queue.raw.getJob(`${LEAGUE_MERGE_JOB}-2026-10-12`)).toBeUndefined();
    await scheduleLeagueJobs(queue, leagues, new Date('2026-10-15T09:00:00Z'));
    expect((await queue.raw.getJob(`${LEAGUE_MERGE_JOB}-2026-10-12`))?.name).toBe(LEAGUE_MERGE_JOB);
  });

  it('runs the week’s settle, and records that it did', async () => {
    const job = makeLeagueSettleJob(leagues);
    await job.handler({}, { log: pino({ level: 'silent' }), attempt: 1 });
    const run = await leagues.runStatus('settle', weekStart(new Date()));
    expect(run?.finishedAt).not.toBeNull();
    // the schedule firing again the same week does nothing
    await job.handler({}, { log: pino({ level: 'silent' }), attempt: 1 });
    expect((await leagues.runStatus('settle', weekStart(new Date())))?.attempts).toBe(run!.attempts);
  });
});
