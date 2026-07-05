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
  const dispatcher = new NotificationDispatcher(options.notifier, config.NOTIFIER_TIMING, config.NOTIFIER_BATCH_SIZE);

  for (const scraper of scrapers) {
    const sourceCreated: NotificationJob[] = [];

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
        const createdJobs = result.created.map(toNotificationJob);
        sourceCreated.push(...createdJobs);
        await dispatcher.add(createdJobs);

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

    await dispatcher.flushSource(sourceCreated);
  }

  await dispatcher.flushEnd();

  return summaries;
}

function toNotificationJob(job: {
  title: string;
  company: string;
  location: string;
  salary: string | null;
  technologies: unknown;
  applyUrl: string;
  source: string;
}): NotificationJob {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    technologies: Array.isArray(job.technologies)
      ? job.technologies.filter((technology): technology is string => typeof technology === "string")
      : [],
    applyUrl: job.applyUrl,
    source: job.source
  };
}

class NotificationDispatcher {
  private readonly pending: NotificationJob[] = [];

  constructor(
    private readonly notifier: Notifier,
    private readonly timing: AppConfig["NOTIFIER_TIMING"],
    private readonly batchSize: number
  ) {}

  async add(jobs: NotificationJob[]): Promise<void> {
    if (jobs.length === 0) return;

    this.pending.push(...jobs);

    if (this.timing !== "batch") return;

    while (this.pending.length >= this.batchSize) {
      await this.notify(this.pending.splice(0, this.batchSize));
    }
  }

  async flushSource(jobs: NotificationJob[]): Promise<void> {
    if (this.timing !== "source" || jobs.length === 0) return;

    await this.notify(jobs);
    this.removeFromPending(jobs.length);
  }

  async flushEnd(): Promise<void> {
    if (this.pending.length === 0) return;

    if (this.timing === "end" || this.timing === "batch") {
      await this.notify(this.pending.splice(0));
    }
  }

  private async notify(jobs: NotificationJob[]): Promise<void> {
    try {
      await this.notifier.notifyNewJobs(jobs);
    } catch (error) {
      childLogger({ module: "notification-dispatcher" }).warn({ err: error }, "New-job notification failed");
    }
  }

  private removeFromPending(count: number): void {
    if (count > 0) this.pending.splice(0, count);
  }
}
