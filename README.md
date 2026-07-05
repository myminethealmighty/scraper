# Job Scraper

A production-minded TypeScript monorepo for scraping configured job sources, matching configured search terms, deduplicating results, storing them in MySQL with Prisma, sending optional Telegram/Discord notifications, and exposing a Next.js dashboard plus REST API.

## Architecture

```text
apps/
  dashboard/   Next.js dashboard and REST API
  scraper/     One-shot CLI scraper
  worker/      node-cron scheduler

packages/
  database/     Prisma MySQL schema, migrations, repositories
  scraper-core/ Scraper interface, orchestration, sample scrapers
  parsers/      Cheerio parsing helpers
  notifier/     Telegram, Discord, noop notifiers
  shared/       Zod config, types, logging, normalization utilities
```

## How It Operates

1. `apps/worker` or `apps/scraper` starts a scrape run.
2. `packages/shared` validates environment variables with Zod and creates the Pino logger.
3. `packages/scraper-core` loads all registered scrapers from `registry.ts`.
4. Each scraper searches the configured keywords, roles, or domain terms.
5. API-based sources use Axios/fetch-style requests; static pages use Cheerio; dynamic pages use Playwright.
6. Each result is validated as a `RawJob`.
7. `packages/database` normalizes technologies, creates a duplicate fingerprint, and upserts into MySQL.
8. Deduplication uses either `applyUrl` or `company + title + location`.
9. Newly created jobs are sent to the configured notifier.
10. `apps/dashboard` reads jobs, filters, and stats from MySQL through REST routes and server-rendered UI.

## Features

- Scrapes multiple sources with one scraper class per website.
- Supports source adapters that can use direct APIs, Cheerio for static HTML, or Playwright for dynamic pages.
- Searches terms from configuration, so the same scraper pipeline can target different roles, industries, skills, or descriptions without changing core code.
- Extracts title, company, location, salary, employment type, work mode, dates, description, tags/technologies, apply URL, and source.
- Normalizes common tags and technology names such as `ReactJS` to `React` and `NodeJS` to `Node.js`.
- Deduplicates by `applyUrl` or company + title + location fingerprint.
- Schedules daily scraping at noon by default with `node-cron`.
- Sends notifications for newly created jobs through Telegram or Discord.
- Includes dashboard search, filters, saved/applied/favorite state, and statistics.
- Uses Zod validation, Pino structured logging, retries, rate limiting, Docker, and Prisma migrations.

## Local MySQL Setup

This project is configured for your local MySQL server on port `3306`, which you can manage from MySQL Workbench. Prisma connects over TCP, so use `127.0.0.1` in `DATABASE_URL`.

1. Open MySQL Workbench and connect to your local server.
2. Create the database:

```sql
CREATE DATABASE job_aggregator CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. Copy env values:

```bash
cp .env.example .env
```

4. Edit `.env` and set the MySQL credentials you use in Workbench:

```env
DATABASE_URL="mysql://root:your_password@127.0.0.1:3306/job_aggregator"
```

If your MySQL user has no password, use:

```env
DATABASE_URL="mysql://root@127.0.0.1:3306/job_aggregator"
```

## Start Locally

Install dependencies:

```bash
npm install
```

Apply the Prisma migration to your local MySQL database:

```bash
npm run db:migrate
```

Run a one-shot scrape:

```bash
npm run scrape
```

Start the dashboard:

```bash
npm run dev
```

Open `http://localhost:3000`.

Run the scheduled worker in another terminal:

```bash
npm run dev:worker
```

## Docker

Docker Compose uses the MySQL connection from .env. On production, this points to the existing host MySQL server through host.docker.internal.

```bash
cp .env.example .env
docker compose up --build
```

Inside Docker, services read .env; keep real credentials out of git. On the Ubuntu server, keep the file at /var/www/scraper/.env.

For local development with your Workbench database, prefer the non-Docker flow above.

For Ubuntu server production deployment with existing Nginx apps, use the main docker-compose.yml file plus your server .env.

For local Docker testing against your existing local MySQL, use:

```text
DOCKER_LOCAL_TEST.md
docker-compose.local.yml
```

For Docker command and GitHub CI/CD cheat sheet, use:

```text
DOCKER_AND_GITHUB_COMMANDS.md
```

### Production Docker Notes

The production image contains the Node.js runtime, installed npm dependencies, compiled TypeScript packages, the built Next.js dashboard, worker/scraper code, Prisma client, Playwright system dependencies, and the Playwright Chromium browser files. It does not contain MySQL data. Production MySQL runs on the host and is reached through `host.docker.internal:3306`.

Docker build cache is safe to keep. It does not hide old UI or source code: Docker invalidates the source/build layer when files under `apps/` or `packages/` change. The expensive cached layers are dependency install and Playwright browser install.

Small code or UI changes should usually rebuild much faster after the first cache-friendly build. Builds become slow again when `package.json`, `package-lock.json`, `Dockerfile`, the Node base image, or the Playwright version changes, or after clearing Docker build cache.

Useful production commands:

```bash
cd /var/www/scraper

# Current scraper containers
docker compose ps

# Rebuild and restart this project
docker compose up -d --build

# Run migrations
docker compose exec dashboard npm run db:migrate

# Watch logs
docker compose logs -f --tail=100 dashboard
docker compose logs -f --tail=100 worker

# Run one manual scrape in a disposable container
docker compose run --rm --no-deps worker npm run scrape

# Show Docker disk usage
docker system df
docker builder du

# Remove unused build cache only
docker builder prune
```

Avoid `docker system prune -a` on the VPS unless you have checked other Docker projects first.

### Clear Production Job Data And Test One Scrape

This keeps the schema and migrations but deletes collected jobs and scrape history:

```sql
USE job_aggregator;

SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE JobTechnology;
TRUNCATE TABLE Job;
TRUNCATE TABLE ScrapeRun;
SET FOREIGN_KEY_CHECKS=1;
```

Then run one scrape and watch logs:

```bash
cd /var/www/scraper
docker compose run --rm --no-deps worker npm run scrape
docker compose logs -f --tail=150 worker
curl http://127.0.0.1:3010/api/stats
```


## REST API

- `GET /api/jobs`
- `GET /api/jobs?q=remote&workMode=REMOTE&technology=TypeScript&status=NEW&favorite=true`
- `GET /api/jobs/:id`
- `PATCH /api/jobs/:id`
- `GET /api/stats`

Patch body:

```json
{
  "status": "APPLIED",
  "favorite": true
}
```

## Notifications

Disable notifications:

```env
NOTIFIER_PROVIDER="none"
```

Telegram:

```env
NOTIFIER_PROVIDER="telegram"
TELEGRAM_BOT_TOKEN="..."
TELEGRAM_CHAT_ID="..."
```

Test Telegram delivery:

```bash
npm run notify:test
```

Discord:

```env
NOTIFIER_PROVIDER="discord"
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```


## Notification Timing

New-job notifications can be sent in three ways:

```env
NOTIFIER_TIMING="batch"   # send whenever enough new jobs are collected
NOTIFIER_BATCH_SIZE="10"  # send one notification per 10 new jobs
NOTIFIER_TIME_ZONE="Asia/Yangon" # Myanmar time, UTC+06:30
SCRAPER_TIME_ZONE="Asia/Yangon"  # cron schedule timezone, UTC+06:30
SCRAPER_MAX_JOB_AGE_DAYS="92" # skip jobs posted more than about 3 months ago when posted date is known
```

`batch` is the default because long scrapes can create many jobs. It sends each full batch of `NOTIFIER_BATCH_SIZE` new jobs while the scrape continues, then sends any remaining new jobs at the end. Jobs without a posted date are kept because the scraper cannot prove they are older than the configured age window.

## Add A New Job Site

Create a scraper in `packages/scraper-core/src/scrapers`:

```ts
import type { RawJob } from "@job-aggregator/shared";
import type { ScrapeContext, Scraper } from "../types.js";

export class ExampleScraper implements Scraper {
  readonly name = "Example";
  readonly mode = "api" as const;

  async search(context: ScrapeContext): Promise<RawJob[]> {
    return [];
  }
}
```

Then register it in `packages/scraper-core/src/registry.ts`.

## Source Adapters

The scraper layer is adapter-based. Each source implements the same `Scraper` interface, so additional job boards can be added without changing the orchestration, persistence, dashboard, or notification code.

The repository includes several bundled adapters as examples, covering API-based sources, static HTML parsing, and Playwright-driven dynamic pages. Some public job boards may challenge, rate-limit, or block automated traffic; scraper failures are isolated and logged into `ScrapeRun` without stopping other sources.

## Database Notes

The Prisma schema lives at:

```text
packages/database/prisma/schema.prisma
```

The initial MySQL migration lives at:

```text
packages/database/prisma/migrations/000001_init/migration.sql
```

MySQL does not support Prisma scalar lists, so `Job.technologies` is stored as JSON. The repository layer converts it back to `string[]` before returning jobs to the dashboard/API.

## Useful Commands

```bash
npm run dev              # dashboard
npm run dev:worker       # scheduled worker
npm run notify:test      # send a test notification
npm run scrape           # one-shot scrape
npm run build            # build all workspaces
npm run typecheck        # typecheck all workspaces
npm run db:generate      # generate Prisma client
npm run db:migrate       # apply migrations
npm run db:studio        # open Prisma Studio
npm audit --omit=dev     # dependency audit
```

