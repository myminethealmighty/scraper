import type { RawJob } from "@job-scraper/shared";

export type ScrapeContext = {
  keyword: string;
  rateLimitMs: number;
  maxRetries: number;
  headless: boolean;
};

export interface Scraper {
  readonly name: string;
  readonly mode: "api" | "cheerio" | "playwright";
  search(context: ScrapeContext): Promise<RawJob[]>;
}

export type ScrapeSummary = {
  source: string;
  keyword: string;
  found: number;
  created: number;
  updated: number;
};
