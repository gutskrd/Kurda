/**
 * Local development Postgres via embedded-postgres — a self-contained
 * Postgres server with no system install or Docker. Keeps running until
 * interrupted. Connection string:
 *
 *   postgres://postgres:postgres@localhost:5433/kurda
 *
 * The data dir (api/.pgdata) is gitignored and persists across restarts.
 * Production/staging use a real managed Postgres (KUR-008); this is a
 * dev convenience only.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.pgdata');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
});

if (!existsSync(dataDir)) {
  console.log('Initialising Postgres data directory...');
  await pg.initialise();
}

await pg.start();
// Create as UTF8 from template0 — on Windows the cluster defaults to
// WIN1252, which can't store Kurdish characters (ê î û ç ş) used in
// schema constraints. template0 allows the encoding override.
const client = pg.getPgClient();
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = 'kurda'");
if (exists.rowCount === 0) {
  await client.query(
    "CREATE DATABASE kurda ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'",
  );
  console.log('Created database "kurda" (UTF8).');
}
await client.end();

console.log('Postgres ready on postgres://postgres:postgres@localhost:5433/kurda');

const shutdown = async () => {
  console.log('Stopping Postgres...');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// keep the process (and the server) alive
await new Promise(() => {});
