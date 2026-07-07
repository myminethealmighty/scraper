import { NextResponse } from "next/server";
import { getDashboardTelegramId, requireApiAuth, requireDashboardAuth } from "../../auth";
import { listJobsForTelegramUser } from "@job-scraper/database";
import { jobQuerySchema } from "@job-scraper/shared";

export async function GET(request: Request) {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(request.url);
  const query = jobQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  const session = await requireDashboardAuth();
  const jobs = await listJobsForTelegramUser(query, getDashboardTelegramId(session));

  return NextResponse.json(jobs);
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const query = jobQuerySchema.parse(body);
  const session = await requireDashboardAuth();
  const jobs = await listJobsForTelegramUser(query, getDashboardTelegramId(session));

  return NextResponse.json(jobs);
}
