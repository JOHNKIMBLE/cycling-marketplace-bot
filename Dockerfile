# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app

ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="cycling-marketplace-bot" \
      org.opencontainers.image.description="Discord bot for shared cycling marketplace sync and per-server Strava features" \
      org.opencontainers.image.source="https://github.com/johnkimble/cycling-marketplace-bot" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"

RUN apk add --no-cache tini wget \n && rm -rf /usr/local/lib/node_modules/npm \n            /usr/local/bin/npm /usr/local/bin/npx

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src

RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production \
    STRAVA_OAUTH_HOST=0.0.0.0 \
    STRAVA_OAUTH_PORT=3049 \
    DATA_FILE=/app/data/marketplace-state.json

USER node
EXPOSE 3049

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3049/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
