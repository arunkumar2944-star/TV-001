# ---------------------------------------------------------------------------
# Trichy Vision API
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app
COPY package*.json ./
# Optional deps (the AWS SDK) are skipped unless STORAGE_DRIVER=s3 is used.
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund

# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# Small init so SIGTERM reaches Node and shutdown stays clean.
RUN apk add --no-cache tini curl

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY sql ./sql
COPY scripts ./scripts

# Local media storage. Mount a volume here (or switch to STORAGE_DRIVER=s3)
# so originals survive container rebuilds.
RUN mkdir -p /app/storage/uploads && chown -R node:node /app

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
