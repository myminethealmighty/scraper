import { chromium, type Page } from "playwright";
import { compactText, extractTechnologies, type RawJob } from "@job-aggregator/shared";
import type { ScrapeContext, Scraper } from "../types.js";

type PlaywrightBoardConfig = {
  name: string;
  baseUrl: string;
  searchUrl: (keyword: string) => string;
  linkIncludes: string[];
  defaultLocation: string;
  waitForSelector?: string;
  enrichDetails?: boolean;
  detailSearchLimit?: number;
  salarySelectors?: string[];
};

type PlaywrightListJob = {
  title: string;
  description: string;
  applyUrl: string;
  salary?: string | null;
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

      const jobs = (await page.$$eval(
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
      )) as PlaywrightListJob[];

      const enrichedJobs = this.config.enrichDetails
        ? await enrichJobsWithDetails(page, jobs, this.config)
        : jobs;

      return enrichedJobs.map((job) => ({
        title: cleanJobTitle(job.title),
        company: inferCompany(job.description, job.title),
        location: inferLocation(job.description) || this.config.defaultLocation,
        salary: job.salary ?? inferSalary(job.description),
        employmentType: inferEmploymentType(job.description),
        workMode: inferWorkMode(job.description),
        postedAt: inferPostedAt(job.description),
        description: cleanJobDescription(job.description),
        technologies: extractTechnologies(`${cleanJobTitle(job.title)} ${cleanJobDescription(job.description)}`),
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
    waitForSelector: "a[href*='/jobs/view/']",
    enrichDetails: true,
    detailSearchLimit: 12
  });
}

export function createJobsDbThailandScraper(): Scraper {
  return new GenericPlaywrightJobBoardScraper({
    name: "JobsDB Thailand",
    baseUrl: "https://th.jobsdb.com",
    searchUrl: (keyword) => `https://th.jobsdb.com/jobs?keywords=${encodeURIComponent(keyword)}`,
    linkIncludes: ["/job/"],
    defaultLocation: "Thailand",
    enrichDetails: true,
    detailSearchLimit: 12,
    salarySelectors: ['[data-automation="job-detail-salary"]']
  });
}

export function createJobsDbSingaporeScraper(): Scraper {
  return new GenericPlaywrightJobBoardScraper({
    name: "JobsDB Singapore",
    baseUrl: "https://sg.jobsdb.com",
    searchUrl: (keyword) => `https://sg.jobsdb.com/jobs?keywords=${encodeURIComponent(keyword)}`,
    linkIncludes: ["/job/"],
    defaultLocation: "Singapore",
    enrichDetails: true,
    detailSearchLimit: 12,
    salarySelectors: ['[data-automation="job-detail-salary"]']
  });
}

async function enrichJobsWithDetails(
  page: Page,
  jobs: PlaywrightListJob[],
  config: PlaywrightBoardConfig
): Promise<PlaywrightListJob[]> {
  const limit = config.detailSearchLimit ?? jobs.length;
  const enrichedJobs: PlaywrightListJob[] = [];

  for (const [index, job] of jobs.entries()) {
    if (index >= limit) {
      enrichedJobs.push(job);
      continue;
    }

    try {
      await page.goto(job.applyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

      const detail = await page.evaluate((salarySelectors) => {
        const salaryText =
          salarySelectors
            .map((selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? "")
            .find(Boolean) ?? "";
        document.querySelectorAll("script,style,noscript,template,svg").forEach((element) => element.remove());
        const bodyText = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";

        return { salaryText, bodyText };
      }, config.salarySelectors ?? []);

      const detailDescription = cleanJobDescription(detail.bodyText || job.description).slice(0, 12_000);
      const salary = inferSalary(`${detail.salaryText} ${detail.bodyText}`) ?? job.salary ?? inferSalary(job.description);

      enrichedJobs.push({
        ...job,
        description: detailDescription || job.description,
        salary
      });
    } catch {
      enrichedJobs.push(job);
    }
  }

  return enrichedJobs;
}

function cleanJobTitle(value: string): string {
  return compactText(value.replace(/\b\S*_with_bool_\S*\b/g, " "));
}

function cleanJobDescription(value: string): string {
  return compactText(
    value
      .replace(/\b\S*_with_bool_\S*\b/g, " ")
      .replace(/^\(\(env,\s*targets\).*$/s, " ")
  );
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
  const currencyAmount = String.raw`(?:(?:MMK|USD|SGD|THB)\s*)?[$฿€£]\s*\d[\d,.]*(?:\.\d+)?\s?[kKmM]?`;
  const codeAmount = String.raw`(?:MMK|USD|SGD|THB)\s*\d[\d,.]*(?:\.\d+)?\s?[kKmM]?`;
  const period = String.raw`(?:\s*(?:/|per)\s*(?:yr|year|month|mo|hour|hr))?`;
  const rangeTail = String.raw`(?:\s*[-–]\s*(?:(?:MMK|USD|SGD|THB)\s*)?[$฿€£]?\s*\d[\d,.]*(?:\.\d+)?\s?[kKmM]?(?:\s*(?:/|per)\s*(?:yr|year|month|mo|hour|hr))?)?`;
  const trailingPeriod = String.raw`(?:\s*per\s+\w+)?`;
  const match = text.match(new RegExp(`(?:${currencyAmount}|${codeAmount})${period}${rangeTail}${trailingPeriod}`, "i"));

  return match ? compactText(match[0]) : null;
}

function inferPostedAt(text: string): Date | null {
  const now = new Date();
  const relative = text.match(/(?:posted\s*)?(\d+)\+?\s*(minute|hour|day|week|month|year)s?\s+ago/i);
  if (relative) {
    const amount = Number(relative[1] ?? 0);
    const unit = (relative[2] ?? "day").toLowerCase();
    const multipliers: Record<string, number> = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };

    const multiplier = multipliers[unit] ?? 24 * 60 * 60 * 1000;
    return new Date(now.getTime() - amount * multiplier);
  }

  if (/posted\s+today|today/i.test(text)) return now;
  if (/posted\s+yesterday|yesterday/i.test(text)) return new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const absolute = text.match(/(?:posted\s*(?:on)?\s*)?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
  if (absolute) {
    const parsed = new Date(absolute[1] ?? "");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
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
