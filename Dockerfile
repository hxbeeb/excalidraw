FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/excalidraw-frontend/package.json apps/excalidraw-frontend/package.json
COPY apps/http-backend/package.json apps/http-backend/package.json
COPY apps/ws-backend/package.json apps/ws-backend/package.json
COPY packages/backend-common/package.json packages/backend-common/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm turbo run build --filter=http-backend --filter=ws-backend --filter=excalidraw-frontend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app ./
RUN chmod +x docker-start.sh

USER nextjs
EXPOSE 3002
EXPOSE 3000
EXPOSE 8080
CMD ["./docker-start.sh"]
