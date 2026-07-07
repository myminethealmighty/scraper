import cron from "node-cron";
import { deleteOldJobs, deleteOldScrapeRuns, getPrisma, scoreAllResumeProfiles } from "@job-scraper/database";
import { runProfileScrapers } from "@job-scraper/scraper-core";
import { getConfig, logger } from "@job-scraper/shared";
import { startTelegramBot } from "./telegram-bot.js";

const config = getConfig();
startTelegramBot(config);
let scrapeRunning = false;
let scoreRunning = false;
let cleanupRunning = false;

async function runScheduledScrape() {
  if (scrapeRunning) {
    logger.warn("Skipping scheduled scrape because previous run is still active");
    return;
  }

  scrapeRunning = true;
  try {
    const summaries = await runProfileScrapers({ config });
    logger.info({ summaries }, "Scheduled scrape completed");
    await runScheduledScore();
  } catch (error) {
    logger.error({ error }, "Scheduled scrape failed");
  } finally {
    scrapeRunning = false;
  }
}

async function runScheduledScore() {
  if (scoreRunning) {
    logger.warn("Skipping scheduled scoring because previous run is still active");
    return;
  }

  scoreRunning = true;
  try {
    const results = await scoreAllResumeProfiles();
    logger.info({ profiles: results.length }, "Scheduled resume scoring completed");
  } catch (error) {
    logger.error({ error }, "Scheduled resume scoring failed");
  } finally {
    scoreRunning = false;
  }
}

async function runScheduledCleanup() {
  if (cleanupRunning) {
    logger.warn("Skipping scheduled cleanup because previous run is still active");
    return;
  }

  cleanupRunning = true;
  try {
    const [jobs, runs] = await Promise.all([
      deleteOldJobs(config.SCRAPER_MAX_JOB_AGE_DAYS),
      deleteOldScrapeRuns(config.SCRAPER_MAX_JOB_AGE_DAYS),
    ]);
    logger.info(
      { deletedJobs: jobs.count, deletedRuns: runs.count, maxAgeDays: config.SCRAPER_MAX_JOB_AGE_DAYS },
      "Scheduled cleanup completed",
    );
  } catch (error) {
    logger.error({ error }, "Scheduled cleanup failed");
  } finally {
    cleanupRunning = false;
  }
}

logger.info(
  {
    scrapeCron: config.SCRAPER_CRON,
    scoreCron: config.SCORE_CRON,
    cleanupCron: config.CLEANUP_CRON,
    timeZone: config.SCRAPER_TIME_ZONE
  },
  "Starting job scraper worker"
);
cron.schedule(config.SCRAPER_CRON, runScheduledScrape, {
  timezone: config.SCRAPER_TIME_ZONE
});
cron.schedule(config.SCORE_CRON, runScheduledScore, {
  timezone: config.SCRAPER_TIME_ZONE
});
cron.schedule(config.CLEANUP_CRON, runScheduledCleanup, {
  timezone: config.SCRAPER_TIME_ZONE
});

if (process.env.RUN_ON_START !== "false") {
  void runScheduledScrape();
  void runScheduledCleanup();
}

process.on("SIGTERM", async () => {
  logger.info("Worker shutting down");
  await getPrisma().$disconnect();
  process.exit(0);
});
