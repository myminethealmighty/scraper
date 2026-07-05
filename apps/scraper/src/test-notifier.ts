import { createNotifier } from "@job-scraper/notifier";
import { getConfig, logger } from "@job-scraper/shared";

async function main() {
  const config = getConfig();
  const notifier = createNotifier(config);

  await notifier.notifyNewJobs([
    {
      title: "Telegram notifier test",
      company: "Job Scraper",
      location: "Local",
      salary: "$120 - $170 /hour",
      technologies: ["React", "TypeScript", "Node.js", "Laravel"],
      applyUrl: "http://localhost:3000",
      source: "System Test",
    },
  ]);

  logger.info("Notification test completed");
}

main().catch((error) => {
  logger.error({ err: error }, "Notification test failed");
  process.exitCode = 1;
});
