import {
  finishScrapeRun,
  getPrisma,
  listTelegramNotificationRecipients,
  recordNotificationLog,
  startScrapeRun,
  upsertJobs
} from "@job-scraper/database";
import { TelegramNotifier, type NotificationJob } from "@job-scraper/notifier";
import {
  childLogger,
  getConfig,
  rawJobSchema,
  retry,
  sleep,
  type AppConfig,
} from "@job-scraper/shared";
import { createProfileScrapePlan, type ProfileScrapePlanItem } from "./profile-plan.js";
import type { ScrapeContext, ScrapeSummary } from "./types.js";

export async function runProfileScrapers(options: {
  config?: AppConfig;
}): Promise<ScrapeSummary[]> {
  const config = options.config ?? getConfig();
  const plan = await createProfileScrapePlan();

  if (plan.length === 0) {
    childLogger({ module: "scraper-orchestrator" }).info("No enabled profile scrape tasks found");
    return [];
  }

  return runPlannedProfileScrapes(plan, config);
}

async function runPlannedProfileScrapes(plan: ProfileScrapePlanItem[], config: AppConfig): Promise<ScrapeSummary[]> {
  const log = childLogger({ module: "profile-scraper-orchestrator" });
  const summaries: ScrapeSummary[] = [];

  for (const task of plan) {
    const sourceLog = log.child({ scraper: task.scraper.name, keyword: task.keyword, profiles: task.profileIds.length });
    const run = await startScrapeRun(task.scraper.name);
    const context: ScrapeContext = {
      keyword: task.keyword,
      rateLimitMs: config.SCRAPER_RATE_LIMIT_MS,
      maxRetries: config.SCRAPER_MAX_RETRIES,
      headless: config.SCRAPER_HEADLESS
    };

    try {
      sourceLog.info("Starting profile scrape");
      const jobs = await retry(() => task.scraper.search(context), {
        retries: config.SCRAPER_MAX_RETRIES,
        delayMs: config.SCRAPER_RATE_LIMIT_MS,
        onRetry: (error, attempt) => sourceLog.warn({ err: error, attempt }, "Retrying scraper")
      });

      const validJobs = jobs
        .map((job) => rawJobSchema.safeParse(job))
        .filter((result) => {
          if (!result.success) sourceLog.warn({ validation: result.error.flatten() }, "Invalid job skipped");
          return result.success;
        })
        .map((result) => result.data);

      const freshJobs = validJobs.filter((job) => isRecentEnough(job.postedAt ?? null, config.SCRAPER_MAX_JOB_AGE_DAYS));
      const matchingJobs = freshJobs.filter((job) => isMatchingJob(job, [task.keyword, task.normalizedKeyword]));
      const result = await upsertJobs(matchingJobs);

      await notifyProfileRecipients(result.created, task.profileIds, config);

      summaries.push({
        source: task.scraper.name,
        keyword: task.keyword,
        found: matchingJobs.length,
        created: result.created.length,
        updated: result.updated.length
      });

      await finishScrapeRun(run.id, {
        jobsFound: matchingJobs.length,
        jobsCreated: result.created.length,
        jobsUpdated: result.updated.length
      });
      sourceLog.info({ found: matchingJobs.length, created: result.created.length, updated: result.updated.length }, "Profile scrape finished");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sourceLog.error({ err: error }, "Profile scrape failed");
      await finishScrapeRun(run.id, {
        jobsFound: 0,
        jobsCreated: 0,
        jobsUpdated: 0,
        error: message
      });
    }

    await sleep(config.SCRAPER_RATE_LIMIT_MS);
  }

  return summaries;
}

async function notifyProfileRecipients(jobs: Awaited<ReturnType<typeof upsertJobs>>["created"], profileIds: string[], config: AppConfig) {
  if (jobs.length === 0) return;
  if (config.NOTIFIER_PROVIDER !== "telegram" || !config.TELEGRAM_BOT_TOKEN) return;

  const recipients = await listTelegramNotificationRecipients(profileIds);
  const jobIds = jobs.map((job) => job.id);

  for (const recipient of recipients) {
    const alreadySent = await getPrisma().notificationLog.findMany({
      where: {
        userId: recipient.userId,
        channel: "TELEGRAM",
        jobId: { in: jobIds }
      },
      select: { jobId: true }
    });
    const sentJobIds = new Set(alreadySent.map((log) => log.jobId).filter((jobId): jobId is string => Boolean(jobId)));
    const unsentJobs = jobs.filter((job) => !sentJobIds.has(job.id));

    if (unsentJobs.length === 0) continue;

    const notifier = new TelegramNotifier(config.TELEGRAM_BOT_TOKEN, [recipient.chatId], config.NOTIFIER_TIME_ZONE);
    for (const chunk of chunkArray(unsentJobs, config.NOTIFIER_BATCH_SIZE)) {
      await notifier.notifyNewJobs(chunk.map(toNotificationJob));
      for (const job of chunk) {
        try {
          await recordNotificationLog({
            userId: recipient.userId,
            profileId: recipient.profileIds[0] ?? null,
            jobId: job.id,
            channel: "TELEGRAM",
            recipient: recipient.chatId,
            status: "SENT"
          });
        } catch (error) {
          childLogger({ module: "profile-notification-dispatcher" }).warn({ err: error, jobId: job.id, userId: recipient.userId }, "Notification log write failed");
        }
      }
    }
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function isRecentEnough(postedAt: Date | null, maxAgeDays: number): boolean {
  if (!postedAt) return true;

  const newestAllowedAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return postedAt.getTime() >= Date.now() - newestAllowedAgeMs;
}
function toNotificationJob(job: {
  title: string;
  company: string;
  location: string;
  salary: string | null;
  technologies: unknown;
  applyUrl: string;
  source: string;
}): NotificationJob {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    technologies: Array.isArray(job.technologies)
      ? job.technologies.filter((technology): technology is string => typeof technology === "string")
      : [],
    applyUrl: job.applyUrl,
    source: job.source
  };
}

function isMatchingJob(job: {
  title: string;
  company: string;
  location: string;
  source: string;
  description?: string | null;
  technologies: string[];
}, keywords: string[]): boolean {
  const haystack = normalizeSearchText([
    job.title,
    job.company,
    job.location,
    job.source,
    job.description ?? "",
    ...job.technologies
  ].join(" "));

  return keywords.some((keyword) => matchesKeyword(haystack, keyword));
}

function matchesKeyword(haystack: string, keyword: string): boolean {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return false;

  return keywordAliases(normalizedKeyword).some((alias) => {
    const parts = alias.split(" ").filter(Boolean);
    if (parts.length === 0) return false;
    if (parts.length === 1) return hasToken(haystack, parts[0] ?? "");
    return parts.every((part) => hasToken(haystack, part));
  });
}

function keywordAliases(keyword: string): string[] {
  const aliases = new Set([keyword]);

  if (keyword === "react") {
    aliases.add("reactjs");
    aliases.add("react js");
  }
  if (keyword === "reactjs" || keyword === "react js") aliases.add("react");
  if (keyword === "next js") aliases.add("nextjs");
  if (keyword === "node js") aliases.add("nodejs");
  if (keyword === "type script") aliases.add("typescript");
  if (keyword === "java script") aliases.add("javascript");
  if (keyword === "front end") aliases.add("frontend");
  if (keyword === "back end") aliases.add("backend");
  if (keyword === "full stack") aliases.add("fullstack");

  return Array.from(aliases);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/c#/g, " csharp ")
    .replace(/\.js\b/g, " js")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasToken(haystack: string, token: string): boolean {
  return new RegExp("(?:^|\\s)" + escapeRegExp(token) + "(?:$|\\s)").test(haystack);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
