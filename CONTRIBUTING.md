# Contributing

Thanks for taking an interest in Job Scraper. The project is still early, so small, focused pull requests are easiest to review.

## Development Setup

1. Install Node.js 20 or newer.
2. Create a local MySQL database named `job_scraper`.
3. Copy `.env.example` to `.env` and update `DATABASE_URL`.
4. Install dependencies and run migrations:

```bash
npm install
npm run db:migrate
```

5. Run the dashboard or scraper:

```bash
npm run dev
npm run scrape
npm run dev:worker
```

## Before Opening A Pull Request

Run these checks locally:

```bash
npm run typecheck
npm audit --omit=dev
```

If your change touches Prisma models, add a migration and mention it in the pull request.

## Pull Request Guidelines

- Keep changes focused on one topic.
- Follow the existing package boundaries.
- Prefer supported source adapters over arbitrary URL scraping.
- Do not commit real tokens, chat IDs, database passwords, cookies, or scraped private data.
- Include screenshots when changing dashboard UI.
- Explain how you tested scraper changes, especially Playwright-based sources.

## Adding A Source Adapter

Add new sources through `packages/scraper-core/src/sources.ts` and implement the scraper in `packages/scraper-core/src/scrapers`. Each source should use the shared `Scraper` interface and return validated `RawJob` data.
