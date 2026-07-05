import { NextResponse } from "next/server";
import { listJobs } from "@job-scraper/database";
import { jobQuerySchema } from "@job-scraper/shared";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = jobQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  const jobs = await listJobs(query);

  return NextResponse.json(jobs);
}
