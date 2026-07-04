import axios from "axios";
import { extractTechnologies, type RawJob } from "@job-aggregator/shared";
import type { ScrapeContext, Scraper } from "../types.js";

type ArbeitnowResponse = {
  data: Array<{
    slug: string;
    company_name: string;
    title: string;
    description?: string;
    remote: boolean;
    url: string;
    tags?: string[];
    job_types?: string[];
    location?: string;
    created_at?: number;
  }>;
};

export class ArbeitnowScraper implements Scraper {
  readonly name = "Arbeitnow";
  readonly mode = "api" as const;

  async search(context: ScrapeContext): Promise<RawJob[]> {
    const response = await axios.get<ArbeitnowResponse>("https://www.arbeitnow.com/api/job-board-api", {
      timeout: 20_000
    });
    const keyword = context.keyword.toLowerCase();

    return response.data.data
      .filter((job) => `${job.title} ${job.description ?? ""} ${job.tags?.join(" ") ?? ""}`.toLowerCase().includes(keyword))
      .map((job) => {
        const description = stripHtml(job.description ?? "");
        return {
          title: job.title,
          company: job.company_name,
          location: job.location || (job.remote ? "Remote" : "Unknown"),
          salary: null,
          employmentType: job.job_types?.join(", ") || null,
          workMode: job.remote ? "REMOTE" : "UNKNOWN",
          postedAt: job.created_at ? new Date(job.created_at * 1000) : null,
          description,
          technologies: [...(job.tags ?? []), ...extractTechnologies(`${job.title} ${description}`)],
          applyUrl: job.url,
          source: this.name,
          sourceJobId: job.slug
        };
      });
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
