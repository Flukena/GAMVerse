FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @gammyverse/shared exec tsc --noEmit \
    && pnpm --filter @gammyverse/client exec tsc --noEmit \
    && pnpm --filter @gammyverse/client exec vite build

FROM caddy:2.10-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/packages/client/dist /srv
EXPOSE 80 443
