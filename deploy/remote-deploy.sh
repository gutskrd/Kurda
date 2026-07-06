#!/usr/bin/env bash
# Runs ON the staging host (piped over SSH by deploy.yml).
# Expects: IMAGE, TAG env vars; /opt/kurda/.env with DATABASE_URL/REDIS_URL;
#          /opt/kurda/compose.yml (template: deploy/staging-compose.yml).
set -euo pipefail

cd /opt/kurda
echo "Deploying $IMAGE:$TAG"

docker pull "$IMAGE:$TAG"

# Migrations run BEFORE the app is switched over; a failure aborts the
# deploy and the currently running version keeps serving.
echo "Running migrations..."
docker run --rm --env-file /opt/kurda/.env --network kurda_default \
  "$IMAGE:$TAG" npm run migrate:up --workspace api

echo "Starting services..."
IMAGE="$IMAGE" TAG="$TAG" docker compose -f compose.yml up -d --no-build api worker

# remember the tag for quick reference during incident response
echo "$TAG" > /opt/kurda/CURRENT_TAG
echo "Deployed $IMAGE:$TAG"
