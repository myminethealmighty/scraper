
# Changelog

All notable changes to this project will be documented here.

This project does not follow a formal release cycle yet.

## Unreleased

- Renamed the project to Job Scraper.
- Added MySQL/Prisma persistence and migrations.
- Added dashboard search, filters, pagination, and job actions.
- Added Telegram login for dashboard access when a bot token is configured.
- Added scraper registry, supported source catalog, and Playwright/Cheerio/API adapters.
- Added Docker and GitHub Actions deployment workflow.
- Added database-driven Telegram search profiles.
- Added Telegram source-selection and term-entry flow.
- Added profile-based scraping grouped by supported source and normalized search term.
- Added profile-based Telegram notifications with batching and duplicate-delivery protection.
- Removed the global `SCRAPER_KEYWORDS` env search flow; search terms now come from saved user profiles.
- Added search-term normalization for casing, punctuation, and common aliases such as `ReactJS` to `react`.
- Added privacy-first resume parsing and rule-based job scoring for dashboard and Telegram users.
- Added compact dashboard resume score sorting that appears only after a resume profile exists, with stable Search button text during loading.
- Added scrape health tracking, failure cooldowns, separate scrape/score/cleanup schedules, and 92-day cleanup for stale jobs and scrape-run history.
