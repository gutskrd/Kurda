import { describe, expect, it } from 'vitest';
import {
  badgeTierName,
  holdsProgressTools,
  rankTierName,
  reasonProblem,
  runResult,
  runState,
  thresholdText,
  utcOffset,
  weekLabel,
  xpBandText,
  type LeagueRunStatus,
} from './progress';

const run = (over: Partial<LeagueRunStatus> = {}): LeagueRunStatus => ({
  kind: 'settle',
  weekKey: '2026-10-12',
  startedAt: '2026-10-12T00:00:01.000Z',
  finishedAt: '2026-10-12T00:00:09.000Z',
  attempts: 1,
  lastError: null,
  result: { cohorts: 12, personal: 40, reset: 0, notified: 3 },
  ...over,
});

describe('names', () => {
  it('says a frame’s tier in Kurmancî with its meaning', () => {
    expect(rankTierName('ciya')).toBe('Çiya (Mountain)');
    expect(rankTierName('sterk')).toBe('Stêrk (Star)');
  });

  it('names badge tiers and what a tier needs', () => {
    expect(badgeTierName(3)).toBe('Zêr (Gold)');
    expect(badgeTierName(0)).toBe('None');
    expect(thresholdText({ unit: 'days' }, 30)).toBe('30 days');
    expect(thresholdText({ unit: 'days' }, 1)).toBe('1 day');
    expect(thresholdText({ unit: 'units' }, 'all')).toBe('all units');
  });

  it('reads a group’s XP band and clock', () => {
    expect(xpBandText(0)).toBe('under 150');
    expect(xpBandText(1)).toBe('150–599');
    expect(xpBandText(4)).toBe('3,000+');
    expect(utcOffset(0)).toBe('UTC');
    expect(utcOffset(180)).toBe('UTC+3');
    expect(utcOffset(-330)).toBe('UTC−5:30');
    expect(weekLabel('2026-10-12')).toBe('12 Oct – 18 Oct 2026');
  });
});

describe('a weekly run', () => {
  const now = new Date('2026-10-12T05:00:00.000Z');

  it('is done, failed, running, or stopped half way', () => {
    expect(runState(null, now)).toMatchObject({ label: 'Not run yet', tone: 'neutral' });
    expect(runState(run(), now)).toMatchObject({ label: 'Done', tone: 'ok', detail: 'Settled 12 groups · 40 personal weeks · 3 told of a promotion or a trophy' });
    expect(runState(run({ finishedAt: null, lastError: 'deadlock detected' }), now)).toMatchObject({ label: 'Failed', tone: 'bad', detail: 'deadlock detected' });
    expect(runState(run({ finishedAt: null, startedAt: '2026-10-12T04:59:00.000Z' }), now)).toMatchObject({ label: 'Running' });
    expect(runState(run({ finishedAt: null }), now)).toMatchObject({ label: 'Stopped half way', tone: 'warn' });
  });

  it('says what a settle and a merge did', () => {
    expect(runResult(run({ result: { cohorts: 1, personal: 1, reset: 5, notified: 0 } }))).toBe(
      'Settled 1 group · 1 personal week · 5 learners moved down for the new season · 0 told of a promotion or a trophy',
    );
    expect(runResult(run({ kind: 'merge', result: { merged: 2 } }))).toBe('Merged 2 small groups');
    expect(runResult(run({ kind: 'merge', result: {} }))).toBe('Merged 0 small groups');
  });
});

describe('reasons and roles', () => {
  it('asks for a reason the API will take', () => {
    expect(reasonProblem(' ok ')).toMatch(/at least 3/);
    expect(reasonProblem('win trading')).toBeNull();
    expect(reasonProblem('x'.repeat(501))).toMatch(/under 500/);
  });

  it('opens the league and badge tools to the legacy admin role and superadmin, as the routes are guarded', () => {
    expect(holdsProgressTools(['admin'])).toBe(true);
    expect(holdsProgressTools(['superadmin', 'moderator'])).toBe(true);
    expect(holdsProgressTools(['moderator', 'support', 'content_editor', 'founder'])).toBe(false);
  });
});
