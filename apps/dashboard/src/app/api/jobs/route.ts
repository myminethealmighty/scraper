import { NextResponse } from "next/server";
import { getDashboardResumeTelegramId, getDashboardTelegramId, requireApiAuth, requireDashboardAuth } from "../../auth";
import { listJobScoresForTelegramChat, listJobsForTelegramUser } from "@job-scraper/database";
import { jobQuerySchema } from "@job-scraper/shared";

type JobsRequest = Record<string, unknown> & {
  resumeMatched?: unknown;
  matchScoreSort?: unknown;
};

type ScoredJob = {
  id: string;
  matchScore?: number | null;
  matchedSkills?: string[];
  matchedRoles?: string[];
};

const RESUME_MATCH_LOOKUP_LIMIT = 500;

export async function GET(request: Request) {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(request.url);
  const body = Object.fromEntries(searchParams.entries()) as JobsRequest;
  const query = jobQuerySchema.parse(body);
  const session = await requireDashboardAuth();
  const telegramId = getDashboardTelegramId(session);
  const scoreTelegramId = getDashboardResumeTelegramId(session);
  const jobs = await listJobsForTelegramUser(query, telegramId);
  const scoredJobs = await withScores(jobs, scoreTelegramId);

  return NextResponse.json(
    isResumeMatched(body)
      ? toResumeMatchedPage(scoredJobs, query.page, query.pageSize, getMatchScoreSort(body))
      : scoredJobs,
  );
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as JobsRequest;
  const query = jobQuerySchema.parse(body);
  const session = await requireDashboardAuth();
  const telegramId = getDashboardTelegramId(session);
  const scoreTelegramId = getDashboardResumeTelegramId(session);
  const lookupQuery = isResumeMatched(body)
    ? { ...query, page: 1, pageSize: RESUME_MATCH_LOOKUP_LIMIT }
    : query;
  const jobs = await listJobsForTelegramUser(lookupQuery, telegramId);
  const scoredJobs = await withScores(jobs, scoreTelegramId);

  return NextResponse.json(
    isResumeMatched(body)
      ? toResumeMatchedPage(scoredJobs, query.page, query.pageSize, getMatchScoreSort(body))
      : scoredJobs,
  );
}

async function withScores<T extends { items: Array<{ id: string }> }>(
  jobs: T,
  telegramId: string | undefined,
) {
  if (!telegramId) return jobs;

  const scores = await listJobScoresForTelegramChat(telegramId, jobs.items.map((job) => job.id));
  return {
    ...jobs,
    items: jobs.items.map((job) => ({
      ...job,
      matchScore: scores.get(job.id)?.score ?? null,
      matchedSkills: scores.get(job.id)?.matchedSkills ?? [],
      matchedRoles: scores.get(job.id)?.matchedRoles ?? [],
    })),
  };
}

function isResumeMatched(body: JobsRequest): boolean {
  return body.resumeMatched === true || body.resumeMatched === "true";
}

function getMatchScoreSort(body: JobsRequest): "asc" | "desc" {
  return body.matchScoreSort === "asc" ? "asc" : "desc";
}

function toResumeMatchedPage<T extends { items: ScoredJob[]; pageSize: number }>(
  jobs: T,
  page: number,
  pageSize: number,
  sortDirection: "asc" | "desc",
) {
  const matches = jobs.items
    .filter((job) => typeof job.matchScore === "number" && job.matchScore > 0)
    .sort((a, b) =>
      sortDirection === "asc"
        ? (a.matchScore ?? 0) - (b.matchScore ?? 0)
        : (b.matchScore ?? 0) - (a.matchScore ?? 0),
    );
  const start = (page - 1) * pageSize;
  const items = matches.slice(start, start + pageSize);

  return {
    ...jobs,
    items,
    total: matches.length,
    page,
    pageSize,
    pages: Math.ceil(matches.length / pageSize),
  };
}
