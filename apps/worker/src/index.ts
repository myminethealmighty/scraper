import cron from "node-cron";
import { getPrisma } from "@job-scraper/database";
import { createNotifier } from "@job-scraper/notifier";
import { runScrapers } from "@job-scraper/scraper-core";
import { getConfig, logger } from "@job-scraper/shared";

const config = getConfig();
const notifier = createNotifier(config);
let running = false;

async function runScheduledScrape() {
  if (running) {
    logger.warn("Skipping scheduled scrape because previous run is still active");
    return;
  }

  running = true;
  try {
    const summaries = await runScrapers({ config, notifier });
    logger.info({ summaries }, "Scheduled scrape completed");
  } catch (error) {
    logger.error({ error }, "Scheduled scrape failed");
  } finally {
    running = false;
  }
}

logger.info({ cron: config.SCRAPER_CRON, timeZone: config.SCRAPER_TIME_ZONE }, "Starting job scraper worker");
cron.schedule(config.SCRAPER_CRON, runScheduledScrape, {
  timezone: config.SCRAPER_TIME_ZONE
});

if (process.env.RUN_ON_START !== "false") {
  void runScheduledScrape();
}

process.on("SIGTERM", async () => {
  logger.info("Worker shutting down");
  await getPrisma().$disconnect();
  process.exit(0);
});
