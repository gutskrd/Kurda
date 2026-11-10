import type pg from 'pg';

/** The gem rules anybody could farm, switched off by migration 1751000312000. */
export type FarmableGemRule = 'perfect_lesson' | 'achievement_milestone';

/**
 * One of the switched-off gem rules, switched on for a test file; the function
 * it answers with switches it off again.
 *
 * The code that asks for each of these grants is still there and an admin can
 * switch a rule back on, so a suite that covers that code (a perfect lesson
 * paid once per learner and lesson, never for a replay) switches the rule on
 * for itself in `beforeAll` and off in `afterAll`. Off, rather than however it
 * was found: off is what the migration left, so a run that was cut short
 * before its `afterAll` does not hand the next one a rule that is on.
 * Integration files run one at a time (vitest.config.ts), so no other suite
 * sees the rule on.
 */
export async function switchOnGemRule(pool: pg.Pool, key: FarmableGemRule): Promise<() => Promise<void>> {
  const set = async (active: boolean): Promise<void> => {
    const res = await pool.query(`UPDATE gem_rules SET active = $2 WHERE key = $1`, [key, active]);
    if ((res.rowCount ?? 0) === 0) throw new Error(`no gem rule called ${key}`);
  };
  await set(true);
  return () => set(false);
}
