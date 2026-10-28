/**
 * ensure_partitions() runs as its owner (SECURITY DEFINER, 1751000087000) so
 * that a least-privileged application role can still create next month's
 * partitions. It also took any table and any retention, so whoever could call
 * it could have it drop any partitioned table's children, this month's
 * included, with the owner's rights rather than their own.
 *
 * The app only ever asks it about two tables and never to drop anything
 * (app.ts's daily sweep passes no retention), and the tests drop only months
 * long past. So it now refuses any other table, a retention under one month
 * and a reach ahead beyond two years — the body is otherwise the same.
 */

const BODY = `(tbl regclass, months_ahead int DEFAULT 3, retain_months int DEFAULT NULL)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      base_name text := tbl::text;
      m date;
      part text;
      lo text;
      hi text;
      child record;
      cutoff date;
    BEGIN
      %GUARD%
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
    $$;`;

const GUARD = `IF tbl NOT IN ('notifications'::regclass, 'rhyme_games'::regclass) THEN
        RAISE EXCEPTION 'ensure_partitions: % is not a table it looks after', tbl;
      END IF;
      IF months_ahead IS NULL OR months_ahead < 0 OR months_ahead > 24 THEN
        RAISE EXCEPTION 'ensure_partitions: months_ahead must be 0 to 24';
      END IF;
      IF retain_months IS NOT NULL AND retain_months < 1 THEN
        RAISE EXCEPTION 'ensure_partitions: retain_months must be at least 1';
      END IF;`;

export const up = (pgm) => {
  pgm.sql(`CREATE OR REPLACE FUNCTION ensure_partitions${BODY.replace('%GUARD%', GUARD)}`);
};

export const down = (pgm) => {
  pgm.sql(`CREATE OR REPLACE FUNCTION ensure_partitions${BODY.replace('%GUARD%', '')}`);
};
