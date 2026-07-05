import { listGroupedScrapeTasks, type GroupedScrapeTask } from "@job-scraper/database";
import { getSupportedSourceByKey } from "./sources.js";
import type { Scraper } from "./types.js";

export type ProfileScrapePlanItem = GroupedScrapeTask & {
  scraper: Scraper;
};

export async function createProfileScrapePlan(): Promise<ProfileScrapePlanItem[]> {
  const tasks = await listGroupedScrapeTasks();

  return tasks
    .map((task) => {
      const source = getSupportedSourceByKey(task.sourceKey);
      if (!source) return null;

      return {
        ...task,
        sourceName: source.name,
        scraper: source.createScraper()
      };
    })
    .filter((task): task is ProfileScrapePlanItem => task !== null);
}
