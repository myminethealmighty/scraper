import axios from "axios";
import { parseRemoteOkHtml } from "@job-scraper/parsers";
import type { RawJob } from "@job-scraper/shared";
import type { ScrapeContext, Scraper } from "../types.js";

export class RemoteOkScraper implements Scraper {
  readonly name = "Remote OK";
  readonly mode = "cheerio" as const;

  async search(context: ScrapeContext): Promise<RawJob[]> {
    const response = await axios.get<string>(
      `https://remoteok.com/remote-${encodeURIComponent(context.keyword.toLowerCase().replaceAll(" ", "-"))}-jobs`,
      {
        timeout: 20_000,
        headers: {
          "user-agent": "job-scraper/0.1 (+https://localhost)"
        }
      }
    );

    return parseRemoteOkHtml(response.data);
  }
}
