FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/scraper/package.json apps/scraper/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/notifier/package.json packages/notifier/package.json
COPY packages/parsers/package.json packages/parsers/package.json
COPY packages/scraper-core/package.json packages/scraper-core/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/root/.npm \
  npm ci --ignore-scripts --prefer-offline --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000
RUN npx playwright install --with-deps chromium

FROM deps AS build
ENV DATABASE_URL=mysql://job_user:job_password@mysql:3306/job_scraper
COPY apps ./apps
COPY packages ./packages
RUN npm run build

FROM build AS dashboard
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/dashboard"]

FROM build AS worker
ENV NODE_ENV=production
CMD ["npm", "run", "start", "-w", "apps/worker"]
