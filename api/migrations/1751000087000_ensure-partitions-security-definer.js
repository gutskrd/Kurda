/**
 * Least-privilege prerequisite (production security): make ensure_partitions()
 * SECURITY DEFINER so partition creation runs as the function owner, not the
 * caller. The app calls this at runtime (api/src/app.ts daily sweep); once the
 * application connects as a least-privilege role without DDL rights, a plain
 * (INVOKER) function would fail its CREATE TABLE. `SET search_path` pins name
 * resolution so the elevated function can't be hijacked via a mutable path.
 *
 * SAFETY: CREATE OR REPLACE with the identical body — no data change, no schema
 * change beyond the function's security context.
 */

const BODY = `(tbl regclass, months_ahead int DEFAULT 3, retain_months int DEFAULT NULL)
    RETURNS void
    LANGUAGE plpgsql
    %SECURITY%
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

export const up = (pgm) => {
  pgm.sql(
    `CREATE OR REPLACE FUNCTION ensure_partitions${BODY}`.replace(
      '%SECURITY%',
      'SECURITY DEFINER\n    SET search_path = public, pg_temp',
    ),
  );
};

export const down = (pgm) => {
  // revert to the original INVOKER-rights definition
  pgm.sql(`CREATE OR REPLACE FUNCTION ensure_partitions${BODY}`.replace('%SECURITY%', ''));
};
