/**
 * A local development Postgres, embedded, with no system install; runs until interrupted. The data dir (api/.pgdata)
 * is ignored by git and persists across restarts.
 *
 *   postgres://postgres:postgres@localhost:5433/kurda
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
// Created as UTF8 from template0, since a Windows cluster defaults to WIN1252, which cannot store the Kurdish letters
// in schema constraints.
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
