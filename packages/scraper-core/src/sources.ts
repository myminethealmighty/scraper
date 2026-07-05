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

export type SupportedSourceKey =
  | "remotive"
  | "jobspace_mm"
  | "jobnet_mm"
  | "alote_mm"
  | "linkedin"
  | "jobsdb_th"
  | "jobsdb_sg"
  | "remote_ok"
  | "we_work_remotely";

export type SupportedJobSource = {
  key: SupportedSourceKey;
  name: string;
  baseUrl: string;
  mode: Scraper["mode"];
  buttonText: string;
  createScraper: () => Scraper;
};

export const supportedJobSources: SupportedJobSource[] = [
  {
    key: "remotive",
    name: "Remotive",
    baseUrl: "https://remotive.com",
    mode: "api",
    buttonText: "Remotive",
    createScraper: () => new RemotiveScraper()
  },
  {
    key: "jobspace_mm",
    name: "JobSpace Myanmar",
    baseUrl: "https://jobspace.com.mm",
    mode: "playwright",
    buttonText: "JobSpace MM",
    createScraper: createJobSpaceScraper
  },
  {
    key: "jobnet_mm",
    name: "JobNet Myanmar",
    baseUrl: "https://www.jobnet.com.mm",
    mode: "cheerio",
    buttonText: "JobNet MM",
    createScraper: createJobNetScraper
  },
  {
    key: "alote_mm",
    name: "Alote Myanmar",
    baseUrl: "https://www.alote.com.mm",
    mode: "cheerio",
    buttonText: "Alote MM",
    createScraper: createAloteScraper
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    baseUrl: "https://www.linkedin.com",
    mode: "playwright",
    buttonText: "LinkedIn",
    createScraper: createLinkedInScraper
  },
  {
    key: "jobsdb_th",
    name: "JobsDB Thailand",
    baseUrl: "https://th.jobsdb.com",
    mode: "playwright",
    buttonText: "JobsDB TH",
    createScraper: createJobsDbThailandScraper
  },
  {
    key: "jobsdb_sg",
    name: "JobsDB Singapore",
    baseUrl: "https://sg.jobsdb.com",
    mode: "playwright",
    buttonText: "JobsDB SG",
    createScraper: createJobsDbSingaporeScraper
  },
  {
    key: "remote_ok",
    name: "Remote OK",
    baseUrl: "https://remoteok.com",
    mode: "cheerio",
    buttonText: "Remote OK",
    createScraper: () => new RemoteOkScraper()
  },
  {
    key: "we_work_remotely",
    name: "We Work Remotely",
    baseUrl: "https://weworkremotely.com",
    mode: "playwright",
    buttonText: "WWR",
    createScraper: () => new WeWorkRemotelyPlaywrightScraper()
  }
];

const sourceByKey = new Map(supportedJobSources.map((source) => [source.key, source]));
const sourceByName = new Map(supportedJobSources.map((source) => [source.name, source]));

export function getSupportedJobSources(): SupportedJobSource[] {
  return supportedJobSources;
}

export function getSupportedSourceByKey(key: string): SupportedJobSource | null {
  return sourceByKey.get(key as SupportedSourceKey) ?? null;
}

export function getSupportedSourceByName(name: string): SupportedJobSource | null {
  return sourceByName.get(name) ?? null;
}

export function createScrapersForSourceKeys(sourceKeys: string[]): Scraper[] {
  const uniqueKeys = Array.from(new Set(sourceKeys));
  return uniqueKeys
    .map((key) => getSupportedSourceByKey(key))
    .filter((source): source is SupportedJobSource => source !== null)
    .map((source) => source.createScraper());
}
