import { getPrisma } from "@job-aggregator/database";
import { createNotifier } from "@job-aggregator/notifier";
import { runScrapers } from "@job-aggregator/scraper-core";
import { getConfig, logger } from "@job-aggregator/shared";

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
