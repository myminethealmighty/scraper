import axios from "axios";
import * as cheerio from "cheerio";
import { compactText, extractTechnologies, type RawJob } from "@job-aggregator/shared";
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
        "user-agent": "Mozilla/5.0 (compatible; job-aggregator/0.1)"
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

      const title = compactText(anchor.text());
      const container = anchor.closest("article, .job, .job-item, .serp-item, .card, li, tr, div");
      const description = compactText(container.text() || anchor.parent().text() || title);
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
        postedAt: null,
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
