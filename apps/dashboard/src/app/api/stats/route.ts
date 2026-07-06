import { NextResponse } from "next/server";
import { getDashboardSession, requireApiAuth } from "../../auth";
import { getJobStatsForTelegramUser } from "@job-scraper/database";

export async function GET() {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;
  const session = await getDashboardSession();
  return NextResponse.json(await getJobStatsForTelegramUser(session?.id));
}
