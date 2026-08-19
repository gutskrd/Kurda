/**
 * Hot-table partitioning (KUR-115) — rhyme_games by month on started_at. Reuses
 * the ensure_partitions() lifecycle from the notifications migration.
 *
 * SAFETY: structural, for the current empty/tiny table (create a partitioned twin →
 * bounded copy → swap). NOT a production-scale backfill — see
 * docs/scaling/partitioning.md. rhyme_games is clean: PK is `id` alone (no other
 * unique constraint, no inbound FK), so the only change is a composite PK
 * (id, started_at); no guarantee is weakened. The (user_id, status) index is
 * non-unique, so it needs no partition key.
 */

export const up = (pgm) => {
  pgm.sql(`ALTER TABLE rhyme_games RENAME TO rhyme_games_pre_partition`);

  pgm.sql(`
    CREATE TABLE rhyme_games (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode text NOT NULL DEFAULT 'training' CHECK (mode IN ('training')),
      dialect text NOT NULL DEFAULT 'kurmanci' CHECK (dialect IN ('kurmanci','sorani')),
      prompt text NOT NULL,
      window_ms integer NOT NULL,
      used_words jsonb NOT NULL DEFAULT '[]'::jsonb,
      score integer NOT NULL DEFAULT 0,
      accepted integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
      started_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz
    ) PARTITION BY RANGE (started_at)
  `);

  pgm.sql(`CREATE TABLE rhyme_games_default PARTITION OF rhyme_games DEFAULT`);

  // ensure_partitions() already exists (notifications migration); reuse it.
  pgm.sql(`SELECT ensure_partitions('rhyme_games')`);

  pgm.sql(`
    INSERT INTO rhyme_games (id, user_id, mode, dialect, prompt, window_ms, used_words, score, accepted, status, started_at, ended_at)
    SELECT id, user_id, mode, dialect, prompt, window_ms, used_words, score, accepted, status, started_at, ended_at
    FROM rhyme_games_pre_partition
  `);
  pgm.sql(`DROP TABLE rhyme_games_pre_partition`);

  pgm.sql(`ALTER TABLE rhyme_games ADD CONSTRAINT rhyme_games_pkey PRIMARY KEY (id, started_at)`);
  pgm.sql(`CREATE INDEX rhyme_games_user_id_status_index ON rhyme_games (user_id, status)`);
};

export const down = (pgm) => {
  pgm.sql(`ALTER TABLE rhyme_games RENAME TO rhyme_games_partitioned`);
  pgm.sql(`
    CREATE TABLE rhyme_games (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode text NOT NULL DEFAULT 'training' CHECK (mode IN ('training')),
      dialect text NOT NULL DEFAULT 'kurmanci' CHECK (dialect IN ('kurmanci','sorani')),
      prompt text NOT NULL,
      window_ms integer NOT NULL,
      used_words jsonb NOT NULL DEFAULT '[]'::jsonb,
      score integer NOT NULL DEFAULT 0,
      accepted integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
      started_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz
    )
  `);
  pgm.sql(`
    INSERT INTO rhyme_games (id, user_id, mode, dialect, prompt, window_ms, used_words, score, accepted, status, started_at, ended_at)
    SELECT id, user_id, mode, dialect, prompt, window_ms, used_words, score, accepted, status, started_at, ended_at
    FROM rhyme_games_partitioned
  `);
  pgm.sql(`DROP TABLE rhyme_games_partitioned`);
  pgm.sql(`CREATE INDEX rhyme_games_user_id_status_index ON rhyme_games (user_id, status)`);
};
