# Kurda API + worker image. One image, two commands:
#   API    (default): npx tsx api/src/server.ts
#   worker:           npx tsx api/src/workers/main.ts
# tsx is declared at the workspace ROOT (see root package.json) so npm hoists it
# to /app/node_modules/.bin — required because these commands run `npx tsx` from
# /app. As only an api dependency it nests under api/node_modules and a
# root-level `npx tsx` can't find it (exit 127). TS runs via tsx for now;
# a compiled/bundled build is a later optimization (tracked under KUR-113).

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# install with just the manifests so Docker layer-caches dependencies
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY shared/package.json shared/
COPY admin/package.json admin/
COPY mobile/package.json mobile/
RUN npm ci --omit=dev

COPY shared/ shared/
COPY api/ api/

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

EXPOSE 3000

# run as the non-root user provided by the node image
USER node

CMD ["npx", "tsx", "api/src/server.ts"]
