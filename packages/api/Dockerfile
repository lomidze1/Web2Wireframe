# === Stage 1: Builder ===
FROM node:18-slim AS builder
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

# Install dependencies
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY scripts scripts
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/browser-extension/src/content packages/browser-extension/src/content
COPY packages/browser-extension/tsconfig.json packages/browser-extension/tsconfig.json
RUN pnpm --filter @w2w/shared build
RUN pnpm --filter @w2w/api build

# === Stage 2: Runtime ===
FROM node:18-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/api/dist packages/api/dist

ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV API_PORT=3002
EXPOSE 3002

CMD ["node", "packages/api/dist/index.js"]
