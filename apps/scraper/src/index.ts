import { getPrisma } from "@job-scraper/database";
import { createNotifier } from "@job-scraper/notifier";
import { runScrapers } from "@job-scraper/scraper-core";
import { getConfig, logger } from "@job-scraper/shared";

async function main() {
  const config = getConfig();
  const notifier = createNotifier(config);
  const summaries = await runScrapers({ config, notifier });

  logger.info({ summaries }, "Manual scrape completed");
}

main()
  .catch((error) => {
    logger.error({ error }, "Manual scrape failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
