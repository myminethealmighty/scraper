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

export async function getScrapeHealth(source: string) {
  return getPrisma().scrapeHealth.findUnique({ where: { source } });
}

export async function markScrapeAttempt(source: string) {
  return getPrisma().scrapeHealth.upsert({
    where: { source },
    create: { source, lastAttemptAt: new Date() },
    update: { lastAttemptAt: new Date() }
  });
}

export async function markScrapeSuccess(source: string) {
  return getPrisma().scrapeHealth.upsert({
    where: { source },
    create: {
      source,
      lastAttemptAt: new Date(),
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      cooldownUntil: null,
      lastError: null
    },
    update: {
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      cooldownUntil: null,
      lastError: null
    }
  });
}

export async function markScrapeFailure(source: string, error: string, cooldownMs: number) {
  const existing = await getScrapeHealth(source);
  const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
  const cooldownUntil = consecutiveFailures >= 3
    ? new Date(Date.now() + cooldownMs * Math.min(consecutiveFailures, 8))
    : null;

  return getPrisma().scrapeHealth.upsert({
    where: { source },
    create: {
      source,
      lastAttemptAt: new Date(),
      consecutiveFailures,
      cooldownUntil,
      lastError: error
    },
    update: {
      consecutiveFailures,
      cooldownUntil,
      lastError: error
    }
  });
}

export async function listScrapeHealth() {
  return getPrisma().scrapeHealth.findMany({
    orderBy: [{ source: "asc" }]
  });
}

export async function deleteOldScrapeRuns(maxAgeDays: number) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  return getPrisma().scrapeRun.deleteMany({
    where: { startedAt: { lt: cutoff } }
  });
}
