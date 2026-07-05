import { createAloteScraper, createJobNetScraper } from "./scrapers/generic-html.js";
import {
  createJobsDbSingaporeScraper,
  createJobsDbThailandScraper,
  createJobSpaceScraper,
  createLinkedInScraper
} from "./scrapers/generic-playwright.js";
import { RemotiveScraper } from "./scrapers/remotive.js";
import { RemoteOkScraper } from "./scrapers/remoteok.js";
import { WeWorkRemotelyPlaywrightScraper } from "./scrapers/wwr-playwright.js";
import type { Scraper } from "./types.js";

export function createScrapers(): Scraper[] {
  return [
    new RemotiveScraper(),
    createJobSpaceScraper(),
    createJobNetScraper(),
    createAloteScraper(),
    createLinkedInScraper(),
    createJobsDbThailandScraper(),
    createJobsDbSingaporeScraper(),
    new RemoteOkScraper(),
    new WeWorkRemotelyPlaywrightScraper()
  ];
}
