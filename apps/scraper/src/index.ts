import { getPrisma } from "@job-scraper/database";
import { runProfileScrapers } from "@job-scraper/scraper-core";
import { getConfig, logger } from "@job-scraper/shared";

async function main() {
  const config = getConfig();
  const summaries = await runProfileScrapers({ config });

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
