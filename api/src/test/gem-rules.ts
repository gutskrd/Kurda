import type pg from 'pg';

/** The gem rules anybody could farm, switched off by migration 1751000312000. */
export type FarmableGemRule = 'perfect_lesson' | 'achievement_milestone';

/**
 * Switches on one of the switched-off gem rules for a test file and returns a function that switches it off again.
 * Suites covering the code behind such a rule turn it on in `beforeAll` and off in `afterAll`. Off rather than as
 * found, since off is the migration's state, so an interrupted run never leaves it on; integration files run one at a
 * time, so no other suite sees it on.
 */
export async function switchOnGemRule(pool: pg.Pool, key: FarmableGemRule): Promise<() => Promise<void>> {
  const set = async (active: boolean): Promise<void> => {
    const res = await pool.query(`UPDATE gem_rules SET active = $2 WHERE key = $1`, [key, active]);
    if ((res.rowCount ?? 0) === 0) throw new Error(`no gem rule called ${key}`);
  };
  await set(true);
  return () => set(false);
}
