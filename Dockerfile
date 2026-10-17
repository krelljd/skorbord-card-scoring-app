# syntax=docker/dockerfile:1

# --- Stage 1: build the React frontend ---------------------------------------
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
# vite.config.js bakes the production API URL in only when NODE_ENV=production.
RUN NODE_ENV=production npm run build

# --- Stage 2: API dependencies (better-sqlite3 is a native module) -----------
FROM node:22-bookworm-slim AS api-deps
WORKDIR /build/api
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 3: runtime --------------------------------------------------------
FROM node:22-bookworm-slim
# sqlite3 CLI is for backups (`.backup`) and deployment/add-sqid.sh.
RUN apt-get update \
 && apt-get install -y --no-install-recommends sqlite3 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data \
 && chown node:node /data

ENV NODE_ENV=production \
    PORT=2525 \
    DATABASE_URL=sqlite:////data/cards-sqlite.db

WORKDIR /app/api
COPY --from=api-deps --chown=node:node /build/api/node_modules ./node_modules
COPY --chown=node:node api/ ./
COPY --from=frontend --chown=node:node /build/app/dist ./app/dist

USER node
VOLUME /data
EXPOSE 2525

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2525)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, then start the server (exec so signals reach node).
CMD ["sh", "-c", "npm run migrate && exec node index.js"]
