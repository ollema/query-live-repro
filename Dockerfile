FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml package.json .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm build

FROM base
WORKDIR /app
COPY --from=build /app/build build/
COPY package.json .
EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "build"]
