import { NextResponse } from "next/server";
import { getJobStats } from "@job-scraper/database";

export async function GET() {
  return NextResponse.json(await getJobStats());
}
