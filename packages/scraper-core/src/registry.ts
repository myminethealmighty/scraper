import { getSupportedJobSources } from "./sources.js";
import type { Scraper } from "./types.js";

export function createScrapers(): Scraper[] {
  return getSupportedJobSources().map((source) => source.createScraper());
}
