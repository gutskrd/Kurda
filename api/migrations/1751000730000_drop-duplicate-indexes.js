/**
 * Indexes whose columns are the leading columns of another btree index on the same table, which serves every query
 * they could: each one only cost writes and space. Dropped CONCURRENTLY, outside a transaction, so writes go on
 * during the deploy.
 */

/** Each dropped index with the definition `down` builds again. */
const DUPLICATES = [
  // the primary key is (day, user_id)
  ['user_activity_days_day_index', 'user_activity_days (day)'],
  // the primary key is (event_id, user_id)
  ['activity_congrats_event_id_index', 'activity_congrats (event_id)'],
  // league_cohorts_week_key_tier_settled_member_count_index leads with both
  ['league_cohorts_week_key_tier_index', 'league_cohorts (week_key, tier)'],
  // the same columns as the unique seasons_user_season_unique
  ['seasons_user_id_season_key_index', 'seasons (user_id, season_key)'],
  // tournament_matches_slot_unique is (tournament_id, round, slot)
  ['tournament_matches_tournament_id_round_index', 'tournament_matches (tournament_id, round)'],
  // event_quest_claims_unique is (user_id, event_key, quest_id)
  ['event_quest_claims_user_id_event_key_index', 'event_quest_claims (user_id, event_key)'],
  // user_tags_uniq is (user_id, tag_id)
  ['user_tags_user_id_index', 'user_tags (user_id)'],
];

export const up = (pgm) => {
  pgm.noTransaction();
  for (const [name] of DUPLICATES) pgm.sql(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
};

export const down = (pgm) => {
  pgm.noTransaction();
  for (const [name, on] of DUPLICATES) pgm.sql(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${on}`);
};
