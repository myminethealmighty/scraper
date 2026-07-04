import axios from "axios";
import { extractTechnologies, type RawJob } from "@job-aggregator/shared";
import type { ScrapeContext, Scraper } from "../types.js";

type RemotiveResponse = {
  jobs: Array<{
    id: number;
    title: string;
    company_name: string;
    candidate_required_location: string;
    salary?: string;
    job_type?: string;
    publication_date?: string;
    description?: string;
    url: string;
    tags?: string[];
  }>;
};

export class RemotiveScraper implements Scraper {
  readonly name = "Remotive";
  readonly mode = "api" as const;

  async search(context: ScrapeContext): Promise<RawJob[]> {
    const response = await axios.get<RemotiveResponse>("https://remotive.com/api/remote-jobs", {
      params: { search: context.keyword },
      timeout: 20_000
    });

    return response.data.jobs.map((job) => {
      const description = stripHtml(job.description ?? "");
      return {
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location || "Remote",
        salary: job.salary || null,
        employmentType: job.job_type || null,
        workMode: "REMOTE",
        postedAt: job.publication_date ? new Date(job.publication_date) : null,
        description,
        technologies: [...(job.tags ?? []), ...extractTechnologies(`${job.title} ${description}`)],
        applyUrl: job.url,
        source: this.name,
        sourceJobId: String(job.id)
      };
    });
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
