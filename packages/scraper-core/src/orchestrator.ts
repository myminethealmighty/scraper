import { finishScrapeRun, startScrapeRun, upsertJobs } from "@job-aggregator/database";
import { type NotificationJob, type Notifier } from "@job-aggregator/notifier";
import {
  childLogger,
  getConfig,
  rawJobSchema,
  retry,
  sleep,
  type AppConfig,
} from "@job-aggregator/shared";
import { createScrapers } from "./registry.js";
import type { Scraper, ScrapeContext, ScrapeSummary } from "./types.js";

export async function runScrapers(options: {
  config?: AppConfig;
  scrapers?: Scraper[];
  notifier: Notifier;
}): Promise<ScrapeSummary[]> {
  const config = options.config ?? getConfig();
  const scrapers = options.scrapers ?? createScrapers();
  const log = childLogger({ module: "scraper-orchestrator" });
  const summaries: ScrapeSummary[] = [];
  const allCreated: NotificationJob[] = [];

  for (const scraper of scrapers) {
    for (const keyword of config.SCRAPER_KEYWORDS) {
      const sourceLog = log.child({ scraper: scraper.name, keyword });
      const run = await startScrapeRun(scraper.name);
      const context: ScrapeContext = {
        keyword,
        rateLimitMs: config.SCRAPER_RATE_LIMIT_MS,
        maxRetries: config.SCRAPER_MAX_RETRIES,
        headless: config.SCRAPER_HEADLESS
      };

      try {
        sourceLog.info("Starting scrape");
        const jobs = await retry(() => scraper.search(context), {
          retries: config.SCRAPER_MAX_RETRIES,
          delayMs: config.SCRAPER_RATE_LIMIT_MS,
          onRetry: (error, attempt) => sourceLog.warn({ err: error, attempt }, "Retrying scraper")
        });

        const validJobs = jobs
          .map((job) => rawJobSchema.safeParse(job))
          .filter((result) => {
            if (!result.success) sourceLog.warn({ validation: result.error.flatten() }, "Invalid job skipped");
            return result.success;
          })
          .map((result) => result.data);

        const result = await upsertJobs(validJobs);
        allCreated.push(
          ...result.created.map((job) => ({
            title: job.title,
            company: job.company,
            location: job.location,
            applyUrl: job.applyUrl,
            source: job.source
          }))
        );
        summaries.push({
          source: scraper.name,
          keyword,
          found: validJobs.length,
          created: result.created.length,
          updated: result.updated.length
        });

        await finishScrapeRun(run.id, {
          jobsFound: validJobs.length,
          jobsCreated: result.created.length,
          jobsUpdated: result.updated.length
        });
        sourceLog.info({ found: validJobs.length, created: result.created.length }, "Scrape finished");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sourceLog.error({ err: error }, "Scrape failed");
        await finishScrapeRun(run.id, {
          jobsFound: 0,
          jobsCreated: 0,
          jobsUpdated: 0,
          error: message
        });
      }

      await sleep(config.SCRAPER_RATE_LIMIT_MS);
    }
  }

  await options.notifier.notifyNewJobs(allCreated);

  return summaries;
}
