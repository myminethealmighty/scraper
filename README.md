# Job Scraper

[![Deploy](https://github.com/myminethealmighty/scrapper/actions/workflows/deploy.yml/badge.svg)](https://github.com/myminethealmighty/scrapper/actions/workflows/deploy.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Visitors](https://visitor-badge.laobi.icu/badge?page_id=myminethealmighty.scrapper)

A production-minded TypeScript monorepo for scraping supported job portals, storing normalized jobs in MySQL, deduplicating results, sending profile-based notifications, and viewing matches through a Next.js dashboard. The project is designed around source adapters, Prisma repositories, scheduled workers, and database-driven search profiles.

## Project Status

Job Scraper is actively evolving. The current version supports manual and scheduled profile-based scraping, Telegram subscriptions, MySQL persistence, Docker deployment, and a dashboard. Users choose supported portals and search terms from the bot; those database records drive scraper work.

## What It Does

- Scrapes supported job portals through adapter classes.
- Uses direct APIs where available, Cheerio for static HTML, and Playwright for dynamic pages.
- Stores normalized jobs in MySQL through Prisma.
- Deduplicates jobs by apply URL first, then by company/title/location fingerprint.
- Tracks scrape runs, created jobs, updated jobs, failures, and source history.
- Supports dashboard search, filters, details, saved/applied/favorite state, and statistics.
- Runs manually from the CLI or automatically through a scheduled worker.
- Sends profile-based Telegram notifications in batches and keeps notification history in MySQL.

## Architecture

```text
apps/
  dashboard/   Next.js dashboard and REST API
  scraper/     Manual one-shot scraper command
  worker/      node-cron scheduled worker

packages/
  database/     Prisma schema, migrations, repositories, profile helpers
  scraper-core/ Scraper interface, source registry, orchestration
  parsers/      Cheerio parsing helpers
  notifier/     Notification adapters
  shared/       Zod config, schemas, logging, shared utilities
```

## Runtime Flow

1. Telegram users start the bot and select supported portals plus search terms.
2. The app stores those choices in `TelegramUser`, `SearchProfile`, `SearchSource`, and `SearchTerm`.
3. The manual scraper or scheduled worker creates grouped scrape tasks by `sourceKey + normalizedValue`, so many users asking for the same source and term share one scrape.
4. Each adapter searches one source/term group and returns `RawJob[]` records.
5. Zod validates each raw job before persistence.
6. The database package cleans text, infers work mode where possible, deduplicates, and upserts jobs.
7. The orchestrator records scrape status in `ScrapeRun`, sends new-job batches to matching Telegram users, and writes `NotificationLog` rows to avoid duplicate delivery.
8. The dashboard reads the signed-in Telegram user's matching jobs and stats from MySQL.

## Supported Sources

Supported sources are defined in [packages/scraper-core/src/sources.ts](packages/scraper-core/src/sources.ts). Users should choose from these supported source keys instead of entering arbitrary URLs.

| Key | Source | Method |
| --- | --- | --- |
| `remotive` | Remotive | API |
| `jobspace_mm` | JobSpace Myanmar | Playwright |
| `jobnet_mm` | JobNet Myanmar | Cheerio |
| `alote_mm` | Alote Myanmar | Cheerio |
| `linkedin` | LinkedIn | Playwright |
| `jobsdb_th` | JobsDB Thailand | Playwright |
| `jobsdb_sg` | JobsDB Singapore | Playwright |
| `remote_ok` | Remote OK | Cheerio/API-style JSON page |
| `we_work_remotely` | We Work Remotely | Playwright |

This keeps scraping safer and more reliable than accepting random URLs. If arbitrary URLs are added later, they should be mapped to known adapters and checked against SSRF protections before any request is made.

## Configuration

Copy the example env file and edit it for your machine:

```bash
cp .env.example .env
```

Minimum local config:

```env
DATABASE_URL="mysql://root:password@127.0.0.1:3306/job_scraper"
SCRAPER_CRON="0 12 * * *"
SCRAPER_TIME_ZONE="Asia/Yangon"
SCRAPER_MAX_JOB_AGE_DAYS="92"
NOTIFIER_PROVIDER="none"
NEXT_PUBLIC_APP_NAME="Job Scraper"
```

If your local MySQL `root` user has no password, use:

```env
DATABASE_URL="mysql://root@127.0.0.1:3306/job_scraper"
```

Search terms are not configured through `.env`. Users add terms through the Telegram bot, and the scraper reads them from the `SearchTerm` table.

`TELEGRAM_CHAT_ID` is intentionally not part of the new env file. Telegram recipients should come from bot subscriptions saved in the database, not from one hardcoded global chat ID.

## Local Setup

Create the MySQL database:

```sql
CREATE DATABASE job_scraper CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Install dependencies and apply migrations:

```bash
npm install
npm run db:migrate
```

Run one manual scrape:

```bash
npm run scrape
```

Start the dashboard:

```bash
npm run dev
```

Open `http://localhost:3000`.

Start the scheduled worker in another terminal:

```bash
npm run dev:worker
```

## Docker

The main Docker Compose file is used for local Docker runs and production. It reads `.env` from the project root.

```bash
docker compose up -d --build
docker compose exec dashboard npm run db:migrate
```

Production on the VPS uses the same pattern from `/var/www/scraper`:

```bash
cd /var/www/scraper
docker compose up -d --build --force-recreate
docker compose exec dashboard npm run db:migrate
```

Useful project-only Docker commands:

```bash
cd /var/www/scraper

docker compose ps
docker compose logs -f --tail=100 dashboard
docker compose logs -f --tail=100 worker
docker compose restart worker
docker compose run --rm --no-deps worker npm run scrape
docker system df
docker builder du
docker builder prune
```

Avoid broad Docker cleanup commands on a shared server unless you have checked other projects first.

## Database Tables

### Job Identity Fields

- `sourceJobId`: the source website's own job ID or slug when the adapter can find one. It helps trace a row back to the original portal.
- `fingerprint`: a stable dedupe key built from company, title, and location. It is used when the apply URL is missing or changes.
- `firstSeenAt`: when this project first inserted the job.
- `lastSeenAt`: when this project last saw or refreshed the job during a scrape.

### Prisma Migration Table

`_prisma_migrations` is Prisma's internal migration history table. It records which migration files have already been applied, their checksums, timestamps, and failure/rollback state. Do not edit it manually unless you are deliberately repairing a migration problem.

### ScrapeRun Table

`ScrapeRun` is the scraper audit log. Each run records the source name, status, start time, finish time, jobs found, jobs created, jobs updated, and error text when a scraper fails. It is useful for checking whether a scheduled run actually happened and which adapter failed.

### Normalized Search Fields

- `SearchTerm.normalizedValue` is used now. It stores a cleaned lowercase canonical value of user terms so profile scrape tasks can be grouped by source + normalized term. For example, punctuation and casing are removed before known aliases are collapsed.
- `TaxonomyTerm.normalizedName` and `TaxonomyAlias.normalizedAlias` are schema groundwork for richer database-managed aliases later. They are not used by the current scraper matcher yet.

## Dashboard Authentication

When `TELEGRAM_BOT_TOKEN` is set, the dashboard requires Telegram login. Configure the bot username without `@`:

```env
TELEGRAM_BOT_TOKEN="..."
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="your_bot_username"
```

For production, set the login domain with BotFather using `/setdomain` so Telegram allows the login widget on your dashboard domain.

## Notifications

Disable notifications:

```env
NOTIFIER_PROVIDER="none"
```

Discord webhook delivery:

```env
NOTIFIER_PROVIDER="discord"
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

Telegram uses `TELEGRAM_BOT_TOKEN` for bot/profile subscriptions. The dashboard login widget also needs `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` without `@`. Global `TELEGRAM_CHAT_ID` delivery was removed so recipients can be stored per user.

Telegram bot subscription flow:

```text
User sends /start
-> worker polls Telegram getUpdates
-> TelegramUser is upserted
-> default SearchProfile is created
-> supported source buttons are shown
-> user selects portals and taps Done
-> user sends roles, skills, or keywords
-> SearchSource and SearchTerm rows are saved
```

The worker container must be running for `/start` to be processed. If the bot token has been posted publicly, rotate it in BotFather and update `TELEGRAM_BOT_TOKEN` in production.

```env
NOTIFIER_PROVIDER="telegram"
TELEGRAM_BOT_TOKEN="..."
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="your_bot_username"
```

Notification batching:

```env
NOTIFIER_TIMING="batch"
NOTIFIER_BATCH_SIZE="10"
NOTIFIER_TIME_ZONE="Asia/Yangon"
```

`batch` sends one message per full batch while a long scrape continues, then sends any remaining new jobs at the end.

## Multi-User Search Profiles

Search profiles are database-driven. There is no global env keyword list; the bot and dashboard use each Telegram user's saved profile.

Flow:

```text
/start
-> upsert TelegramUser by chat ID
-> create or load the user's SearchProfile
-> show supported source buttons
-> save selected SearchSource rows
-> ask for roles, skills, keywords, locations, or companies
-> save SearchTerm rows
-> group scrape work by source + normalized term
-> match jobs to profiles
-> write NotificationLog rows
-> send profile-specific notifications
```

New profile-oriented models already exist in the Prisma schema:

```text
TelegramUser
SearchProfile
SearchSource
SearchTerm
UserJobMatch
NotificationLog
TaxonomyTerm
TaxonomyAlias
```

The active implementation starts in these files:

1. `apps/worker/src/telegram-bot.ts` handles `/start`, source buttons, and term entry.
2. `packages/database/src/profiles.ts` saves users, selected sources, and normalized search terms.
3. `packages/scraper-core/src/profile-plan.ts` creates grouped scrape tasks.
4. `packages/scraper-core/src/orchestrator.ts` runs each grouped scrape once, upserts jobs, and sends profile-specific notifications.

## Add A New Supported Source

Create a scraper class in `packages/scraper-core/src/scrapers`:

```ts
import type { RawJob } from "@job-scraper/shared";
import type { ScrapeContext, Scraper } from "../types.js";

export class ExampleScraper implements Scraper {
  readonly name = "Example";
  readonly mode = "api" as const;

  async search(context: ScrapeContext): Promise<RawJob[]> {
    return [];
  }
}
```

Then register it through `packages/scraper-core/src/sources.ts` so users can select it by source key.

## Open Source

- [MIT License](LICENSE)
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Useful Commands

```bash
npm run dev              # dashboard
npm run dev:worker       # scheduled worker
npm run scrape           # one-shot scrape
npm run build            # build all workspaces
npm run typecheck        # typecheck all workspaces
npm run db:generate      # generate Prisma client
npm run db:migrate       # apply migrations
npm run db:studio        # open Prisma Studio
npm audit --omit=dev     # dependency audit
```
