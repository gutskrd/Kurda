/**
 * Search that finds a name from any part of it, and forgives a typo.
 *
 * People and words were found by how they start: "ber" found "berserker" and
 * "serk" found nothing, and a display name was not searched at all. Finding
 * text in the middle of a value, or text that is nearly what was typed, is what
 * trigram indexes are for: pg_trgm splits a value into three-letter pieces, and
 * a GIN index over those answers `LIKE '%serk%'`, `ILIKE` and similarity (`%`)
 * without reading the table.
 *
 * Each index is over exactly the expression the search compares, folded the
 * way the existing prefix indexes fold (ê î û ç ş → e i u c s, lowercased), or
 * Postgres will not use it:
 *   - usernames and display names, for the people search (social/service.ts);
 *     only live accounts, since the search never asks for any other;
 *   - the dictionary's folded headword, for words containing the query and for
 *     the closest spellings when nothing matches (dictionary/search-service.ts);
 *   - English definitions, for English → Kurdish. Most imported senses have
 *     none, and leaving those rows out keeps the index small.
 *
 * The two over users skip the GIN pending list (fastupdate off): accounts
 * arrive one at a time, so a new one costs a little more to write, and a search
 * never has to read through a backlog of them that is not in the index yet.
 * The planner also needs to know how the folded names are spread, or it takes
 * every `LIKE '%…%'` for a match on most of the table and reads it all; a
 * statistics object over each expression tells it (Postgres 14+).
 *
 * Built CONCURRENTLY, so the old server keeps reading and writing these tables
 * while the new one migrates — a plain CREATE INDEX holds off every write to
 * the table until it finishes. That cannot run inside a transaction, hence
 * noTransaction(), and each statement is its own step. A concurrent build that
 * fails leaves an invalid index behind under its name, so each is dropped first
 * and a second run starts clean.
 */

const USERNAME = `translate(lower(username::text), 'êîûçş', 'eiucs')`;
const DISPLAY_NAME = `translate(lower(display_name), 'êîûçş', 'eiucs')`;

const STATISTICS = [
  ['users_username_folded_stats', USERNAME],
  ['users_display_name_folded_stats', DISPLAY_NAME],
];

const INDEXES = [
  ['users_username_trgm_idx', `users USING gin (${USERNAME} gin_trgm_ops) WITH (fastupdate = off) WHERE deleted_at IS NULL`],
  ['users_display_name_trgm_idx', `users USING gin (${DISPLAY_NAME} gin_trgm_ops) WITH (fastupdate = off) WHERE deleted_at IS NULL`],
  ['dict_entries_headword_folded_trgm_idx', `dict_entries USING gin (headword_folded gin_trgm_ops)`],
  ['dict_senses_definition_en_trgm_idx', `dict_senses USING gin (definition_en gin_trgm_ops) WHERE definition_en IS NOT NULL`],
];

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  for (const [name, on] of INDEXES) {
    pgm.sql(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
    pgm.sql(`CREATE INDEX CONCURRENTLY ${name} ON ${on}`);
  }
  for (const [name, expression] of STATISTICS) pgm.sql(`CREATE STATISTICS IF NOT EXISTS ${name} ON (${expression}) FROM users`);
  pgm.sql('ANALYZE users');
};

export const down = (pgm) => {
  pgm.noTransaction();
  for (const [name] of STATISTICS) pgm.sql(`DROP STATISTICS IF EXISTS ${name}`);
  for (const [name] of INDEXES) pgm.sql(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
  pgm.sql('DROP EXTENSION IF EXISTS pg_trgm');
};
