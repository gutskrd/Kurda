#!/bin/sh
# Container start command for the Kurda API (KUR-008).
#
# Runs the DB migrations, then hands the process off to the server. Kept as a
# script (rather than a shell chain in render.yaml's dockerCommand) because
# Render mangles inline `&&` chains — a single script path has no shell
# metacharacters for it to misparse. node-pg-migrate is idempotent, so the
# migrate step is a fast no-op once the schema is up to date.
#
# `tsx` is a production dependency of the api workspace, but npm installs it
# under api/node_modules (not hoisted to the repo root), so we cd into api
# before starting — otherwise `tsx` doesn't resolve from /app. `exec` replaces
# the shell so the server receives signals (graceful shutdown on SIGTERM).
set -e
npm run migrate:up --workspace api
cd api
exec npx tsx src/server.ts
