-- Least-privilege application role for the local/self-host stack (production
-- security). Runs once, as the superuser, when the Postgres data directory is
-- first initialized (docker-entrypoint-initdb.d) — connected to POSTGRES_DB
-- (kurda), BEFORE migrations run.
--
--   migrate service  -> connects as the superuser `postgres` (owner + DDL)
--   api / worker      -> connect as `kurda_app` (DML only; no DDL/roles/superuser)
--
-- Administrative ownership (postgres) is kept separate from the runtime role
-- (kurda_app). Partition maintenance still works because ensure_partitions() is
-- SECURITY DEFINER (migration 1751000087000): it runs as its owner and does the
-- CREATE TABLE, while kurda_app only needs EXECUTE on it.
--
-- The local password mirrors the postgres/postgres convention in
-- docker-compose.yml and is NOT a real secret. For a managed/production DB,
-- create this role out-of-band with a secret password and point the app at it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kurda_app') THEN
    CREATE ROLE kurda_app LOGIN PASSWORD 'kurda_app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE kurda TO kurda_app;
GRANT USAGE ON SCHEMA public TO kurda_app;

-- Runtime DML only. No CREATE/DROP/ALTER, no role management, no superuser.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kurda_app;
-- bigserial/identity inserts (e.g. player_ratings) need the sequence.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kurda_app;
-- EXECUTE to call helpers such as ensure_partitions() (itself SECURITY DEFINER).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kurda_app;

-- Objects the migrator (postgres) creates afterwards — and partitions created at
-- runtime by ensure_partitions() (owner = postgres) — auto-grant to the app role,
-- so no re-grant step is needed after each migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kurda_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kurda_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO kurda_app;
