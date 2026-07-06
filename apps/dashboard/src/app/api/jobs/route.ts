import { NextResponse } from "next/server";
import { getDashboardSession, requireApiAuth } from "../../auth";
import { listJobsForTelegramUser } from "@job-scraper/database";
import { jobQuerySchema } from "@job-scraper/shared";

export async function GET(request: Request) {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(request.url);
  const query = jobQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  const session = await getDashboardSession();
  const jobs = await listJobsForTelegramUser(query, session?.id);

  return NextResponse.json(jobs);
}
