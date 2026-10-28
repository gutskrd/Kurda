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
#
# Node loads tsx itself (`--import tsx`) rather than through `npx tsx`, which
# kept two more Node processes alive beside the server for as long as it ran:
# npm's own, waiting on the tsx command line, and that one, waiting on the
# server. Measured locally they were about 37 MB of the container's memory
# between them, on a plan with 512 MB, and did nothing but pass signals on —
# which the server handles itself (server.ts), now that it is the process the
# platform signals.
set -e
npm run migrate:up --workspace api
cd api
exec node --import tsx src/server.ts
