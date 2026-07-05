import axios from "axios";
import * as cheerio from "cheerio";
import { compactText, extractTechnologies, type RawJob } from "@job-scraper/shared";
import type { ScrapeContext, Scraper } from "../types.js";

type HtmlBoardConfig = {
  name: string;
  baseUrl: string;
  searchUrl: (keyword: string) => string;
  linkIncludes: string[];
  defaultLocation: string;
};

export class GenericHtmlJobBoardScraper implements Scraper {
  readonly mode = "cheerio" as const;
  readonly name: string;

  constructor(private readonly config: HtmlBoardConfig) {
    this.name = config.name;
  }

  async search(context: ScrapeContext): Promise<RawJob[]> {
    const response = await axios.get<string>(this.config.searchUrl(context.keyword), {
      timeout: 25_000,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; job-scraper/0.1)"
      }
    });

    return this.parse(response.data, context.keyword);
  }

  private parse(html: string, keyword: string): RawJob[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const jobs: RawJob[] = [];

    $("a[href]").each((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href") ?? "";
      if (!this.config.linkIncludes.some((part) => href.includes(part))) return;

      const applyUrl = new URL(href, this.config.baseUrl).toString();
      if (seen.has(applyUrl)) return;

      const title = cleanJobTitle(anchor.text());
      const container = anchor.closest("article, .job, .job-item, .serp-item, .card, li, tr, div");
      const description = cleanJobDescription(container.text() || anchor.parent().text() || title);
      if (!isRelevant(title, description, keyword)) return;

      const company = inferField(description, title) || "Unknown";

      seen.add(applyUrl);
      jobs.push({
        title,
        company,
        location: inferLocation(description) || this.config.defaultLocation,
        salary: inferSalary(description),
        employmentType: inferEmploymentType(description),
        workMode: inferWorkMode(description),
        postedAt: inferPostedAt(description),
        description,
        technologies: extractTechnologies(`${title} ${description}`),
        applyUrl,
        source: this.name,
        sourceJobId: applyUrl.split("/").filter(Boolean).at(-1) ?? null
      });
    });

    return jobs.slice(0, 25);
  }
}

export function createJobNetScraper(): Scraper {
  return new GenericHtmlJobBoardScraper({
    name: "JobNet Myanmar",
    baseUrl: "https://www.jobnet.com.mm",
    searchUrl: (keyword) => `https://www.jobnet.com.mm/jobs?kw=${encodeURIComponent(keyword)}`,
    linkIncludes: ["/job/"],
    defaultLocation: "Myanmar"
  });
}

export function createAloteScraper(): Scraper {
  return new GenericHtmlJobBoardScraper({
    name: "Alote Myanmar",
    baseUrl: "https://www.alote.com.mm",
    searchUrl: (keyword) => `https://www.alote.com.mm/en/jobs-in-myanmar?keyword=${encodeURIComponent(keyword)}`,
    linkIncludes: ["/en/job/"],
    defaultLocation: "Myanmar"
  });
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
function isRelevant(title: string, description: string, keyword: string): boolean {
  if (title.length < 3 || title.length > 180) return false;
  const haystack = `${title} ${description}`.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();
  const keywordParts = normalizedKeyword.split(/\s+/).filter(Boolean);

  if (haystack.includes(normalizedKeyword)) return true;
  return keywordParts.length > 1 && keywordParts.every((part) => haystack.includes(part));
}

function inferField(description: string, title: string): string | null {
  const cleaned = compactText(description.replace(title, " "));
  const lines = cleaned.split(/\s{2,}|\n/).map(compactText).filter(Boolean);
  return lines.find((line) => line.length > 1 && line.length < 90 && !/apply|save|login|register/i.test(line)) ?? null;
}

function inferLocation(text: string): string | null {
  const match = text.match(/\b(Yangon|Mandalay|Naypyidaw|Myanmar|Bangkok|Thailand|Singapore|Remote|Hybrid)\b/i);
  return match?.[0] ?? null;
}

function inferSalary(text: string): string | null {
  const match = text.match(/(?:MMK|USD|SGD|THB|\$|฿)\s?[0-9,.]+(?:\s?[-–]\s?(?:MMK|USD|SGD|THB|\$|฿)?\s?[0-9,.]+)?/i);
  return match?.[0] ?? null;
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
