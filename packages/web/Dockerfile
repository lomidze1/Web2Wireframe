# === Stage 1: Builder ===
FROM node:18-slim AS builder
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile --filter @w2w/web

COPY packages/web packages/web
RUN cd packages/web && pnpm build

# === Stage 2: nginx ===
FROM nginx:alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/web/dist/client /usr/share/nginx/html
EXPOSE 80
