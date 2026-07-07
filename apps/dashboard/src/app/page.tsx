import {
  getJobStatsForTelegramUser,
  getResumeProfileForTelegramChat,
  listJobScoresForTelegramChat,
  listJobsForTelegramUser,
} from "@job-scraper/database";
import type { Prisma } from "@prisma/client";
import { jobQuerySchema } from "@job-scraper/shared";
import { getDashboardResumeTelegramId, getDashboardTelegramId, requireDashboardAuth } from "./auth";
import { DashboardClient } from "./components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireDashboardAuth();
  const telegramId = getDashboardTelegramId(session);
  const resumeTelegramId = getDashboardResumeTelegramId(session);
  const query = jobQuerySchema.parse({ pageSize: 10 });
  const [jobs, stats, resume] = await Promise.all([
    listJobsForTelegramUser(query, telegramId),
    getJobStatsForTelegramUser(telegramId),
    resumeTelegramId ? getResumeProfileForTelegramChat(resumeTelegramId) : null,
  ]);
  const scoreMap = resumeTelegramId
    ? await listJobScoresForTelegramChat(resumeTelegramId, jobs.items.map((job) => job.id))
    : new Map();

  return (
    <DashboardClient
      initialJobs={toClientPayload(withScores(jobs, scoreMap))}
      initialResume={toClientPayload(toResumeSummary(resume))}
      stats={stats}
      username={session?.username ? "@" + session.username : session?.firstName ?? null}
    />
  );
}

function toClientPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toResumeSummary(
  resume: {
    skills: Prisma.JsonValue;
    roles: Prisma.JsonValue;
    locations: Prisma.JsonValue;
    updatedAt: Date;
  } | null,
) {
  if (!resume) return null;

  return {
    skills: toStringArray(resume.skills),
    roles: toStringArray(resume.roles),
    locations: toStringArray(resume.locations),
    updatedAt: resume.updatedAt,
  };
}

function toStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function withScores<T extends { items: Array<{ id: string }> }>(
  jobs: T,
  scores: Map<string, { score: number; matchedSkills: string[]; matchedRoles: string[] }>,
): T {
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
