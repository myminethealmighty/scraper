import { NextResponse } from "next/server";
import { getDashboardTelegramId, requireApiAuth, requireDashboardAuth } from "../../auth";
import { getJobStatsForTelegramUser } from "@job-scraper/database";

export async function GET() {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;
  const session = await requireDashboardAuth();
  return NextResponse.json(await getJobStatsForTelegramUser(getDashboardTelegramId(session)));
}
