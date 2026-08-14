#!/bin/sh
# Container start command for the Kurda API (KUR-008).
#
# Runs the DB migrations, then hands the process off to the server. Kept as a
# script (rather than a shell chain in render.yaml's dockerCommand) because
# Render mangles inline `&&` chains — a single script path has no shell
# metacharacters for it to misparse. node-pg-migrate is idempotent, so the
# migrate step is a fast no-op once the schema is up to date.
set -e
npm run migrate:up --workspace api
exec npx tsx api/src/server.ts
