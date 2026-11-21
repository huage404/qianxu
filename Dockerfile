# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN npm i -g pnpm@10.20.0
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/extension/package.json ./apps/extension/
COPY packages/shared/package.json ./packages/shared/
# 此时源码未就位，跳过 wxt prepare 等 postinstall，构建阶段再按需执行
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm --filter web build

FROM build AS ext-build
ARG WXT_SITE_ORIGINS
RUN test -n "$WXT_SITE_ORIGINS" || (echo "缺少 WXT_SITE_ORIGINS，例：--build-arg WXT_SITE_ORIGINS=https://你的域名" && exit 1)
ENV WXT_SITE_ORIGINS=${WXT_SITE_ORIGINS}
RUN pnpm --filter extension exec wxt prepare \
 && pnpm --filter extension zip

FROM scratch AS ext
COPY --from=ext-build /repo/apps/extension/.output /ext

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
