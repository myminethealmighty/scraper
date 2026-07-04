import { getPrisma } from "./prisma.js";

export async function startScrapeRun(source?: string) {
  return getPrisma().scrapeRun.create({
    data: {
      source,
      status: "RUNNING"
    }
  });
}

export async function finishScrapeRun(
  id: string,
  data: { jobsFound: number; jobsCreated: number; jobsUpdated: number; error?: string }
) {
  return getPrisma().scrapeRun.update({
    where: { id },
    data: {
      finishedAt: new Date(),
      status: data.error ? "FAILED" : "SUCCEEDED",
      jobsFound: data.jobsFound,
      jobsCreated: data.jobsCreated,
      jobsUpdated: data.jobsUpdated,
      error: data.error
    }
  });
}

export async function listRecentRuns(limit = 20) {
  return getPrisma().scrapeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit
  });
}
