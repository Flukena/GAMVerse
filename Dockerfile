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
    && pnpm --filter @gammyverse/server build \
    && pnpm --filter @gammyverse/client exec vite build

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
RUN pnpm install --prod --frozen-lockfile --filter @gammyverse/server...
COPY --from=build /workspace/packages/server/dist ./packages/server/dist
COPY --from=build /workspace/packages/server/migrations ./packages/server/migrations
WORKDIR /app/packages/server
RUN mkdir -p data
USER node
EXPOSE 2567 2568
CMD ["node", "dist/index.js"]
