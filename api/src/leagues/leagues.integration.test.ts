/**
 * Learning Leagues (contract 4 §L) against real Postgres: joining, grouping,
 * the Wednesday merge, the Monday settle (once, and before anyone's next
 * week), promotion and demotion with the weekly goal, Gems, the season reset,
 * personal mode and what the table shows.
 *
 * Most tests run in weeks long closed (2025), each in a week of its own, with
 * the clock passed in — the settle only touches weeks before the `now` it is
 * given, so nothing here reaches another suite's weeks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { nextWeek, weekSeason, type LeagueTier } from '@kurda/shared';
import { LeagueService, type LeagueNotices } from './service.js';
import { weekStart } from './league-logic.js';
import { GemService } from '../gems/service.js';
import { WalletService } from '../wallet/service.js';
import { addXp, learningAward, makeLearner, removeLearners, type LearnerOptions } from '../test/progress.js';
import type { Notification } from '../push/service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const DAY = 86_400_000;

/** A moment `days` and `hours` into the week starting `week`. */
const at = (week: string, days = 0, hours = 12): Date => new Date(Date.parse(`${week}T00:00:00Z`) + days * DAY + hours * 3_600_000);

describe.skipIf(!DATABASE_URL)('learning leagues (integration)', () => {
  let pool: pg.Pool;
  let leagues: LeagueService;
  let gems: GemService;
  const sent: Array<{ userId: string; n: Notification; push: boolean }> = [];
  const notices: LeagueNotices = {
    record: async (userId, n) => void sent.push({ userId, n, push: false }),
    push: async (userId, n) => void sent.push({ userId, n, push: true }),
  };
  const suffix = Date.now().toString(36);
  let n = 0;

  const learner = async (opts: LearnerOptions = {}) => {
    n += 1;
    return makeLearner(pool, `lg${suffix}${n}`, opts);
  };

  /** Their tier, as of the season of `week` (so no reset is involved unless a test wants one). */
  const setTier = async (userId: string, tier: LeagueTier, week: string) => {
    await pool.query(
      `INSERT INTO user_league (user_id, tier, season_key) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET tier = $2, season_key = $3`,
      [userId, tier, weekSeason(week)],
    );
  };

  const tierOf = async (userId: string): Promise<string> =>
    (await pool.query<{ tier: string }>(`SELECT tier FROM user_league WHERE user_id = $1`, [userId])).rows[0]!.tier;
  const groupOf = async (userId: string, week: string): Promise<string | undefined> =>
    (
      await pool.query<{ cohort_id: string }>(`SELECT cohort_id FROM league_members WHERE user_id = $1 AND week_key = $2`, [
        userId,
        week,
      ])
    ).rows[0]?.cohort_id;
  const gemsOf = async (userId: string): Promise<number> => (await new WalletService(pool).balances(userId)).gems;

  /** `count` learners of `tier`, all in one group of `week`, with the given weekly XP. */
  const group = async (week: string, tier: LeagueTier, xps: number[], opts: LearnerOptions = {}) => {
    const people = [];
    for (const xp of xps) {
      const p = await learner(opts);
      await setTier(p.id, tier, week);
      await leagues.ensureMembership(p.id, at(week));
      if (xp > 0) await addXp(pool, p.id, xp, at(week, 1));
      people.push(p);
    }
    return people;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
    gems = new GemService(pool, new WalletService(pool));
    leagues = new LeagueService(pool, { gems, notices, weeklyGoalXp: 150 });
  });

  afterAll(async () => {
    await removeLearners(pool, `lg${suffix}%`);
    await pool.end();
  });

  describe('the old tiers', () => {
    it('moves every stored tier to its water tier, two to one, Diamond alone to Okyanûs', async () => {
      // the migration's own statements, run on copies of the three tables
      const path = '../../migrations/1751000175000_water-leagues.js';
      const migration = (await import(/* @vite-ignore */ path)) as { up: (pgm: unknown) => void };
      const statements: string[] = [];
      const noop = () => undefined;
      migration.up({
        sql: (s: string) => statements.push(s),
        func: (s: string) => s,
        alterColumn: noop,
        addConstraint: noop,
        addColumns: noop,
        createIndex: noop,
        createTable: noop,
      });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`CREATE TEMP TABLE user_league (user_id int, tier text, peak_tier text) ON COMMIT DROP`);
        await client.query(`CREATE TEMP TABLE league_cohorts (tier text) ON COMMIT DROP`);
        await client.query(`CREATE TEMP TABLE league_members (tier text) ON COMMIT DROP`);
        const old = ['bronze', 'silver', 'gold', 'sapphire', 'ruby', 'emerald', 'amethyst', 'pearl', 'obsidian', 'diamond', 'cem', 'junk'];
        for (const [i, t] of old.entries()) {
          await client.query(`INSERT INTO user_league VALUES ($1, $2, $2)`, [i, t]);
          await client.query(`INSERT INTO league_cohorts VALUES ($1)`, [t]);
          await client.query(`INSERT INTO league_members VALUES ($1)`, [t]);
        }
        await client.query(`INSERT INTO user_league VALUES (99, 'gold', NULL)`);
        // temp tables shadow the real ones for this session
        for (const s of statements.filter((x) => /^UPDATE (user_league|league_cohorts|league_members) SET tier/.test(x))) {
          await client.query(s);
        }
        const rows = await client.query<{ tier: string; peak_tier: string | null }>(
          `SELECT tier, peak_tier FROM user_league ORDER BY user_id`,
        );
        expect(rows.rows.map((r) => r.tier)).toEqual([
          'dilop', 'dilop', 'kani', 'kani', 'cem', 'cem', 'gol', 'gol', 'derya', 'okyanus', 'cem', 'dilop', 'kani',
        ]);
        expect(rows.rows.at(-1)!.peak_tier).toBeNull();
        const cohorts = await client.query<{ tier: string }>(`SELECT DISTINCT tier FROM league_cohorts ORDER BY 1`);
        expect(cohorts.rows.map((r) => r.tier)).toEqual(['cem', 'derya', 'dilop', 'gol', 'kani', 'okyanus']);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('pays 10 Gems for a promotion now, not 25', async () => {
      const r = await pool.query<{ amount: number }>(`SELECT amount FROM gem_rules WHERE key = 'league_promotion'`);
      expect(r.rows[0]!.amount).toBe(10);
    });
  });

  describe('joining', () => {
    it('only learning XP joins; game XP and reading the page never do', async () => {
      const p = await learner();
      await leagues.onXp({ userId: p.id, source: 'wordle_battle', amount: 100, counted: 60 });
      expect(await groupOf(p.id, weekStart(new Date()))).toBeUndefined();
      const view = await leagues.standings(p.id);
      expect(view).toMatchObject({ mode: 'league', joined: false, optedOut: false, tier: null, standings: [] });
      expect(await groupOf(p.id, weekStart(new Date()))).toBeUndefined();
      await leagues.onXp(learningAward(p.id, 20, 'practice_complete'));
      expect(await groupOf(p.id, weekStart(new Date()))).toBeDefined();
      const joined = await leagues.standings(p.id);
      expect(joined).toMatchObject({ mode: 'league', joined: true, tier: 'dilop' });
      expect(joined.standings.find((s) => s.isSelf)).toBeDefined();
    });

    it('groups by clock: within six hours together, further apart in groups of their own', async () => {
      const week = '2025-01-06';
      const erbil = await learner({ timezone: 'Asia/Baghdad' });
      const berlin = await learner({ timezone: 'Europe/Berlin' });
      const newYork = await learner({ timezone: 'America/New_York' });
      for (const p of [erbil, berlin, newYork]) await leagues.ensureMembership(p.id, at(week));
      expect(await groupOf(berlin.id, week)).toBe(await groupOf(erbil.id, week));
      expect(await groupOf(newYork.id, week)).not.toBe(await groupOf(erbil.id, week));
    });

    it('groups by the last four weeks of XP: a newcomer does not race someone doing an hour a day', async () => {
      const week = '2025-01-13';
      const heavy = await learner();
      await addXp(pool, heavy.id, 4000, at(week, -10));
      const light = await learner();
      const lighter = await learner();
      for (const p of [heavy, light, lighter]) await leagues.ensureMembership(p.id, at(week));
      expect(await groupOf(light.id, week)).toBe(await groupOf(lighter.id, week));
      expect(await groupOf(heavy.id, week)).not.toBe(await groupOf(light.id, week));
      const band = await pool.query<{ xp_band: number }>(`SELECT xp_band FROM league_cohorts WHERE id = $1`, [
        await groupOf(heavy.id, week),
      ]);
      expect(band.rows[0]!.xp_band).toBe(4);
    });

    it('fills an open group before starting another, and locks it at twenty', async () => {
      const week = '2025-01-20';
      const people = [];
      for (let i = 0; i < 21; i++) {
        const p = await learner();
        await leagues.ensureMembership(p.id, at(week));
        people.push(p);
      }
      const first = await groupOf(people[0]!.id, week);
      for (const p of people.slice(0, 20)) expect(await groupOf(p.id, week)).toBe(first);
      expect(await groupOf(people[20]!.id, week)).not.toBe(first);
      const count = await pool.query<{ member_count: number }>(`SELECT member_count FROM league_cohorts WHERE id = $1`, [first]);
      expect(count.rows[0]!.member_count).toBe(20);
    });

    it('two dozen joining at the same moment never push a group past twenty', async () => {
      const week = '2025-01-27';
      const people = [];
      for (let i = 0; i < 45; i++) people.push(await learner());
      await Promise.all(people.map((p) => leagues.ensureMembership(p.id, at(week))));
      const sizes = await pool.query<{ cohort_id: string; n: number; member_count: number }>(
        `SELECT m.cohort_id, count(*)::int AS n, max(c.member_count) AS member_count
           FROM league_members m JOIN league_cohorts c ON c.id = m.cohort_id
          WHERE m.user_id = ANY($1) AND m.week_key = $2 GROUP BY m.cohort_id`,
        [people.map((p) => p.id), week],
      );
      expect(sizes.rows.reduce((a, r) => a + r.n, 0)).toBe(45);
      for (const row of sizes.rows) {
        expect(row.n).toBeLessThanOrEqual(20);
        expect(row.member_count).toBe(row.n);
      }
      expect(sizes.rows).toHaveLength(3);
    });

    it('after Wednesday a late joiner goes to any open group of the tier rather than one of their own', async () => {
      const week = '2025-02-03';
      const early = await learner({ timezone: 'Asia/Baghdad' });
      await leagues.ensureMembership(early.id, at(week));
      const late = await learner({ timezone: 'America/Los_Angeles' });
      await leagues.ensureMembership(late.id, at(week, 4));
      expect(await groupOf(late.id, week)).toBe(await groupOf(early.id, week));
    });
  });

  describe('Wednesday’s merge', () => {
    it('merges groups under eight into the nearest open group, a neighbouring tier scored on its own', async () => {
      const week = '2025-02-10';
      // a group of three and a group of ten in Çem, nine hours apart; two in Kanî alone
      const small = await group(week, 'cem', [300, 200, 100], { timezone: 'America/New_York' });
      const big = await group(week, 'cem', [900, 800, 700, 600, 500, 450, 400, 350, 50, 40], { timezone: 'Asia/Dubai' });
      const kani = await group(week, 'kani', [400, 30], { timezone: 'America/New_York' });
      expect(await groupOf(small[0]!.id, week)).not.toBe(await groupOf(big[0]!.id, week));

      expect(await leagues.mergeSmallGroups(at(week, 1))).toBeNull(); // not before Wednesday
      const run = await leagues.mergeSmallGroups(at(week, 2, 0.1));
      expect(run).toMatchObject({ kind: 'merge', weekKey: week });
      expect(run!.finishedAt).not.toBeNull();
      expect(run!.result).toMatchObject({ merged: 2 });

      const target = await groupOf(big[0]!.id, week);
      for (const p of [...small, ...kani]) expect(await groupOf(p.id, week)).toBe(target);
      const size = await pool.query<{ member_count: number }>(`SELECT member_count FROM league_cohorts WHERE id = $1`, [target]);
      expect(size.rows[0]!.member_count).toBe(15);

      // a second run is a no-op
      const again = await leagues.mergeSmallGroups(at(week, 2, 1));
      expect(again!.attempts).toBe(1);

      // the merged table: Kanî's best moves up within Kanî even from eighth place
      const standings = await leagues.settleCohort(target!);
      const k = standings.find((s) => s.userId === kani[0]!.id)!;
      expect(k.tier).toBe('kani');
      expect(k.outcome).toBe('promoted');
      expect(await tierOf(kani[0]!.id)).toBe('cem');
      expect(await tierOf(kani[1]!.id)).toBe('kani'); // never demoted from Kanî
      // Çem's thirteen: three places up, one down (the last, short of the goal)
      expect(standings.filter((s) => s.tier === 'cem' && s.outcome === 'promoted')).toHaveLength(3);
      expect(standings.filter((s) => s.tier === 'cem' && s.outcome === 'demoted').map((s) => s.weeklyXp)).toEqual([40]);
    });
  });

  describe('the weekly settle', () => {
    it('promotes the top quarter with the goal met, demotes only those at the bottom without it, and pays 10 Gems', async () => {
      const week = '2025-02-17';
      // twenty in Gol: places 1–5 move up (but #5 is short of the goal), 18–20 move down
      const xps = [900, 800, 700, 600, 140, 130, 120, 110, 100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 20, 10];
      const people = await group(week, 'gol', xps);
      const run = await leagues.settleDue(at(nextWeek(week), 0, 0.1), { force: true });
      expect(run.finishedAt).not.toBeNull();

      const byXp = await pool.query<{ user_id: string; outcome: string; tier_after: string; gems: number; goal_met: boolean }>(
        `SELECT user_id, outcome, tier_after, gems, goal_met FROM league_weeks WHERE week_key = $1 AND user_id = ANY($2)`,
        [week, people.map((p) => p.id)],
      );
      const row = (i: number) => byXp.rows.find((r) => r.user_id === people[i]!.id)!;
      for (const i of [0, 1, 2, 3]) {
        expect(row(i)).toMatchObject({ outcome: 'promoted', tier_after: 'derya', gems: 10 });
        expect(await tierOf(people[i]!.id)).toBe('derya');
        expect(await gemsOf(people[i]!.id)).toBe(10);
      }
      expect(row(4)).toMatchObject({ outcome: 'stayed', goal_met: false });
      expect(await gemsOf(people[4]!.id)).toBe(0);
      expect(row(16)).toMatchObject({ outcome: 'stayed' });
      for (const i of [17, 18, 19]) expect(row(i)).toMatchObject({ outcome: 'demoted', tier_after: 'cem' });
      expect(await tierOf(people[19]!.id)).toBe('cem');

      // the promoted were told, once each; nobody was told about going down
      const told = sent.filter((s) => people.some((p) => p.id === s.userId));
      expect(told.map((s) => s.n.data?.kind)).toEqual(['league_promotion', 'league_promotion', 'league_promotion', 'league_promotion']);
      expect(told.every((s) => s.push && s.n.category === 'progress')).toBe(true);
    });

    it('settles a week once: run twice, or three at once, nobody moves or is paid again', async () => {
      const week = '2025-02-24';
      const people = await group(week, 'cem', [500, 400, 300, 200, 100, 90, 80, 70]);
      const now = at(nextWeek(week), 0, 0.1);
      const first = await leagues.settleDue(now, { force: true });
      expect(first.finishedAt).not.toBeNull();
      const second = await leagues.settleDue(now);
      expect(second.attempts).toBe(first.attempts); // finished: not even started again
      await Promise.all([leagues.settleDue(now, { force: true }), leagues.settleDue(now, { force: true }), leagues.settleDue(now, { force: true })]);
      expect(await tierOf(people[0]!.id)).toBe('gol');
      expect(await tierOf(people[1]!.id)).toBe('gol');
      expect(await tierOf(people[2]!.id)).toBe('cem');
      expect(await gemsOf(people[0]!.id)).toBe(10);
      const rows = await pool.query(`SELECT 1 FROM league_weeks WHERE week_key = $1 AND user_id = ANY($2)`, [
        week,
        people.map((p) => p.id),
      ]);
      expect(rows.rowCount).toBe(8);
    });

    it('closes the Monday race: a first lesson before the settle joins at the tier just earned', async () => {
      const week = '2025-03-03';
      const people = await group(week, 'cem', [900, 800, 100, 90, 80, 70, 60, 50]);
      const winner = people[0]!;
      // Monday 00:01, before any settle has run
      const monday = at(nextWeek(week), 0, 1 / 60);
      const { tier } = await leagues.ensureMembership(winner.id, monday);
      expect(tier).toBe('gol');
      expect(await tierOf(winner.id)).toBe('gol');
      const members = await pool.query<{ tier: string }>(`SELECT tier FROM league_members WHERE user_id = $1 AND week_key = $2`, [
        winner.id,
        nextWeek(week),
      ]);
      expect(members.rows[0]!.tier).toBe('gol');
      // the late settle then changes nothing it has already done
      await leagues.settleDue(at(nextWeek(week), 0, 2), { force: true });
      expect(await tierOf(winner.id)).toBe('gol');
      expect(await gemsOf(winner.id)).toBe(10);
    });

    it('in a group under eight: nobody is demoted, and nobody with no XP moves up', async () => {
      const week = '2025-03-17';
      const people = await group(week, 'derya', [600, 500, 10, 0, 0]);
      const out = await leagues.settleCohort((await groupOf(people[0]!.id, week))!);
      expect(out.filter((s) => s.outcome === 'promoted').map((s) => s.weeklyXp)).toEqual([600]);
      expect(out.some((s) => s.outcome === 'demoted')).toBe(false);
      expect(await tierOf(people[3]!.id)).toBe('derya');
    });

    it('gives the top three of an Okyanûs group the Pêla trophy and promotes nobody past it', async () => {
      const week = '2025-03-24';
      const people = await group(week, 'okyanus', [900, 800, 700, 600, 100, 90, 80, 70, 60, 50]);
      const out = await leagues.settleCohort((await groupOf(people[0]!.id, week))!);
      expect(out.filter((s) => s.trophy).map((s) => s.weeklyXp)).toEqual([900, 800, 700]);
      expect(out.some((s) => s.outcome === 'promoted')).toBe(false);
      expect(await tierOf(people[0]!.id)).toBe('okyanus');
    });

    it('pays promotion Gems once per tier per season: up, down and up again pays nothing more', async () => {
      // the third week far enough on that the first week's XP no longer sets the climber's band
      const weeks = ['2025-05-05', '2025-05-12', '2025-06-16'];
      const climber = await learner();
      const others = async (week: string, tier: LeagueTier, xps: number[]) => group(week, tier, xps);
      // week 1: up from Kanî to Çem
      await setTier(climber.id, 'kani', weeks[0]!);
      await leagues.ensureMembership(climber.id, at(weeks[0]!));
      await addXp(pool, climber.id, 900, at(weeks[0]!, 1));
      await others(weeks[0]!, 'kani', [100, 90, 80, 70, 60, 50, 40]);
      await leagues.settleCohort((await groupOf(climber.id, weeks[0]!))!);
      expect(await tierOf(climber.id)).toBe('cem');
      expect(await gemsOf(climber.id)).toBe(10);
      // week 2: down to Kanî (last, no goal) — set straight, as the settle would
      await setTier(climber.id, 'kani', weeks[1]!);
      // week 3: up to Çem again — no Gems this season
      await leagues.ensureMembership(climber.id, at(weeks[2]!));
      await addXp(pool, climber.id, 900, at(weeks[2]!, 1));
      await others(weeks[2]!, 'kani', [100, 90, 80, 70, 60, 50, 40]);
      await leagues.settleCohort((await groupOf(climber.id, weeks[2]!))!);
      expect(await tierOf(climber.id)).toBe('cem');
      expect(await gemsOf(climber.id)).toBe(10);
      const last = await pool.query<{ gems: number }>(`SELECT gems FROM league_weeks WHERE user_id = $1 AND week_key = $2`, [
        climber.id,
        weeks[2],
      ]);
      expect(last.rows[0]!.gems).toBe(0);
    });

    it('records the week of everyone in personal mode too', async () => {
      const week = '2025-06-02';
      const teen = await learner({ age: 15 });
      await addXp(pool, teen.id, 200, at(week, 2));
      const quiet = await learner({ leaguesEnabled: false });
      await addXp(pool, quiet.id, 40, at(week, 2));
      await leagues.settleDue(at(nextWeek(week), 0, 0.2), { force: true });
      const rows = await pool.query<{ user_id: string; mode: string; weekly_xp: number; goal_met: boolean; tier: string | null }>(
        `SELECT user_id, mode, weekly_xp, goal_met, tier FROM league_weeks WHERE week_key = $1 AND user_id = ANY($2)`,
        [week, [teen.id, quiet.id]],
      );
      const teenRow = rows.rows.find((r) => r.user_id === teen.id)!;
      expect(teenRow).toMatchObject({ mode: 'personal', weekly_xp: 200, goal_met: true, tier: null });
      expect(rows.rows.find((r) => r.user_id === quiet.id)).toMatchObject({ mode: 'personal', goal_met: false });
    });
  });

  describe('the season reset', () => {
    it('moves everyone two tiers down at the first settle of a new quarter, never below Dilop, once', async () => {
      const q = '2025-06-23'; // the last week of Q2
      const top = await learner();
      const low = await learner();
      await setTier(top.id, 'okyanus', q);
      await setTier(low.id, 'kani', q);
      const firstOfQ3 = '2025-06-30'; // Monday of the week holding 1 July: still Q2's
      expect(weekSeason(firstOfQ3)).toBe('2025-Q2');
      await leagues.settleDue(at(firstOfQ3, 0, 0.3), { force: true });
      expect(await tierOf(top.id)).toBe('okyanus');
      await leagues.settleDue(at('2025-07-07', 0, 0.3), { force: true });
      expect(await tierOf(top.id)).toBe('gol');
      expect(await tierOf(low.id)).toBe('dilop');
      await leagues.settleDue(at('2025-07-07', 0, 0.4), { force: true });
      expect(await tierOf(top.id)).toBe('gol');
    });

    it('applies the reset at the join for someone whose first lesson comes before the settle', async () => {
      const top = await learner();
      await setTier(top.id, 'okyanus', '2025-09-22'); // Q3
      const { tier } = await leagues.ensureMembership(top.id, at('2025-10-06', 0, 0.01)); // Q4, before any settle
      expect(tier).toBe('gol');
      // more than a year away is five resets: all the way down
      const away = await learner();
      await setTier(away.id, 'okyanus', '2024-09-23');
      const back = await leagues.ensureMembership(away.id, at('2025-10-06', 1));
      expect(back.tier).toBe('dilop');
    });
  });

  describe('what the table shows', () => {
    it('one table: minors anonymised to strangers, nobody who left or opted out or is gone, and the goal', async () => {
      const week = weekStart(new Date());
      const me = await learner();
      const teen = await learner({ age: 15, leaguesEnabled: true });
      const leaver = await learner();
      const gone = await learner();
      const quitter = await learner();
      // all in a fresh tier-Gol group of this week (Gol, so it is nobody else's)
      for (const p of [me, teen, leaver, gone, quitter]) {
        await setTier(p.id, 'gol', week);
        await leagues.ensureMembership(p.id, new Date());
      }
      expect(new Set(await Promise.all([me, teen, leaver, gone, quitter].map((p) => groupOf(p.id, week)))).size).toBe(1);
      await addXp(pool, me.id, 200, new Date());
      await addXp(pool, teen.id, 100, new Date());
      await pool.query(`UPDATE league_members SET left_at = now() WHERE user_id = $1 AND week_key = $2`, [leaver.id, week]);
      await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [gone.id]);
      await pool.query(`UPDATE users SET leagues_enabled = false WHERE id = $1`, [quitter.id]);

      const view = await leagues.standings(me.id);
      expect(view).toMatchObject({ mode: 'league', joined: true, tier: 'gol', weeklyXp: 200, goalXp: 150, goalMet: true, safe: true });
      expect(view.standings).toHaveLength(2);
      expect(view.standings[0]).toMatchObject({ isSelf: true, userId: me.id, weeklyXp: 200, rank: 1, tier: 'gol' });
      expect(view.standings[1]).toMatchObject({ isSelf: false, userId: null, username: null, weeklyXp: 100 });
      expect(new Date(view.endsAt).getUTCDay()).toBe(1);
      expect(view.recentWeeks).toHaveLength(5);
      expect(view.recentWeeks.at(-1)).toMatchObject({ weekKey: week, xp: 200, goalMet: true });
    });

    it('personal mode for a teen who has not chosen: the goal ring, and no table', async () => {
      const teen = await learner({ age: 15 });
      await addXp(pool, teen.id, 60, new Date());
      const view = await leagues.standings(teen.id);
      expect(view).toMatchObject({ mode: 'personal', optedOut: true, joined: false, weeklyXp: 60, goalMet: false, standings: [] });
    });

    it('says "safe" once, when the goal is met', async () => {
      const p = await learner();
      await leagues.onXp(learningAward(p.id, 100));
      await addXp(pool, p.id, 100, new Date(), { source: 'lesson_complete' });
      await leagues.onXp(learningAward(p.id, 60));
      await addXp(pool, p.id, 60, new Date(), { source: 'lesson_complete' });
      await leagues.onXp(learningAward(p.id, 30));
      const safe = sent.filter((s) => s.userId === p.id && s.n.data?.kind === 'league_safe');
      expect(safe).toHaveLength(1);
      expect(safe[0]!.push).toBe(false);
    });

    it('shows last week’s result card', async () => {
      const week = '2025-11-03';
      const people = await group(week, 'cem', [800, 700, 100, 90, 80, 70, 60, 50]);
      await leagues.settleCohort((await groupOf(people[0]!.id, week))!);
      const view = await leagues.standings(people[0]!.id, at(nextWeek(week), 1));
      expect(view.lastWeek).toMatchObject({
        weekKey: week,
        mode: 'league',
        tier: 'cem',
        tierAfter: 'gol',
        outcome: 'promoted',
        rank: 1,
        groupSize: 8,
        weeklyXp: 800,
        goalMet: true,
        gems: 10,
      });
      expect(view.tier).toBe('gol');
    });
  });

  describe('the admin', () => {
    it('lists a week’s groups and the runs, and shows one group with names', async () => {
      const week = '2025-02-17';
      const overview = await leagues.adminOverview(week);
      expect(overview.groups.length).toBeGreaterThan(0);
      expect(overview.closedBy?.finishedAt).not.toBeNull();
      const g = await leagues.adminGroup(overview.groups[0]!.id);
      expect(g!.standings.every((s) => s.username.length > 0)).toBe(true);
    });
  });
});
