import { chromium } from "playwright";
import { compactText, extractTechnologies, type RawJob } from "@job-aggregator/shared";
import type { ScrapeContext, Scraper } from "../types.js";

export class WeWorkRemotelyPlaywrightScraper implements Scraper {
  readonly name = "We Work Remotely";
  readonly mode = "playwright" as const;

  async search(context: ScrapeContext): Promise<RawJob[]> {
    const browser = await chromium.launch({ headless: context.headless });
    const page = await browser.newPage();

    try {
      await page.goto(`https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(context.keyword)}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000
      });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

      const jobs = await page.$$eval("section.jobs li:not(.view-all)", (items) => {
        const parsed = items
          .map((item) => {
            const anchor = item.querySelector("a");
            const title = item.querySelector(".title")?.textContent?.trim() ?? "";
            const company = item.querySelector(".company")?.textContent?.trim() ?? "";
            const region = item.querySelector(".region")?.textContent?.trim() ?? "Remote";
            const tags = Array.from(item.querySelectorAll(".pill")).map((pill) => pill.textContent?.trim() ?? "");
            const href = anchor?.getAttribute("href") ?? "";
            const description = item.textContent?.replace(/\s+/g, " ").trim() ?? "";

            if (!title || !company || !href) return null;

            return {
              title,
              company,
              location: region,
              salary: null,
              employmentType: null,
              workMode: "REMOTE",
              postedAt: null,
              description,
              technologies: tags,
              applyUrl: href.startsWith("http") ? href : `https://weworkremotely.com${href}`,
              source: "We Work Remotely",
              sourceJobId: href.split("/").filter(Boolean).at(-1) ?? null
            };
          })
          .filter((job): job is NonNullable<typeof job> => job !== null);

        return parsed;
      });

      return jobs.map((job) => ({
          ...job,
          description: compactText(job.description ?? ""),
          technologies: [...job.technologies, ...extractTechnologies(`${job.title} ${job.description ?? ""}`)]
        })) as RawJob[];
    } finally {
      await browser.close();
    }
  }
}
