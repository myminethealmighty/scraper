import { chromium } from "playwright";
import { compactText, extractTechnologies, type RawJob } from "@job-aggregator/shared";
import type { ScrapeContext, Scraper } from "../types.js";

type PlaywrightBoardConfig = {
  name: string;
  baseUrl: string;
  searchUrl: (keyword: string) => string;
  linkIncludes: string[];
  defaultLocation: string;
  waitForSelector?: string;
};

export class GenericPlaywrightJobBoardScraper implements Scraper {
  readonly mode = "playwright" as const;
  readonly name: string;

  constructor(private readonly config: PlaywrightBoardConfig) {
    this.name = config.name;
  }

  async search(context: ScrapeContext): Promise<RawJob[]> {
    const browser = await chromium.launch({ headless: context.headless });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
    });

    try {
      await page.goto(this.config.searchUrl(context.keyword), {
        waitUntil: "domcontentloaded",
        timeout: 35_000
      });

      if (this.config.waitForSelector) {
        await page.waitForSelector(this.config.waitForSelector, { timeout: 15_000 }).catch(() => undefined);
      } else {
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      }

      const jobs = await page.$$eval(
        "a[href]",
        (anchors, config) => {
          const seen = new Set<string>();
          const results = [];

          for (const anchor of anchors) {
            const href = anchor.getAttribute("href") ?? "";
            if (!config.linkIncludes.some((part) => href.includes(part))) continue;

            const url = new URL(href, config.baseUrl).toString();
            if (seen.has(url)) continue;

            const title = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
            if (title.length < 3 || title.length > 180) continue;

            const container = anchor.closest("article, li, [data-automation], [data-testid], .card, .job, div");
            const description = container?.textContent?.replace(/\s+/g, " ").trim() || title;

            const haystack = `${title} ${description}`.toLowerCase();
            const normalizedKeyword = config.keyword.toLowerCase();
            const keywordParts = normalizedKeyword.split(/\s+/).filter(Boolean);
            const isRelevant =
              haystack.includes(normalizedKeyword) ||
              (keywordParts.length > 1 && keywordParts.every((part) => haystack.includes(part)));

            if (isRelevant) {
              seen.add(url);
              results.push({ title, description, applyUrl: url });
            }
          }

          return results.slice(0, 25);
        },
        {
          baseUrl: this.config.baseUrl,
          linkIncludes: this.config.linkIncludes,
          keyword: context.keyword
        }
      );

      return jobs.map((job) => ({
        title: compactText(job.title),
        company: inferCompany(job.description, job.title),
        location: inferLocation(job.description) || this.config.defaultLocation,
        salary: inferSalary(job.description),
        employmentType: inferEmploymentType(job.description),
        workMode: inferWorkMode(job.description),
        postedAt: null,
        description: compactText(job.description),
        technologies: extractTechnologies(`${job.title} ${job.description}`),
        applyUrl: job.applyUrl,
        source: this.name,
        sourceJobId: job.applyUrl.split("/").filter(Boolean).at(-1) ?? null
      }));
    } finally {
      await browser.close();
    }
  }
}

export function createJobSpaceScraper(): Scraper {
  return new GenericPlaywrightJobBoardScraper({
    name: "JobSpace Myanmar",
    baseUrl: "https://jobspace.com.mm",
    searchUrl: (keyword) => `https://jobspace.com.mm/jobs?keyword=${encodeURIComponent(keyword)}`,
    linkIncludes: ["/jobs/", "/job/"],
    defaultLocation: "Myanmar"
  });
}

export function createLinkedInScraper(): Scraper {
  return new GenericPlaywrightJobBoardScraper({
    name: "LinkedIn",
    baseUrl: "https://www.linkedin.com",
    searchUrl: (keyword) =>
      `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent("Myanmar Thailand Singapore")}`,
    linkIncludes: ["/jobs/view/"],
    defaultLocation: "Myanmar / Thailand / Singapore",
    waitForSelector: "a[href*='/jobs/view/']"
  });
}

export function createJobsDbThailandScraper(): Scraper {
  return new GenericPlaywrightJobBoardScraper({
    name: "JobsDB Thailand",
    baseUrl: "https://th.jobsdb.com",
    searchUrl: (keyword) => `https://th.jobsdb.com/jobs?keywords=${encodeURIComponent(keyword)}`,
    linkIncludes: ["/job/"],
    defaultLocation: "Thailand"
  });
}

export function createJobsDbSingaporeScraper(): Scraper {
  return new GenericPlaywrightJobBoardScraper({
    name: "JobsDB Singapore",
    baseUrl: "https://sg.jobsdb.com",
    searchUrl: (keyword) => `https://sg.jobsdb.com/jobs?keywords=${encodeURIComponent(keyword)}`,
    linkIncludes: ["/job/"],
    defaultLocation: "Singapore"
  });
}

function inferCompany(description: string, title: string): string {
  const compact = compactText(description.replace(title, " "));
  const parts = compact.split(/\s{2,}| · | - |\n/).map(compactText).filter(Boolean);
  return parts.find((part) => part.length > 1 && part.length < 90 && !/apply|save|view|login/i.test(part)) ?? "Unknown";
}

function inferLocation(text: string): string | null {
  const match = text.match(/\b(Yangon|Mandalay|Naypyidaw|Myanmar|Bangkok|Thailand|Singapore|Remote|Hybrid)\b/i);
  return match?.[0] ?? null;
}

function inferSalary(text: string): string | null {
  const match = text.match(/(?:MMK|USD|SGD|THB|\$|฿)\s?[0-9,.]+(?:\s?[-–]\s?(?:MMK|USD|SGD|THB|\$|฿)?\s?[0-9,.]+)?/i);
  return match?.[0] ?? null;
}

function inferEmploymentType(text: string): string | null {
  const match = text.match(/\b(full[- ]time|part[- ]time|contract|internship|freelance|temporary)\b/i);
  return match?.[0] ?? null;
}

function inferWorkMode(text: string): RawJob["workMode"] {
  if (/remote/i.test(text)) return "REMOTE";
  if (/hybrid/i.test(text)) return "HYBRID";
  if (/onsite|on-site/i.test(text)) return "ONSITE";
  return "UNKNOWN";
}
