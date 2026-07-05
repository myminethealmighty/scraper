# Job Aggregator & Scraper

A production-minded TypeScript monorepo that scrapes developer jobs, deduplicates them, stores them in MySQL with Prisma, sends optional Telegram/Discord notifications, and exposes a Next.js dashboard plus REST API.

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
4. Each scraper searches every configured keyword.
5. API-based sources use Axios/fetch-style requests; static pages use Cheerio; dynamic pages use Playwright.
6. Each result is validated as a `RawJob`.
7. `packages/database` normalizes technologies, creates a duplicate fingerprint, and upserts into MySQL.
8. Deduplication uses either `applyUrl` or `company + title + location`.
9. Newly created jobs are sent to the configured notifier.
10. `apps/dashboard` reads jobs, filters, and stats from MySQL through REST routes and server-rendered UI.

## Features

- Scrapes multiple sources with one scraper class per website.
- Uses direct APIs for Remotive and Arbeitnow, Cheerio for Remote OK, JobNet, and Alote, and Playwright for JobSpace, LinkedIn, JobsDB, and We Work Remotely.
- Searches React, Next.js, Laravel, PHP, TypeScript, Node.js, Frontend, Front End, Backend, Back End, Full Stack, Software Developer, and Software Engineer by default.
- Extracts title, company, location, salary, employment type, work mode, dates, description, technologies, apply URL, and source.
- Normalizes technologies such as `ReactJS` to `React` and `NodeJS` to `Node.js`.
- Deduplicates by `applyUrl` or company + title + location fingerprint.
- Schedules hourly scraping with `node-cron`.
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

## REST API

- `GET /api/jobs`
- `GET /api/jobs?q=React&workMode=REMOTE&technology=TypeScript&status=NEW&favorite=true`
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

## Current Sources

- Remotive
- Arbeitnow
- JobSpace Myanmar
- JobNet Myanmar
- Alote Myanmar
- LinkedIn public jobs search
- JobsDB Thailand
- JobsDB Singapore
- Remote OK
- We Work Remotely

LinkedIn and JobsDB can challenge or block automated traffic. Their scrapers are best-effort and isolated, so failures are logged into `ScrapeRun` without stopping the other sources.

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
# scrapper
