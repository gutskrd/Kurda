/**
 * Hot-table partitioning (KUR-115) — notifications by month, + the in-repo
 * `ensure_partitions()` lifecycle function (no pg_partman / pg_cron dependency).
 *
 * SAFETY: this is a STRUCTURAL migration intended to run while the table is
 * empty/tiny (pre-launch). It creates a partitioned twin, copies the CURRENT rows
 * (a bounded, near-instant copy — NOT a production-scale backfill), then swaps.
 * Postgres can't convert a table to partitioned in place, hence the twin. Do NOT
 * apply this pattern to a large populated table via migrate:up — see
 * docs/scaling/partitioning.md for the online/backfill procedure for that case.
 *
 * notifications is the clean first candidate: PK is `id` alone with no other unique
 * constraint, so the only change is a composite PK (id, created_at) that Postgres
 * requires on a partitioned table. No guarantee is weakened. xp_ledger is
 * deliberately left unpartitioned (its UNIQUE(source, ref_id) double-award guard
 * must stay intact).
 */

export const up = (pgm) => {
  // 1) move the existing table aside (its indexes/PK travel with it, keeping their
  //    names — so we recreate the new table's indexes only AFTER dropping it).
  pgm.sql(`ALTER TABLE notifications RENAME TO notifications_pre_partition`);

  // 2) the partitioned twin — no PK/indexes yet (avoids name collisions with the
  //    renamed original until it's dropped). Columns mirror the original exactly.
  pgm.sql(`
    CREATE TABLE notifications (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz
    ) PARTITION BY RANGE (created_at)
  `);

  // 3) a DEFAULT partition catches any historical row and guarantees an insert
  //    never fails for lack of a matching partition.
  pgm.sql(`CREATE TABLE notifications_default PARTITION OF notifications DEFAULT`);

  // 4) the lifecycle function: create current + N months ahead (idempotent), and
  //    optionally drop monthly partitions older than a retention window. Never
  //    touches the DEFAULT partition; only well-formed `<tbl>_YYYY_MM` children.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION ensure_partitions(tbl regclass, months_ahead int DEFAULT 3, retain_months int DEFAULT NULL)
    RETURNS void
    LANGUAGE plpgsql AS $$
    DECLARE
      base_name text := tbl::text;
      m date;
      part text;
      lo text;
      hi text;
      child record;
      cutoff date;
    BEGIN
      FOR i IN 0..months_ahead LOOP
        m := (date_trunc('month', now()) + make_interval(months => i))::date;
        part := base_name || '_' || to_char(m, 'YYYY_MM');
        lo := to_char(m, 'YYYY-MM-DD');
        hi := to_char((m + interval '1 month'), 'YYYY-MM-DD');
        EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', part, base_name, lo, hi);
      END LOOP;

      IF retain_months IS NOT NULL THEN
        cutoff := (date_trunc('month', now()) - make_interval(months => retain_months))::date;
        FOR child IN
          SELECT c.relname
          FROM pg_inherits i
          JOIN pg_class c ON c.oid = i.inhrelid
          WHERE i.inhparent = tbl
            AND c.relname ~ ('^' || base_name || '_[0-9]{4}_[0-9]{2}$')
        LOOP
          IF to_date(right(child.relname, 7), 'YYYY_MM') < cutoff THEN
            EXECUTE format('DROP TABLE IF EXISTS %I', child.relname);
          END IF;
        END LOOP;
      END IF;
    END;
    $$;
  `);

  // 5) create current + upcoming month partitions so this-month rows land in a
  //    real monthly partition (not the default).
  pgm.sql(`SELECT ensure_partitions('notifications')`);

  // 6) copy the CURRENT (empty/tiny) rows, then drop the original. Bounded to the
  //    present size — safe now; never run against a large table.
  pgm.sql(`
    INSERT INTO notifications (id, user_id, category, title, body, data, created_at, read_at)
    SELECT id, user_id, category, title, body, data, created_at, read_at FROM notifications_pre_partition
  `);
  pgm.sql(`DROP TABLE notifications_pre_partition`);

  // 7) now the old names are free — add the composite PK + the original indexes.
  pgm.sql(`ALTER TABLE notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id, created_at)`);
  pgm.sql(`CREATE INDEX notifications_user_id_created_at_index ON notifications (user_id, created_at)`);
  pgm.sql(`CREATE INDEX notifications_unread ON notifications (user_id) WHERE read_at IS NULL`);
};

export const down = (pgm) => {
  // collapse back to a plain (non-partitioned) table — safe while tiny.
  pgm.sql(`ALTER TABLE notifications RENAME TO notifications_partitioned`);
  pgm.sql(`
    CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz
    )
  `);
  pgm.sql(`
    INSERT INTO notifications (id, user_id, category, title, body, data, created_at, read_at)
    SELECT id, user_id, category, title, body, data, created_at, read_at FROM notifications_partitioned
  `);
  pgm.sql(`DROP TABLE notifications_partitioned`); // drops the parent + all child partitions
  pgm.sql(`CREATE INDEX notifications_user_id_created_at_index ON notifications (user_id, created_at)`);
  pgm.sql(`CREATE INDEX notifications_unread ON notifications (user_id) WHERE read_at IS NULL`);
  pgm.sql(`DROP FUNCTION IF EXISTS ensure_partitions(regclass, int, int)`);
};
