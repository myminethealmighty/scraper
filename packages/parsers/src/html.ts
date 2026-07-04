import * as cheerio from "cheerio";
import { compactText, extractTechnologies, type RawJob } from "@job-aggregator/shared";

export function parseRemoteOkHtml(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  $("tr.job").each((_, element) => {
    const row = $(element);
    const title = compactText(row.find("h2").first().text());
    const company = compactText(row.find("h3").first().text());
    const location = compactText(row.find(".location").first().text()) || "Remote";
    const href = row.attr("data-url") || row.find("a.preventLink").first().attr("href");
    const sourceJobId = row.attr("data-id") ?? null;

    if (!title || !company || !href) return;

    const applyUrl = href.startsWith("http") ? href : `https://remoteok.com${href}`;
    const description = compactText(row.text());
    const technologies = extractTechnologies(description);

    jobs.push({
      title,
      company,
      location,
      salary: compactText(row.find(".salary").first().text()) || null,
      employmentType: null,
      workMode: "REMOTE",
      postedAt: null,
      description,
      technologies,
      applyUrl,
      source: "Remote OK",
      sourceJobId
    });
  });

  return jobs;
}
