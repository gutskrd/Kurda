/**
 * Learning Leagues, rebuilt fairly (contract 4 §L1–L3).
 *
 * The ten Duolingo tiers become six water tiers — Dilop, Kanî, Çem, Gol, Derya,
 * Okyanûs — two old tiers to one new, Diamond alone to Okyanûs (the same map as
 * `LEGACY_LEAGUE_TIERS` in shared/src/leagues.ts). Every stored tier moves, the
 * history included, so a week's table reads the same before and after.
 *
 * Groups are formed by tier, by the last four weeks' XP band and by time zone,
 * and fill to twenty: `league_cohorts` remembers the band and the clock it was
 * formed for, and how many are in it (`member_count`), read and written under a
 * lock so two people joining at once can no longer take a group past its size.
 * A small group merged on Wednesday points at the one it went into.
 *
 * `league_weeks` is everyone's weekly result — the league tier, place and
 * outcome for those in a group, the XP and goal for those in personal mode — so
 * the last week's card, the weekly-goal badge and the data export all read one
 * record. `league_runs` records each weekly settle and Wednesday merge, so the
 * job runs once per week however many processes start it, and the admin can
 * see whether it did.
 *
 * `user_league.season_key` is the season whose two-tier reset a learner's tier
 * already reflects; everyone starts in the current one, so the first reset is
 * at the next quarter.
 *
 * Promotion now pays 10 Gems instead of 25 (and only once per tier a season,
 * which the grant's key enforces).
 */

const TIERS = ['dilop', 'kani', 'cem', 'gol', 'derya', 'okyanus'];
const LEGACY = {
  bronze: 'dilop',
  silver: 'dilop',
  gold: 'kani',
  sapphire: 'kani',
  ruby: 'cem',
  emerald: 'cem',
  amethyst: 'gol',
  pearl: 'gol',
  obsidian: 'derya',
  diamond: 'okyanus',
};
// the reverse, for `down`: the lower of the two old tiers each new one came from
const BACK = { dilop: 'bronze', kani: 'gold', cem: 'ruby', gol: 'amethyst', derya: 'obsidian', okyanus: 'diamond' };

const mapSql = (column, map, fallback) =>
  `CASE ${column} ${Object.entries(map)
    .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
    .join(' ')} ELSE ${fallback} END`;

const tierCheck = (column) => `${column} IN (${TIERS.map((t) => `'${t}'`).join(', ')})`;

export const up = (pgm) => {
  // a tier already new (or something unknown) is kept or starts again at Dilop
  const toNew = (column) => mapSql(column, LEGACY, `CASE WHEN ${tierCheck(column)} THEN ${column} ELSE 'dilop' END`);
  pgm.sql(`UPDATE user_league SET tier = ${toNew('tier')},
             peak_tier = CASE WHEN peak_tier IS NULL THEN NULL ELSE ${toNew('peak_tier')} END`);
  pgm.sql(`UPDATE league_cohorts SET tier = ${toNew('tier')}`);
  pgm.sql(`UPDATE league_members SET tier = ${toNew('tier')}`);
  pgm.alterColumn('user_league', 'tier', { default: 'dilop' });
  pgm.alterColumn('user_league', 'peak_tier', { default: 'dilop' });
  pgm.addConstraint('user_league', 'user_league_tier_check', { check: tierCheck('tier') });
  pgm.addConstraint('user_league', 'user_league_peak_tier_check', { check: `peak_tier IS NULL OR ${tierCheck('peak_tier')}` });
  pgm.addConstraint('league_cohorts', 'league_cohorts_tier_check', { check: tierCheck('tier') });
  pgm.addConstraint('league_members', 'league_members_tier_check', { check: tierCheck('tier') });

  pgm.addColumns('user_league', {
    season_key: { type: 'text' },
  });
  pgm.sql(`UPDATE user_league SET season_key = to_char(now() AT TIME ZONE 'UTC', 'YYYY-"Q"Q')`);
  // a row written without one belongs to the season it was written in
  pgm.alterColumn('user_league', 'season_key', {
    notNull: true,
    default: pgm.func(`to_char(now() AT TIME ZONE 'UTC', 'YYYY-"Q"Q')`),
  });

  pgm.addColumns('league_cohorts', {
    xp_band: { type: 'smallint', notNull: true, default: 0 },
    tz_offset_min: { type: 'smallint', notNull: true, default: 0 },
    member_count: { type: 'integer', notNull: true, default: 0 },
    merged_into: { type: 'uuid', references: 'league_cohorts', onDelete: 'SET NULL' },
    settled_at: { type: 'timestamptz' },
  });
  pgm.sql(`UPDATE league_cohorts c SET member_count = (SELECT count(*) FROM league_members m WHERE m.cohort_id = c.id)`);
  pgm.addConstraint('league_cohorts', 'league_cohorts_member_count_check', { check: 'member_count >= 0' });
  pgm.createIndex('league_cohorts', ['week_key', 'tier', 'settled', 'member_count']);

  pgm.addColumns('league_members', {
    // when they were told this week's goal is met ("safe"), so it is said once
    safe_notified_at: { type: 'timestamptz' },
  });
  // a learner's own earlier weeks, for the settle-first join
  pgm.createIndex('league_members', ['user_id', 'week_key']);

  pgm.createTable('league_weeks', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    week_key: { type: 'text', notNull: true },
    mode: { type: 'text', notNull: true, check: `mode IN ('league', 'personal')` },
    cohort_id: { type: 'uuid', references: 'league_cohorts', onDelete: 'SET NULL' },
    tier: { type: 'text', check: `tier IS NULL OR ${tierCheck('tier')}` },
    tier_after: { type: 'text', check: `tier_after IS NULL OR ${tierCheck('tier_after')}` },
    outcome: { type: 'text', check: `outcome IS NULL OR outcome IN ('promoted', 'demoted', 'stayed')` },
    rank: { type: 'integer' },
    group_size: { type: 'integer' },
    weekly_xp: { type: 'integer', notNull: true },
    goal_xp: { type: 'integer', notNull: true },
    goal_met: { type: 'boolean', notNull: true },
    trophy: { type: 'boolean', notNull: true, default: false },
    gems: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    // claimed before the result notification is sent, so it is sent at most once
    notified_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('league_weeks', 'league_weeks_pkey', { primaryKey: ['user_id', 'week_key'] });
  pgm.createIndex('league_weeks', ['week_key']);

  pgm.createTable('league_runs', {
    kind: { type: 'text', notNull: true, check: `kind IN ('settle', 'merge')` },
    // settle: the week that has just begun (it settles every week before it);
    // merge: the week whose small groups are merged
    week_key: { type: 'text', notNull: true },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
    attempts: { type: 'integer', notNull: true, default: 1 },
    last_error: { type: 'text' },
    result: { type: 'jsonb', notNull: true, default: '{}' },
  });
  pgm.addConstraint('league_runs', 'league_runs_pkey', { primaryKey: ['kind', 'week_key'] });

  pgm.sql(`UPDATE gem_rules SET amount = 10, updated_at = now() WHERE key = 'league_promotion'`);
};

export const down = (pgm) => {
  pgm.sql(`UPDATE gem_rules SET amount = 25, updated_at = now() WHERE key = 'league_promotion'`);
  pgm.dropTable('league_runs');
  pgm.dropTable('league_weeks');
  pgm.dropIndex('league_members', ['user_id', 'week_key']);
  pgm.dropColumns('league_members', ['safe_notified_at']);
  pgm.dropIndex('league_cohorts', ['week_key', 'tier', 'settled', 'member_count']);
  pgm.dropConstraint('league_cohorts', 'league_cohorts_member_count_check');
  // members of merged groups go back to no group of their own: the history of
  // a week that was merged is the merged group's
  pgm.dropColumns('league_cohorts', ['xp_band', 'tz_offset_min', 'member_count', 'merged_into', 'settled_at']);
  pgm.dropColumns('user_league', ['season_key']);
  pgm.dropConstraint('league_members', 'league_members_tier_check');
  pgm.dropConstraint('league_cohorts', 'league_cohorts_tier_check');
  pgm.dropConstraint('user_league', 'user_league_peak_tier_check');
  pgm.dropConstraint('user_league', 'user_league_tier_check');
  pgm.alterColumn('user_league', 'tier', { default: 'bronze' });
  pgm.alterColumn('user_league', 'peak_tier', { default: 'bronze' });
  const toOld = (column) => mapSql(column, BACK, column);
  pgm.sql(`UPDATE user_league SET tier = ${toOld('tier')},
             peak_tier = CASE WHEN peak_tier IS NULL THEN NULL ELSE ${toOld('peak_tier')} END`);
  pgm.sql(`UPDATE league_cohorts SET tier = ${toOld('tier')}`);
  pgm.sql(`UPDATE league_members SET tier = ${toOld('tier')}`);
};
