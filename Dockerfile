FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,target=/root/.npm \
  npm ci --ignore-scripts --prefer-offline --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000
RUN npx playwright install --with-deps chromium

FROM deps AS build
ENV DATABASE_URL=mysql://job_user:job_password@mysql:3306/job_aggregator
RUN npm run build

FROM base AS dashboard
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/dashboard"]

FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["npm", "run", "start", "-w", "apps/worker"]
