import { getJobStatsForTelegramUser, listJobsForTelegramUser } from "@job-scraper/database";
import { jobQuerySchema } from "@job-scraper/shared";
import { getDashboardTelegramId, requireDashboardAuth } from "./auth";
import { DashboardClient } from "./components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireDashboardAuth();
  const telegramId = getDashboardTelegramId(session);
  const query = jobQuerySchema.parse({ pageSize: 10 });
  const [jobs, stats] = await Promise.all([
    listJobsForTelegramUser(query, telegramId),
    getJobStatsForTelegramUser(telegramId)
  ]);

  return (
    <DashboardClient
      initialJobs={toClientPayload(jobs)}
      stats={stats}
      username={session?.username ? "@" + session.username : session?.firstName ?? null}
    />
  );
}

function toClientPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
